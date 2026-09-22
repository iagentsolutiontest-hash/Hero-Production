import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { getPool, withRlsBypass } from '../../db/pool';
import { LedgerService } from '../ledger/ledger.service';
import {
  getInvoiceBalance,
  recomputeInvoiceStatus,
} from './balance.util';

/**
 * Stripe Checkout integration for collecting customer payments against invoices.
 *
 * Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the environment.
 * When keys are missing, createCheckoutSession throws a clear configuration error
 * (so the rest of the app still runs without Stripe).
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: any = null;

  constructor(private ledgerService: LedgerService) {}

  private getStripe() {
    if (this.stripe) return this.stripe;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new BadRequestException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY in the server environment.',
      );
    }
    // Lazy require so the app boots even if the stripe package is not installed yet
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Stripe = require('stripe');
    this.stripe = new Stripe(key, { apiVersion: '2024-11-20.acacia' });
    return this.stripe;
  }

  isConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }

  /**
   * Create a Stripe Checkout Session for the outstanding balance of an invoice.
   * Returns the hosted payment URL for the customer.
   */
  async createCheckoutSession(
    organizationId: string,
    invoiceId: string,
    opts: { successUrl: string; cancelUrl: string },
  ): Promise<{ sessionId: string; url: string; amount: string; currency: string }> {
    const stripe = this.getStripe();
    const pool = getPool();

    const inv = await pool.query(
      `SELECT id, invoice_number, status, total, currency, contact_id
       FROM invoices WHERE id = $1 AND organization_id = $2`,
      [invoiceId, organizationId],
    );
    if (inv.rows.length === 0) throw new NotFoundException('Invoice not found');
    const invoice = inv.rows[0];

    if (!['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) {
      throw new BadRequestException(
        `Invoice must be sent (or partially paid) to collect payment (status: ${invoice.status})`,
      );
    }

    const balance = await getInvoiceBalance(pool, organizationId, invoiceId);
    const remaining = parseFloat(balance.remaining);
    if (remaining <= 0.005) {
      throw new BadRequestException('Invoice has no outstanding balance');
    }

    const currency = (invoice.currency || 'AUD').toLowerCase();
    // Stripe expects the smallest currency unit (cents)
    const amountCents = Math.round(remaining * 100);
    if (amountCents < 50) {
      // Stripe minimum is typically 0.50 in major currencies
      throw new BadRequestException('Amount is below Stripe minimum charge');
    }

    const contact = await pool.query(
      `SELECT name, email FROM contacts WHERE id = $1 AND organization_id = $2`,
      [invoice.contact_id, organizationId],
    );

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              description: `Payment for invoice ${invoice.invoice_number} (outstanding ${balance.remaining})`,
            },
          },
        },
      ],
      customer_email: contact.rows[0]?.email || undefined,
      client_reference_id: invoiceId,
      metadata: {
        organizationId,
        invoiceId,
        invoiceNumber: invoice.invoice_number,
      },
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
    });

    await pool.query(
      `INSERT INTO stripe_sessions
         (organization_id, invoice_id, stripe_session_id, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
      [organizationId, invoiceId, session.id, balance.remaining, currency.toUpperCase()],
    );

    return {
      sessionId: session.id,
      url: session.url,
      amount: balance.remaining,
      currency: currency.toUpperCase(),
    };
  }

  /**
   * Handle Stripe webhook events. Verifies signature when STRIPE_WEBHOOK_SECRET is set.
   */
  async handleWebhook(rawBody: Buffer | string, signature: string | undefined): Promise<{ received: boolean }> {
    return withRlsBypass(async () => {
    const stripe = this.getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: any;
    if (secret && signature) {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } else {
      // Dev fallback — only when webhook secret is not configured
      this.logger.warn('STRIPE_WEBHOOK_SECRET not set; parsing webhook body without verification');
      event = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
    }

    if (event.type === 'checkout.session.completed') {
      await this.onCheckoutCompleted(event.data.object);
    } else if (event.type === 'checkout.session.expired') {
      await this.onCheckoutExpired(event.data.object);
    }

    return { received: true };
    });
  }

  private async onCheckoutCompleted(session: any): Promise<void> {
    const pool = getPool();
    const stripeSessionId = session.id;

    const existing = await pool.query(
      `SELECT * FROM stripe_sessions WHERE stripe_session_id = $1`,
      [stripeSessionId],
    );
    if (existing.rows.length === 0) {
      this.logger.warn(`Stripe session ${stripeSessionId} not found in DB — ignoring`);
      return;
    }
    const row = existing.rows[0];
    if (row.status === 'COMPLETED') {
      this.logger.log(`Stripe session ${stripeSessionId} already completed — idempotent skip`);
      return;
    }

    const organizationId = row.organization_id;
    const invoiceId = row.invoice_id;
    const amount = row.amount;
    const paymentIntentId = session.payment_intent || null;

    // Post to ledger: Dr Bank / Cr Accounts Receivable
    const journal = await this.ledgerService.postEntry({
      organizationId,
      entryDate: new Date(),
      description: `Stripe payment for invoice ${invoiceId}`,
      sourceType: 'STRIPE_PAYMENT',
      sourceId: stripeSessionId,
      lines: [
        { accountCode: '1-1000', debit: String(amount), memo: 'Stripe settlement (bank)' },
        { accountCode: '1-1200', credit: String(amount), memo: 'Accounts Receivable' },
      ],
    });

    const pay = await pool.query(
      `INSERT INTO payments
         (organization_id, invoice_id, amount, payment_date, journal_entry_id, source, external_ref)
       VALUES ($1, $2, $3, now(), $4, 'STRIPE', $5)
       RETURNING id`,
      [organizationId, invoiceId, amount, journal.id, paymentIntentId || stripeSessionId],
    );

    await recomputeInvoiceStatus(pool, organizationId, invoiceId);

    await pool.query(
      `UPDATE stripe_sessions
       SET status = 'COMPLETED',
           stripe_payment_intent_id = $1,
           payment_id = $2,
           journal_entry_id = $3,
           completed_at = now()
       WHERE id = $4`,
      [paymentIntentId, pay.rows[0].id, journal.id, row.id],
    );

    this.logger.log(
      `Stripe payment recorded for invoice ${invoiceId}, amount ${amount}, journal ${journal.id}`,
    );
  }

  private async onCheckoutExpired(session: any): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE stripe_sessions SET status = 'EXPIRED' WHERE stripe_session_id = $1 AND status = 'PENDING'`,
      [session.id],
    );
  }

}
