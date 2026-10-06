import { BadRequestException, Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingService } from './billing.service';

class CheckoutDto {
  @IsString() successUrl!: string;
  @IsString() cancelUrl!: string;
}

@Controller('api/v1/billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('status')
  async status(@Req() req: { userId: string }, @Headers('x-organization-id') organizationId?: string) {
    if (!organizationId) throw new BadRequestException('Missing x-organization-id header');
    return { success: true, data: await this.billingService.getStatus(req.userId, organizationId) };
  }

  @Post('checkout')
  async checkout(
    @Req() req: { userId: string },
    @Headers('x-organization-id') organizationId: string | undefined,
    @Body() dto: CheckoutDto,
  ) {
    if (!organizationId) throw new BadRequestException('Missing x-organization-id header');
    return { success: true, data: await this.billingService.createCheckout(req.userId, organizationId, dto.successUrl, dto.cancelUrl) };
  }
}
