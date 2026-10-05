import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { IsString, IsUrl } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { StripeService } from './stripe.service';

class CreateCheckoutDto {
  @IsString()
  invoiceId!: string;

  /** Where Stripe redirects after successful payment */
  @IsString()
  successUrl!: string;

  /** Where Stripe redirects if the customer cancels */
  @IsString()
  cancelUrl!: string;
}

@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private stripeService: StripeService) {}

  @Get('stripe/status')
  @UseGuards(JwtAuthGuard)
  status() {
    return {
      success: true,
      data: { configured: this.stripeService.isConfigured() },
    };
  }

  /**
   * Create a Stripe Checkout Session for an invoice's outstanding balance.
   * Returns a URL to redirect the customer (or open in a new tab).
   */
  @Post('stripe/checkout')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('invoice.read')
  async createCheckout(@Req() req: any, @Body() dto: CreateCheckoutDto) {
    if (!dto.successUrl || !dto.cancelUrl) {
      throw new BadRequestException('successUrl and cancelUrl are required');
    }
    const result = await this.stripeService.createCheckoutSession(
      req.membership.organizationId,
      dto.invoiceId,
      { successUrl: dto.successUrl, cancelUrl: dto.cancelUrl },
    );
    return { success: true, data: result };
  }

  /**
   * Stripe webhook endpoint — must receive the raw body for signature verification.
   * Configure in Stripe Dashboard: POST https://your-api/api/v1/payments/stripe/webhook
   * Events: checkout.session.completed, checkout.session.expired
   */
  @Post('stripe/webhook')
  async webhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string | undefined,
    @Res() res: any,
  ) {
    try {
      // Prefer raw body (set by express middleware); fall back to JSON body
      const raw: Buffer | string =
        req.rawBody ||
        (Buffer.isBuffer(req.body) ? req.body : null) ||
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
      const result = await this.stripeService.handleWebhook(raw, signature);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { code: 'WEBHOOK_ERROR', message: err?.message || 'Webhook failed' },
      });
    }
  }
}
