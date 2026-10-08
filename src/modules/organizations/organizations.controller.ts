import { Body, Controller, Get, Patch, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsIn, IsNumber } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembershipService } from '../tenancy/membership.service';
import { ChartOfAccountsService } from '../ledger/chart-of-accounts.service';
import { getPool, withRlsBypass } from '../../db/pool';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';

class CreateOrganizationDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsIn(['trial', 'monthly'])
  plan?: 'trial' | 'monthly';

  @IsOptional()
  @IsString()
  baseCurrency?: string;

  @IsOptional()
  @IsNumber()
  taxStandardRate?: number;

  @IsOptional()
  @IsNumber()
  taxFreeRate?: number;

  @IsOptional()
  @IsNumber()
  taxInputRate?: number;
}

@Controller('api/v1/organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(
    private membershipService: MembershipService,
    private chartOfAccountsService: ChartOfAccountsService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateOrganizationDto) {
    const { organizationId } = await this.membershipService.createOrganizationWithOwner(
      req.userId,
      dto.name,
      dto.countryCode ?? 'AU',
      dto.plan ?? 'trial',
      dto.baseCurrency,
      dto.taxStandardRate,
      dto.taxFreeRate,
      dto.taxInputRate,
    );
    // Every new org gets a standard chart of accounts immediately — you
    // can't post an invoice without accounts to post it against.
    // Wrap in withRlsBypass because the user might not have the org set in their context yet
    await withRlsBypass(async () => {
      await this.chartOfAccountsService.bootstrapStandardAccounts(organizationId);
    });
    return { success: true, data: { organizationId, trialDays: dto.plan === 'trial' ? 3 : 0, plan: dto.plan ?? 'trial' } };
  }

  @Patch('current')
  @UseGuards(PermissionsGuard)
  @RequirePermission('org.manage')
  async updateCurrent(@Req() req: any, @Body() dto: CreateOrganizationDto) {
    const countryCode = String(dto.countryCode || '').trim().toUpperCase();
    if (!countryCode) throw new BadRequestException('Country is required');
    const pool = getPool();
    const result = await pool.query(
      `UPDATE organizations SET
         name = COALESCE(NULLIF($1, ''), name),
         country_code = $2,
         base_currency = COALESCE(NULLIF($4, ''), base_currency),
         tax_standard_rate = $5,
         tax_free_rate = $6,
         tax_input_rate = $7,
         updated_at = now()
       WHERE id = $3 AND is_active = TRUE
       RETURNING id, name, country_code, base_currency, tax_standard_rate, tax_free_rate, tax_input_rate`,
      [dto.name?.trim() || '', countryCode, req.membership.organizationId, dto.baseCurrency?.trim()?.toUpperCase() || null, dto.taxStandardRate ?? null, dto.taxFreeRate ?? null, dto.taxInputRate ?? null],
    );
    if (!result.rows.length) throw new BadRequestException('Organization not found');
    return { success: true, data: result.rows[0] };
  }

  @Get('mine')
  async listMine(@Req() req: any) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT o.id, o.name, o.country_code, r.name AS role_name
       FROM memberships m
       JOIN organizations o ON o.id = m.organization_id
       JOIN roles r ON r.id = m.role_id
       WHERE m.user_id = $1 AND m.is_active = TRUE`,
      [req.userId],
    );
    return { success: true, data: result.rows };
  }
}