import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { getEntityConfig, castFor, OpsEntityConfig } from './operations.registry';
import { LedgerService } from '../ledger/ledger.service';
import { toCents, fromCents } from '../../common/money';

function toParamValue(kind: string, value: unknown): unknown {
  if (kind === 'json') {
    return typeof value === 'string' ? value : JSON.stringify(value ?? {});
  }
  return value;
}

@Injectable()
export class OperationsService {
  constructor(private ledgerService: LedgerService) {}

  /** List all rows for an entity in this org, optionally filtered by exact-match query params. */
  async list(organizationId: string, entityKey: string, filters: Record<string, string>) {
    const config = getEntityConfig(entityKey);
    const pool = getPool();
    const clauses = ['organization_id = $1'];
    const values: unknown[] = [organizationId];

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === '') continue;
      if (!config.filterable.includes(key)) continue;
      const field = config.fields.find((f) => f.column === key);
      values.push(value);
      clauses.push(`${key} = $${values.length}${field ? castFor(field.kind) : ''}`);
    }

    const sql = `SELECT * FROM ${config.table} WHERE ${clauses.join(' AND ')} ORDER BY ${config.orderBy}`;
    const result = await pool.query(sql, values);
    return result.rows;
  }

  async getOne(organizationId: string, entityKey: string, id: string) {
    const config = getEntityConfig(entityKey);
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM ${config.table} WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`${config.key} record not found`);
    }
    return result.rows[0];
  }

  async create(organizationId: string, entityKey: string, body: Record<string, unknown>) {
    const config = getEntityConfig(entityKey);
    const pool = getPool();

    const columns: string[] = ['organization_id'];
    const placeholders: string[] = ['$1'];
    const values: unknown[] = [organizationId];

    for (const field of config.fields) {
      const provided = body[field.column];
      if (provided === undefined || provided === null || provided === '') {
        if (field.required && field.default === undefined) {
          throw new BadRequestException(`"${field.column}" is required`);
        }
        if (field.default === undefined) continue; // let the DB's own column default apply
        values.push(toParamValue(field.kind, field.default));
      } else {
        values.push(toParamValue(field.kind, provided));
      }
      columns.push(field.column);
      placeholders.push(`$${values.length}${castFor(field.kind)}`);
    }

    const sql = `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const result = await pool.query(sql, values);
    const row = result.rows[0];

    await this.runAfterCreate(organizationId, config, row);
    return row;
  }

  async update(organizationId: string, entityKey: string, id: string, body: Record<string, unknown>) {
    const config = getEntityConfig(entityKey);
    const pool = getPool();

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of config.fields) {
      if (!(field.column in body)) continue;
      const provided = body[field.column];
      values.push(toParamValue(field.kind, provided));
      setClauses.push(`${field.column} = $${values.length}${castFor(field.kind)}`);
    }

    if (setClauses.length === 0) {
      throw new BadRequestException('No updatable fields provided');
    }
    if (config.hasUpdatedAt) {
      setClauses.push('updated_at = now()');
    }

    values.push(id, organizationId);
    const sql = `UPDATE ${config.table} SET ${setClauses.join(', ')} WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`;
    const result = await pool.query(sql, values);
    if (result.rows.length === 0) {
      throw new NotFoundException(`${config.key} record not found`);
    }
    return result.rows[0];
  }

  async remove(organizationId: string, entityKey: string, id: string) {
    const config = getEntityConfig(entityKey);
    const pool = getPool();
    const result = await pool.query(
      `DELETE FROM ${config.table} WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [id, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`${config.key} record not found`);
    }
    return { id, deleted: true };
  }

  async bulkDelete(organizationId: string, entityKey: string, ids: string[]) {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.remove(organizationId, entityKey, id);
        deleted.push(id);
      } catch (err: any) {
        skipped.push({ id, reason: err?.message || 'Could not delete' });
      }
    }
    return { deleted, skipped };
  }

  /** Entity-specific side effects that a plain column INSERT can't express. */
  private async runAfterCreate(organizationId: string, config: OpsEntityConfig, row: any): Promise<void> {
    if (config.key === 'stock-movements') {
      const pool = getPool();
      // Signed quantity: positive increases stock, negative decreases it.
      await pool.query(
        `UPDATE products SET quantity_on_hand = quantity_on_hand + $1::numeric WHERE id = $2 AND organization_id = $3`,
        [row.quantity, row.product_id, organizationId],
      );
    }
  }

  // ---- Fixed asset actions (asset_ops.manage) ----

  /** Depreciation needs two accounts that aren't part of the standard
   * bootstrap set (ChartOfAccountsService's 6 defaults predate fixed
   * assets existing at all). Rather than a backfill migration that would
   * only help orgs created after it ran, this creates them on first use,
   * for any org old or new — idempotent via the same (org, code) unique
   * constraint every other account relies on. */
  private async getOrCreateDepreciationAccounts(organizationId: string): Promise<{ expenseCode: string; contraAssetCode: string }> {
    const pool = getPool();
    const ensure = async (code: string, name: string, type: string) => {
      const existing = await pool.query(`SELECT code FROM accounts WHERE organization_id = $1 AND code = $2`, [
        organizationId,
        code,
      ]);
      if (existing.rows.length > 0) return existing.rows[0].code;
      await pool.query(
        `INSERT INTO accounts (organization_id, code, name, type, is_system) VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (organization_id, code) DO NOTHING`,
        [organizationId, code, name, type],
      );
      return code;
    };
    const expenseCode = await ensure('6-2000', 'Depreciation Expense', 'EXPENSE');
    // Accumulated Depreciation is a contra-asset (reduces total assets) but
    // Hero's schema only has the 6 standard account types, no separate
    // "contra-asset" type — it's typed ASSET here and simply always
    // carries a credit balance through consistent posting, which is a
    // common simplified approach and still nets correctly on the balance
    // sheet and trial balance.
    const contraAssetCode = await ensure('1-1900', 'Accumulated Depreciation', 'ASSET');
    return { expenseCode, contraAssetCode };
  }

  /** Straight-line monthly depreciation, capped so accumulated depreciation
   * never exceeds cost - residual. Posts Dr Depreciation Expense /
   * Cr Accumulated Depreciation — previously this only updated a number
   * on the asset row with no ledger effect at all. */
  async runDepreciation(organizationId: string, assetId: string) {
    const pool = getPool();
    const asset = await this.getOne(organizationId, 'fixed-assets', assetId);
    if (asset.status !== 'ACTIVE') {
      throw new BadRequestException('Only active assets can be depreciated');
    }
    const cost = parseFloat(asset.cost);
    const residual = parseFloat(asset.residual_value);
    const usefulLifeMonths = Number(asset.useful_life_months) || 1;
    const accumulated = parseFloat(asset.accumulated_depreciation);
    const depreciableBase = Math.max(cost - residual, 0);
    const monthly = depreciableBase / usefulLifeMonths;
    const remaining = Math.max(depreciableBase - accumulated, 0);
    const amount = Math.min(monthly, remaining);

    if (amount <= 0) {
      return { asset, amountPosted: '0.00', message: 'Asset is already fully depreciated' };
    }

    const { expenseCode, contraAssetCode } = await this.getOrCreateDepreciationAccounts(organizationId);
    const amountStr = amount.toFixed(2);

    const journal = await this.ledgerService.postEntry({
      organizationId,
      entryDate: new Date(),
      description: `Depreciation: ${asset.name} (${asset.asset_code})`,
      sourceType: 'DEPRECIATION',
      sourceId: assetId,
      lines: [
        { accountCode: expenseCode, debit: amountStr, memo: asset.name },
        { accountCode: contraAssetCode, credit: amountStr, memo: asset.name },
      ],
    });

    const result = await pool.query(
      `UPDATE fixed_assets SET accumulated_depreciation = accumulated_depreciation + $1::numeric
       WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [amountStr, assetId, organizationId],
    );
    return { asset: result.rows[0], amountPosted: amountStr, journalEntryId: journal.id };
  }

  /** Disposing an asset posts the reverse of its net book value out of
   * Fixed Assets / Accumulated Depreciation, records any sale proceeds
   * against Bank (or a receivable if unpaid — simplified to Bank here),
   * and posts the resulting gain or loss to a dedicated account.
   * Previously this only flipped a status flag with no ledger effect. */
  async disposeAsset(
    organizationId: string,
    assetId: string,
    input: { disposalDate: string; proceeds?: string; reason?: string },
  ) {
    const pool = getPool();
    const asset = await this.getOne(organizationId, 'fixed-assets', assetId);
    if (asset.status === 'DISPOSED') {
      throw new BadRequestException('Asset already disposed');
    }

    const cost = parseFloat(asset.cost);
    const accumulated = parseFloat(asset.accumulated_depreciation);
    const netBookValue = cost - accumulated;
    const proceeds = parseFloat(input.proceeds ?? '0');
    const gainLoss = proceeds - netBookValue; // positive = gain, negative = loss

    const { contraAssetCode } = await this.getOrCreateDepreciationAccounts(organizationId);
    const gainLossCode = await (async () => {
      const code = gainLoss >= 0 ? '4-2000' : '6-3000';
      const name = gainLoss >= 0 ? 'Gain on Disposal of Asset' : 'Loss on Disposal of Asset';
      const type = gainLoss >= 0 ? 'REVENUE' : 'EXPENSE';
      const existing = await pool.query(`SELECT code FROM accounts WHERE organization_id = $1 AND code = $2`, [
        organizationId,
        code,
      ]);
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO accounts (organization_id, code, name, type, is_system) VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT (organization_id, code) DO NOTHING`,
          [organizationId, code, name, type],
        );
      }
      return code;
    })();

    // Dr Accumulated Depreciation (clear it), Dr/Cr Bank (proceeds),
    // Dr/Cr Gain-or-Loss (the balancing plug), Cr Fixed Asset at cost.
    // Fixed assets themselves aren't tracked as individual GL accounts in
    // this schema (they're rows in fixed_assets, not accounts), so the
    // "asset at cost" leg is represented via a dedicated clearing account
    // rather than a literal per-asset GL account.
    const assetClearingCode = await (async () => {
      const existing = await pool.query(`SELECT code FROM accounts WHERE organization_id = $1 AND code = $2`, [
        organizationId,
        '1-1800',
      ]);
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO accounts (organization_id, code, name, type, is_system) VALUES ($1, '1-1800', 'Fixed Assets (at cost)', 'ASSET', TRUE)
           ON CONFLICT (organization_id, code) DO NOTHING`,
          [organizationId],
        );
      }
      return '1-1800';
    })();

    const lines: { accountCode: string; debit?: string; credit?: string; memo: string }[] = [
      { accountCode: contraAssetCode, debit: accumulated.toFixed(2), memo: `Clear accumulated depreciation: ${asset.name}` },
      { accountCode: assetClearingCode, credit: cost.toFixed(2), memo: `Remove asset at cost: ${asset.name}` },
    ];
    if (proceeds > 0) {
      lines.push({ accountCode: '1-1000', debit: proceeds.toFixed(2), memo: 'Disposal proceeds' });
    }
    if (Math.abs(gainLoss) > 0.005) {
      if (gainLoss >= 0) {
        lines.push({ accountCode: gainLossCode, credit: gainLoss.toFixed(2), memo: 'Gain on disposal' });
      } else {
        lines.push({ accountCode: gainLossCode, debit: (-gainLoss).toFixed(2), memo: 'Loss on disposal' });
      }
    }

    const journal = await this.ledgerService.postEntry({
      organizationId,
      entryDate: new Date(input.disposalDate),
      description: `Disposal: ${asset.name} (${asset.asset_code})`,
      sourceType: 'ASSET_DISPOSAL',
      sourceId: assetId,
      lines,
    });

    const data = { ...(asset.data || {}), disposal: { date: input.disposalDate, proceeds: input.proceeds ?? '0.00', reason: input.reason ?? '', gainLoss: gainLoss.toFixed(2) } };
    const result = await pool.query(
      `UPDATE fixed_assets SET status = 'DISPOSED', data = $1::jsonb WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [JSON.stringify(data), assetId, organizationId],
    );
    return { asset: result.rows[0], journalEntryId: journal.id, gainLoss: gainLoss.toFixed(2) };
  }

  /** Posts every DRAFT opening-balance line for the org as ONE balanced
   * journal entry, then marks those rows POSTED. This is the real
   * counterpart to a business's opening trial balance when they first
   * move onto Hero — previously "opening balances" was pure data entry
   * with zero effect on the ledger, which made the feature worthless for
   * its actual purpose. */
  async postOpeningBalances(organizationId: string) {
    const pool = getPool();
    const draftRows = await pool.query(
      `SELECT ob.id, ob.debit, ob.credit, ob.memo, ob.effective_date, a.code AS account_code
       FROM opening_balances ob
       JOIN accounts a ON a.id = ob.account_id
       WHERE ob.organization_id = $1 AND ob.status = 'DRAFT'
       ORDER BY ob.effective_date, a.code`,
      [organizationId],
    );

    if (draftRows.rows.length === 0) {
      throw new BadRequestException('No draft opening balance lines to post.');
    }
    if (draftRows.rows.length < 2) {
      throw new BadRequestException(
        'At least two opening balance lines (a debit and a matching credit) are required to post a balanced entry.',
      );
    }

    const distinctDates = new Set(
      draftRows.rows.map((r) => new Date(r.effective_date).toISOString().slice(0, 10)),
    );
    if (distinctDates.size > 1) {
      throw new BadRequestException(
        'All draft opening balance lines being posted together must share the same effective date. Post different dates as separate batches.',
      );
    }

    let totalDebitCents = 0n;
    let totalCreditCents = 0n;
    const lines = draftRows.rows.map((r) => {
      const debit = parseFloat(r.debit) || 0;
      const credit = parseFloat(r.credit) || 0;
      totalDebitCents += toCents(String(debit));
      totalCreditCents += toCents(String(credit));
      return {
        accountCode: r.account_code,
        debit: debit > 0 ? String(debit) : undefined,
        credit: credit > 0 ? String(credit) : undefined,
        memo: r.memo || 'Opening balance',
      };
    });

    if (totalDebitCents !== totalCreditCents) {
      throw new BadRequestException(
        `Opening balances do not balance: total debits ${fromCents(totalDebitCents)}, total credits ${fromCents(totalCreditCents)}. Fix your draft lines before posting.`,
      );
    }

    const entryDate = draftRows.rows[0].effective_date;
    const journal = await this.ledgerService.postEntry({
      organizationId,
      entryDate: new Date(entryDate),
      description: 'Opening balances',
      sourceType: 'OPENING_BALANCE',
      lines,
    });

    await pool.query(
      `UPDATE opening_balances SET status = 'POSTED', journal_entry_id = $1, posted_at = now()
       WHERE id = ANY($2::uuid[])`,
      [journal.id, draftRows.rows.map((r) => r.id)],
    );

    return {
      journalEntryId: journal.id,
      linesPosted: draftRows.rows.length,
      totalDebit: fromCents(totalDebitCents),
    };
  }

  /** Approving an expense is the accounting event: it posts Dr Expense
   * (the account the user picked) / Cr Bank if paid immediately, or
   * Cr Accounts Payable if not — mirroring how bills work. Previously
   * "expenses" was pure data entry with zero ledger effect. */
  async approveExpense(organizationId: string, expenseId: string) {
    const pool = getPool();
    const expense = await this.getOne(organizationId, 'expenses', expenseId);

    if (expense.status !== 'DRAFT') {
      throw new BadRequestException(
        `Only a DRAFT expense can be approved (current status: ${expense.status})`,
      );
    }
    if (!expense.expense_account_id) {
      throw new BadRequestException(
        'Set expense_account_id (which expense category this hits) before approving.',
      );
    }

    const expenseAccount = await pool.query(`SELECT code FROM accounts WHERE id = $1 AND organization_id = $2`, [
      expense.expense_account_id,
      organizationId,
    ]);
    if (expenseAccount.rows.length === 0) {
      throw new BadRequestException('expense_account_id does not refer to an account in this organization.');
    }

    const total = (parseFloat(expense.amount) + parseFloat(expense.tax_amount || '0')).toFixed(2);

    let creditAccountCode: string;
    if (expense.paid_from_bank_account_id) {
      const bankAccount = await pool.query(
        `SELECT a.code FROM bank_accounts ba JOIN accounts a ON a.id = ba.gl_account_id
         WHERE ba.id = $1 AND ba.organization_id = $2`,
        [expense.paid_from_bank_account_id, organizationId],
      );
      if (bankAccount.rows.length === 0) {
        throw new BadRequestException('paid_from_bank_account_id does not refer to a bank account in this organization.');
      }
      creditAccountCode = bankAccount.rows[0].code;
    } else {
      creditAccountCode = '2-1000'; // Accounts Payable — unpaid, owed to the vendor
    }

    const journal = await this.ledgerService.postEntry({
      organizationId,
      entryDate: new Date(expense.expense_date),
      description: `Expense: ${expense.vendor_name || expense.description || expenseId}`,
      sourceType: 'EXPENSE',
      sourceId: expenseId,
      lines: [
        { accountCode: expenseAccount.rows[0].code, debit: total, memo: expense.description || 'Expense' },
        { accountCode: creditAccountCode, credit: total, memo: expense.paid_from_bank_account_id ? 'Paid from bank' : 'Owed to vendor' },
      ],
    });

    const result = await pool.query(
      `UPDATE expenses SET status = 'APPROVED', journal_entry_id = $1 WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [journal.id, expenseId, organizationId],
    );

    return { expense: result.rows[0], journalEntryId: journal.id };
  }

  // ---- Read-only computed reports over the operational tables ----

  async inventoryValuation(organizationId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, sku, name, quantity_on_hand, purchase_price,
              (quantity_on_hand * purchase_price) AS value
       FROM products WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
      [organizationId],
    );
    const totalValue = result.rows.reduce((sum, r) => sum + parseFloat(r.value || '0'), 0);
    return { rows: result.rows, totalValue: totalValue.toFixed(2) };
  }

  async cashFlowForecast(organizationId: string, months: number) {
    const pool = getPool();
    const inflows = await pool.query(
      `SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') AS month,
              COALESCE(SUM(total), 0) AS expected
       FROM invoices
       WHERE organization_id = $1 AND status IN ('SENT', 'PARTIALLY_PAID', 'OVERDUE')
         AND due_date >= date_trunc('month', now()) AND due_date < date_trunc('month', now()) + ($2 || ' months')::interval
       GROUP BY 1 ORDER BY 1`,
      [organizationId, months],
    );
    const outflows = await pool.query(
      `SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') AS month,
              COALESCE(SUM(total), 0) AS expected
       FROM bills
       WHERE organization_id = $1 AND status IN ('APPROVED', 'PARTIALLY_PAID')
         AND due_date >= date_trunc('month', now()) AND due_date < date_trunc('month', now()) + ($2 || ' months')::interval
       GROUP BY 1 ORDER BY 1`,
      [organizationId, months],
    );
    return { inflows: inflows.rows, outflows: outflows.rows };
  }

  async budgetVsActual(organizationId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT p.id AS project_id, p.code, p.name,
              COALESCE(SUM(pb.amount), 0) AS budgeted,
              COALESCE((SELECT SUM(pc.amount) FROM project_costs pc WHERE pc.project_id = p.id), 0) AS actual
       FROM projects p
       LEFT JOIN project_budgets pb ON pb.project_id = p.id
       WHERE p.organization_id = $1
       GROUP BY p.id, p.code, p.name
       ORDER BY p.name`,
      [organizationId],
    );
    return result.rows.map((r) => ({
      ...r,
      variance: (parseFloat(r.budgeted) - parseFloat(r.actual)).toFixed(2),
    }));
  }

  async analyticsSummary(organizationId: string) {
    const pool = getPool();
    const [contacts, invoices, bills, ar, ap] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM contacts WHERE organization_id = $1`, [organizationId]),
      pool.query(
        `SELECT status, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM invoices WHERE organization_id = $1 GROUP BY status`,
        [organizationId],
      ),
      pool.query(
        `SELECT status, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM bills WHERE organization_id = $1 GROUP BY status`,
        [organizationId],
      ),
      pool.query(
        `SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE organization_id = $1 AND status IN ('SENT','PARTIALLY_PAID','OVERDUE')`,
        [organizationId],
      ),
      pool.query(
        `SELECT COALESCE(SUM(total), 0) AS total FROM bills WHERE organization_id = $1 AND status IN ('APPROVED', 'PARTIALLY_PAID')`,
        [organizationId],
      ),
    ]);
    return {
      contactCount: Number(contacts.rows[0].n),
      invoicesByStatus: invoices.rows,
      billsByStatus: bills.rows,
      accountsReceivable: ar.rows[0].total,
      accountsPayable: ap.rows[0].total,
    };
  }
}
