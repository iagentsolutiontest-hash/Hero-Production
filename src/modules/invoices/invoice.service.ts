import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { LedgerService } from '../ledger/ledger.service';
import { CountryProviderRegistry } from '../country/country-provider.registry';
import { fromCents, toCents } from '../../common/money';
import { getInvoiceBalance } from '../payments/balance.util';

export interface CreateInvoiceLineInput {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateCode: string;
}

export interface CreateInvoiceInput {
  contactId: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  lines: CreateInvoiceLineInput[];
  notes?: string;
}

@Injectable()
export class InvoiceService {
  constructor(
    private ledgerService: LedgerService,
    private countryProviderRegistry: CountryProviderRegistry,
  ) {}

  async create(organizationId: string, countryCode: string, input: CreateInvoiceInput) {
    if (input.lines.length === 0) {
      throw new BadRequestException('An invoice needs at least one line');
    }

    const provider = this.countryProviderRegistry.get(countryCode);
    if (!input.currency) {
      input.currency = provider.defaultCurrency;
    }
    let subtotalCents = 0n;
    let taxCents = 0n;
    const computedLines = input.lines.map((line) => {
      const qtyCents = toCents(line.quantity); // quantity treated as 2dp-safe count
      const unitCents = toCents(line.unitPrice);
      // lineNet = quantity * unitPrice, computed via cents*cents/100 to stay in integer domain
      const lineNetCents = (qtyCents * unitCents) / 100n;
      const taxResult = provider.calculateTax({
        amount: fromCents(lineNetCents),
        taxRateCode: line.taxRateCode,
        isTaxInclusive: false,
      });
      const lineTaxCents = toCents(taxResult.taxAmount);
      subtotalCents += lineNetCents;
      taxCents += lineTaxCents;
      return {
        ...line,
        lineTotal: fromCents(lineNetCents + lineTaxCents),
        lineNetCents,
        lineTaxCents,
      };
    });

    const totalCents = subtotalCents + taxCents;
    const pool = getPool();

    const numbering = provider.invoiceNumberingRules();
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS n FROM invoices WHERE organization_id = $1`,
      [organizationId],
    );
    const nextNumber = countResult.rows[0].n + 1;
    const invoiceNumber = `${numbering.prefix}-${String(nextNumber).padStart(numbering.padLength, '0')}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invoiceResult = await client.query(
        `INSERT INTO invoices
           (organization_id, contact_id, invoice_number, issue_date, due_date, currency, status, subtotal, tax_total, total, notes)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8, $9, $10)
         RETURNING id, invoice_number, status, subtotal, tax_total, total`,
        [
          organizationId,
          input.contactId,
          invoiceNumber,
          input.issueDate,
          input.dueDate,
          input.currency,
          fromCents(subtotalCents),
          fromCents(taxCents),
          fromCents(totalCents),
          input.notes ?? null,
        ],
      );
      const invoice = invoiceResult.rows[0];

      for (const line of computedLines) {
        await client.query(
          `INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, tax_rate, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            invoice.id,
            line.description,
            line.quantity,
            line.unitPrice,
            provider.taxRates().find((r) => r.code === line.taxRateCode)?.rate ?? '0',
            line.lineTotal,
          ],
        );
      }

      await client.query('COMMIT');
      return invoice;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Sending an invoice is the accounting event: it posts
   * Dr Accounts Receivable / Cr Revenue / Cr GST Payable, in balance, via
   * LedgerService — the single write path for the ledger. */
  async send(organizationId: string, invoiceId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, status, subtotal, tax_total, total FROM invoices
       WHERE id = $1 AND organization_id = $2`,
      [invoiceId, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Invoice not found');
    }
    const invoice = result.rows[0];
    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException(
        `Only DRAFT invoices can be sent (current status: ${invoice.status})`,
      );
    }

    const lines: { accountCode: string; debit?: string; credit?: string; memo?: string }[] = [
      { accountCode: '1-1200', debit: invoice.total, memo: 'Accounts Receivable' },
      { accountCode: '4-1000', credit: invoice.subtotal, memo: 'Sales Revenue' },
    ];
    // Only post GST when there is actual tax — a zero line confuses reports
    // and is unnecessary for a balanced entry.
    const tax = String(invoice.tax_total ?? '0');
    if (parseFloat(tax) > 0) {
      lines.push({ accountCode: '2-2000', credit: tax, memo: 'GST Payable' });
    }

    const journalResult = await this.ledgerService.postEntry({
      organizationId,
      entryDate: new Date(),
      description: `Invoice ${invoiceId} sent`,
      sourceType: 'INVOICE',
      sourceId: invoiceId,
      lines,
    });

    await pool.query(`UPDATE invoices SET status = 'SENT' WHERE id = $1`, [invoiceId]);

    return { invoiceId, journalEntryId: journalResult.id, status: 'SENT' };
  }


  /**
   * Void a sent (or partially paid) invoice: reverse its ledger entry and
   * mark status VOID. Paid invoices cannot be voided — issue a credit note
   * workflow in a later phase; for now we reject with a clear message.
   */
  async voidInvoice(organizationId: string, invoiceId: string, reason: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, status, invoice_number FROM invoices WHERE id = $1 AND organization_id = $2`,
      [invoiceId, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Invoice not found');
    }
    const invoice = result.rows[0];
    if (invoice.status === 'DRAFT') {
      // Draft was never posted — just mark void without ledger work
      await pool.query(`UPDATE invoices SET status = 'VOID' WHERE id = $1`, [invoiceId]);
      return { invoiceId, status: 'VOID', journalEntryId: null };
    }
    if (invoice.status === 'VOID') {
      throw new BadRequestException('Invoice is already void');
    }
    if (invoice.status === 'PAID') {
      throw new BadRequestException(
        'Paid invoices cannot be voided. Record a credit note / refund in a future release, or reverse via a manual journal.',
      );
    }

    // Find the original invoice journal entry
    const je = await pool.query(
      `SELECT id FROM journal_entries
       WHERE organization_id = $1 AND source_type = 'INVOICE' AND source_id = $2 AND status = 'POSTED'
       ORDER BY created_at ASC LIMIT 1`,
      [organizationId, invoiceId],
    );
    let journalEntryId: string | null = null;
    if (je.rows.length > 0) {
      const reversed = await this.ledgerService.reverseEntry(
        organizationId,
        je.rows[0].id,
        reason || `Void invoice ${invoice.invoice_number}`,
      );
      journalEntryId = reversed.id;
    }

    await pool.query(`UPDATE invoices SET status = 'VOID' WHERE id = $1`, [invoiceId]);
    return { invoiceId, status: 'VOID', journalEntryId };
  }

  /**
   * Issue a credit note against a SENT/PARTIALLY_PAID/PAID invoice.
   * Posts the inverse of the original invoice (Cr AR, Dr Revenue, Dr GST)
   * for the outstanding (or full) amount and records a negative payment
   * so balances stay consistent. Marks the invoice VOID when fully credited.
   */
  async creditNote(organizationId: string, invoiceId: string, reason: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, status, subtotal, tax_total, total, invoice_number
       FROM invoices WHERE id = $1 AND organization_id = $2`,
      [invoiceId, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Invoice not found');
    }
    const invoice = result.rows[0];
    if (!['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'].includes(invoice.status)) {
      throw new BadRequestException(
        `Credit notes can only be issued against sent/paid invoices (current: ${invoice.status})`,
      );
    }

    const balance = await getInvoiceBalance(pool, organizationId, invoiceId);
    const remaining = balance.remaining;
    if (parseFloat(remaining) <= 0 && invoice.status !== 'PAID') {
      throw new BadRequestException('Nothing left to credit on this invoice');
    }

    // Credit the full original total proportions for a full credit note when paid,
    // or the remaining balance share for open invoices.
    const creditTotal = invoice.status === 'PAID' ? invoice.total : remaining;
    const ratio = parseFloat(invoice.total) > 0 ? parseFloat(creditTotal) / parseFloat(invoice.total) : 1;
    const creditSub = (parseFloat(invoice.subtotal) * ratio).toFixed(2);
    const creditTax = (parseFloat(invoice.tax_total) * ratio).toFixed(2);

    const lines: { accountCode: string; debit?: string; credit?: string; memo?: string }[] = [
      { accountCode: '1-1200', credit: creditTotal, memo: 'AR credit note' },
      { accountCode: '4-1000', debit: creditSub, memo: 'Revenue reversal' },
    ];
    if (parseFloat(creditTax) > 0) {
      lines.push({ accountCode: '2-2000', debit: creditTax, memo: 'GST reversal' });
    }

    const journalResult = await this.ledgerService.postEntry({
      organizationId,
      entryDate: new Date(),
      description: reason || `Credit note for ${invoice.invoice_number}`,
      sourceType: 'CREDIT_NOTE',
      sourceId: invoiceId,
      lines,
    });

    // Record as a payment that reduces the outstanding balance
    await pool.query(
      `INSERT INTO payments (organization_id, invoice_id, amount, payment_date, journal_entry_id)
       VALUES ($1, $2, $3, now(), $4)`,
      [organizationId, invoiceId, creditTotal, journalResult.id],
    );

    await pool.query(`UPDATE invoices SET status = 'VOID' WHERE id = $1`, [invoiceId]);

    return {
      invoiceId,
      status: 'VOID',
      journalEntryId: journalResult.id,
      creditedAmount: creditTotal,
    };
  }

  /** Xero-style: permanently remove a draft or already-void invoice. Posted invoices must be voided first. */
  async deleteOne(organizationId: string, invoiceId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, status FROM invoices WHERE id = $1 AND organization_id = $2`,
      [invoiceId, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Invoice not found');
    }
    const status = result.rows[0].status as string;
    if (status !== 'DRAFT' && status !== 'VOID') {
      throw new BadRequestException(
        'Only draft or void invoices can be deleted. Void a sent invoice first, then delete it.',
      );
    }
    await pool.query(`DELETE FROM invoice_lines WHERE invoice_id = $1`, [invoiceId]);
    await pool.query(`DELETE FROM invoices WHERE id = $1 AND organization_id = $2`, [
      invoiceId,
      organizationId,
    ]);
    return { invoiceId, deleted: true };
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

  async bulkVoid(organizationId: string, ids: string[], reason?: string) {
    const voided: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.voidInvoice(organizationId, id, reason || 'Bulk void');
        voided.push(id);
      } catch (err: any) {
        skipped.push({ id, reason: err?.message || 'Could not void' });
      }
    }
    return { voided, skipped };
  }

  async duplicate(organizationId: string, invoiceId: string, countryCode: string) {
    const pool = getPool();
    const inv = await pool.query(
      `SELECT contact_id, currency, notes, issue_date, due_date
       FROM invoices WHERE id = $1 AND organization_id = $2`,
      [invoiceId, organizationId],
    );
    if (inv.rows.length === 0) throw new NotFoundException('Invoice not found');
    const lines = await pool.query(
      `SELECT description, quantity, unit_price, tax_rate
       FROM invoice_lines WHERE invoice_id = $1`,
      [invoiceId],
    );
    if (lines.rows.length === 0) {
      throw new BadRequestException('Invoice has no lines to copy');
    }
    const src = inv.rows[0];
    const provider = this.countryProviderRegistry.get(countryCode);
    const rates = provider.taxRates();
    const today = new Date();
    const due = new Date(today.getTime() + 14 * 86400000);
    return this.create(organizationId, countryCode, {
      contactId: src.contact_id,
      issueDate: today,
      dueDate: due,
      currency: src.currency,
      notes: src.notes,
      lines: lines.rows.map((l) => ({
        description: l.description,
        quantity: String(l.quantity),
        unitPrice: String(l.unit_price),
        taxRateCode:
          rates.find((r) => Number(r.rate) === Number(l.tax_rate))?.code ?? rates[0]?.code ?? 'GST',
      })),
    });
  }
}
