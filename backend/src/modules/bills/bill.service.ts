import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { LedgerService } from '../ledger/ledger.service';
import { CountryProviderRegistry } from '../country/country-provider.registry';
import { fromCents, toCents } from '../../common/money';
import { getBillBalance } from '../payments/balance.util';

export interface CreateBillLineInput {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateCode: string;
}

export interface CreateBillInput {
  contactId: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  lines: CreateBillLineInput[];
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'DRAFT'], // can be sent back to draft for correction
  APPROVED: ['PAID', 'PARTIALLY_PAID'],
  PARTIALLY_PAID: ['PAID'],
  PAID: [],
};

@Injectable()
export class BillService {
  constructor(
    private ledgerService: LedgerService,
    private countryProviderRegistry: CountryProviderRegistry,
  ) {}

  async create(organizationId: string, countryCode: string, input: CreateBillInput) {
    if (input.lines.length === 0) {
      throw new BadRequestException('A bill needs at least one line');
    }

    const provider = this.countryProviderRegistry.get(countryCode);
    if (!(input as any).currency) {
      (input as any).currency = provider.defaultCurrency;
    }
    let subtotalCents = 0n;
    let taxCents = 0n;
    const computedLines = input.lines.map((line) => {
      const qtyCents = toCents(line.quantity);
      const unitCents = toCents(line.unitPrice);
      const lineNetCents = (qtyCents * unitCents) / 100n;
      const taxResult = provider.calculateTax({
        amount: fromCents(lineNetCents),
        taxRateCode: line.taxRateCode,
        isTaxInclusive: false,
      });
      const lineTaxCents = toCents(taxResult.taxAmount);
      subtotalCents += lineNetCents;
      taxCents += lineTaxCents;
      return { ...line, lineTotal: fromCents(lineNetCents + lineTaxCents) };
    });

    const totalCents = subtotalCents + taxCents;
    const pool = getPool();

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS n FROM bills WHERE organization_id = $1`,
      [organizationId],
    );
    const billNumber = `BILL-${String(countResult.rows[0].n + 1).padStart(5, '0')}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const billResult = await client.query(
        `INSERT INTO bills
           (organization_id, contact_id, bill_number, issue_date, due_date, currency, status, subtotal, tax_total, total)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8, $9)
         RETURNING id, bill_number, status, subtotal, tax_total, total`,
        [
          organizationId,
          input.contactId,
          billNumber,
          input.issueDate,
          input.dueDate,
          input.currency,
          fromCents(subtotalCents),
          fromCents(taxCents),
          fromCents(totalCents),
        ],
      );
      const bill = billResult.rows[0];

      for (const line of computedLines) {
        await client.query(
          `INSERT INTO bill_lines (bill_id, description, quantity, unit_price, tax_rate, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            bill.id,
            line.description,
            line.quantity,
            line.unitPrice,
            provider.taxRates().find((r) => r.code === line.taxRateCode)?.rate ?? '0',
            line.lineTotal,
          ],
        );
      }

      await client.query('COMMIT');
      return bill;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async getBillOrThrow(organizationId: string, billId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, status, subtotal, tax_total, total FROM bills
       WHERE id = $1 AND organization_id = $2`,
      [billId, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Bill not found');
    }
    return result.rows[0];
  }

  private assertTransition(currentStatus: string, nextStatus: string): void {
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Cannot move bill from ${currentStatus} to ${nextStatus}. Valid transitions from ${currentStatus}: ${allowed.join(', ') || 'none'}`,
      );
    }
  }

  async submit(organizationId: string, billId: string) {
    const bill = await this.getBillOrThrow(organizationId, billId);
    this.assertTransition(bill.status, 'SUBMITTED');
    const pool = getPool();
    await pool.query(`UPDATE bills SET status = 'SUBMITTED' WHERE id = $1`, [billId]);
    return { billId, status: 'SUBMITTED' };
  }

  /** Approving a bill is the accounting event on the purchase side: it
   * posts Dr Expense / Dr GST (input tax credit) / Cr Accounts Payable,
   * in balance, via LedgerService.
   *
   * Simplification: this debits the same '2-2000' GST Payable account that
   * invoices credit, rather than a separate GST Receivable / input-tax-
   * credit account. That's a reasonable simplified model (the balance
   * nets to what's actually owed to the ATO), but a real BAS report needs
   * output GST and input GST credits reported separately — tracked as a
   * gap in docs/COUNTRY_CONFIGURATION.md, not silently assumed correct. */
  async approve(organizationId: string, billId: string) {
    const bill = await this.getBillOrThrow(organizationId, billId);
    this.assertTransition(bill.status, 'APPROVED');

    const lines: { accountCode: string; debit?: string; credit?: string; memo?: string }[] = [
      { accountCode: '6-1000', debit: bill.subtotal, memo: 'General Expenses' },
      { accountCode: '2-1000', credit: bill.total, memo: 'Accounts Payable' },
    ];
    const tax = String(bill.tax_total ?? '0');
    if (parseFloat(tax) > 0) {
      // Debit GST Payable (nets input credits against collections) — common AU simplification
      lines.splice(1, 0, { accountCode: '2-2000', debit: tax, memo: 'GST credit on purchase' });
    }

    const journalResult = await this.ledgerService.postEntry({
      organizationId,
      entryDate: new Date(),
      description: `Bill ${billId} approved`,
      sourceType: 'BILL',
      sourceId: billId,
      lines,
    });

    const pool = getPool();
    await pool.query(`UPDATE bills SET status = 'APPROVED' WHERE id = $1`, [billId]);

    return { billId, journalEntryId: journalResult.id, status: 'APPROVED' };
  }

  /** Paying a bill posts Dr Accounts Payable / Cr Bank for whatever is
   * still outstanding — not blindly the full bill total — so this stays
   * consistent with any partial payments already applied via bank
   * matching (see ReconciliationService). This is the "mark fully paid
   * right now" manual action; it always closes out the bill's entire
   * remaining balance in one go. */
  async pay(organizationId: string, billId: string) {
    const bill = await this.getBillOrThrow(organizationId, billId);
    this.assertTransition(bill.status, 'PAID');

    const pool = getPool();
    const balance = await getBillBalance(pool, organizationId, billId);
    const remaining = balance.remaining;

    const journalResult = await this.ledgerService.postEntry({
      organizationId,
      entryDate: new Date(),
      description: `Bill ${billId} paid`,
      sourceType: 'BILL_PAYMENT',
      sourceId: billId,
      lines: [
        { accountCode: '2-1000', debit: remaining, memo: 'Accounts Payable' },
        { accountCode: '1-1000', credit: remaining, memo: 'Business Bank Account' },
      ],
    });

    await pool.query(
      `INSERT INTO payments (organization_id, bill_id, amount, payment_date, journal_entry_id)
       VALUES ($1, $2, $3, now(), $4)`,
      [organizationId, billId, remaining, journalResult.id],
    );
    await pool.query(`UPDATE bills SET status = 'PAID' WHERE id = $1`, [billId]);

    return { billId, journalEntryId: journalResult.id, status: 'PAID' };
  }

  async listForOrg(organizationId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT b.id, b.bill_number, b.status, b.subtotal, b.tax_total, b.total,
              (b.total - COALESCE(p.paid, 0))::numeric(20,2) AS balance_remaining
       FROM bills b
       LEFT JOIN (SELECT bill_id, SUM(amount) AS paid FROM payments GROUP BY bill_id) p
         ON p.bill_id = b.id
       WHERE b.organization_id = $1 ORDER BY b.created_at DESC`,
      [organizationId],
    );
    return result.rows;
  }

  async getOne(organizationId: string, billId: string) {
    const bill = await this.getBillOrThrow(organizationId, billId);
    const pool = getPool();
    const balance = await getBillBalance(pool, organizationId, billId);
    return { ...bill, balance };
  }

  async deleteOne(organizationId: string, billId: string) {
    const bill = await this.getBillOrThrow(organizationId, billId);
    if (bill.status !== 'DRAFT' && bill.status !== 'SUBMITTED') {
      throw new BadRequestException(
        'Only draft or submitted bills can be deleted. Approved/paid bills stay in the ledger.',
      );
    }
    const pool = getPool();
    await pool.query(`DELETE FROM bill_lines WHERE bill_id = $1`, [billId]);
    await pool.query(`DELETE FROM bills WHERE id = $1 AND organization_id = $2`, [
      billId,
      organizationId,
    ]);
    return { billId, deleted: true };
  }

  async bulkDelete(organizationId: string, ids: string[]) {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteOne(organizationId, id);
        deleted.push(id);
      } catch (err: any) {
        skipped.push({ id, reason: err?.message || 'Could not delete' });
      }
    }
    return { deleted, skipped };
  }
}
