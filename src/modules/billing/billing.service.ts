import { Injectable, BadRequestException, ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { StripeService } from '../payments/stripe.service';

export type SubscriptionStatus = 'trialing' | 'active' | 'expired' | 'cancelled' | 'past_due';

export interface BillingStatus {
  status: SubscriptionStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  subscriptionCurrentPeriodEnd: string | null;
  amount: number;
  currency: string;
}

@Injectable()
export class BillingService {
  private readonly price = Number(process.env.SUBSCRIPTION_PRICE || '50');
  private readonly currency = (process.env.SUBSCRIPTION_CURRENCY || 'USD').toUpperCase();

  constructor(private readonly stripeService: StripeService) {}

  async getStatus(userId: string, organizationId: string): Promise<BillingStatus> {
    const pool = getPool();
    const membership = await pool.query(
      `SELECT 1 FROM memberships WHERE user_id = $1 AND organization_id = $2 AND is_active = TRUE`,
      [userId, organizationId],
    );
    if (membership.rows.length === 0) throw new ForbiddenException('You do not have access to this organization');

    const result = await pool.query(
      `SELECT subscription_status, trial_started_at, trial_ends_at, subscription_current_period_end
       FROM organizations WHERE id = $1 AND is_active = TRUE`,
      [organizationId],
    );
    if (result.rows.length === 0) throw new NotFoundException('Organization not found');

    const row = result.rows[0];
    const now = Date.now();
    const trialEnds = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
    const storedStatus = String(row.subscription_status || 'trialing') as SubscriptionStatus;
    const status: SubscriptionStatus = storedStatus === 'trialing' && trialEnds <= now ? 'expired' : storedStatus;
    const remaining = status === 'trialing' && trialEnds > now
      ? Math.max(0, Math.ceil((trialEnds - now) / 86400000))
      : 0;

    return {
      status,
      trialStartedAt: row.trial_started_at ? new Date(row.trial_started_at).toISOString() : null,
      trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : null,
      trialDaysRemaining: remaining,
      subscriptionCurrentPeriodEnd: row.subscription_current_period_end ? new Date(row.subscription_current_period_end).toISOString() : null,
      amount: this.price,
      currency: this.currency,
    };
  }

  async createCheckout(userId: string, organizationId: string, successUrl: string, cancelUrl: string) {
    if (!successUrl || !cancelUrl) throw new BadRequestException('successUrl and cancelUrl are required');
    await this.getStatus(userId, organizationId);
    return this.stripeService.createSubscriptionCheckoutSession(organizationId, successUrl, cancelUrl);
  }

  async assertActive(organizationId: string): Promise<void> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT subscription_status, trial_ends_at FROM organizations WHERE id = $1 AND is_active = TRUE`,
      [organizationId],
    );
    if (result.rows.length === 0) throw new NotFoundException('Organization not found');
    const row = result.rows[0];
    const status = String(row.subscription_status || 'trialing');
    const trialActive = status === 'trialing' && row.trial_ends_at && new Date(row.trial_ends_at).getTime() > Date.now();
    if (status === 'active' || trialActive) return;
    if (status === 'past_due') throw new HttpException('Your Hero Accounting subscription needs payment attention.', HttpStatus.PAYMENT_REQUIRED);
    throw new HttpException(row.trial_ends_at ? `Your 3-day Hero Accounting trial has ended. Please activate your ${this.currency} ${this.price}/month subscription to continue.` : `Payment is required to activate your ${this.currency} ${this.price}/month Hero Accounting subscription.`, HttpStatus.PAYMENT_REQUIRED);
  }

  async createPortalSession(userId: string, organizationId: string, returnUrl: string): Promise<{ url: string }> {
    if (!returnUrl) throw new BadRequestException('returnUrl is required');
    await this.getStatus(userId, organizationId);
    const pool = getPool();
    const result = await pool.query(
      `SELECT stripe_customer_id FROM organizations WHERE id = $1 AND is_active = TRUE`,
      [organizationId],
    );
    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) {
      throw new BadRequestException('No payment method is connected yet. Start checkout to add one.');
    }
    const stripe = this.stripeService.getStripeForBilling();
    const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { url: portal.url };
  }

  async listPaymentMethods(userId: string, organizationId: string) {
    await this.getStatus(userId, organizationId);
    const pool = getPool();
    const result = await pool.query(
      `SELECT stripe_customer_id FROM organizations WHERE id = $1 AND is_active = TRUE`,
      [organizationId],
    );
    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) return [];
    const stripe = this.stripeService.getStripeForBilling();
    const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
    return methods.data.map((m: any) => ({
      id: m.id,
      brand: m.card?.brand || 'card',
      last4: m.card?.last4 || '',
      expMonth: m.card?.exp_month || null,
      expYear: m.card?.exp_year || null,
    }));
  }

}
