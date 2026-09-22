import { Controller, Get, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { CountryProviderRegistry } from './country-provider.registry';
import { getPool } from '../../db/pool';

@Controller('api/v1/countries')
export class CountryController {
  constructor(private registry: CountryProviderRegistry) {}

  /** Public list of supported countries and their tax rates (for org setup UI). */
  @Get()
  list() {
    return { success: true, data: this.registry.listCountries() };
  }

  /** Tax rates for the active organization's country. */
  @Get('tax-rates')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('invoice.read')
  async taxRatesForOrg(@Req() req: any) {
    const pool = getPool();
    const org = await pool.query(`SELECT country_code FROM organizations WHERE id = $1`, [
      req.membership.organizationId,
    ]);
    if (org.rows.length === 0) {
      throw new BadRequestException('Organization not found');
    }
    const code = org.rows[0].country_code || 'AU';
    const provider = this.registry.get(code);
    return {
      success: true,
      data: {
        countryCode: provider.countryCode,
        registrationIdLabel: provider.registrationIdLabel,
        defaultCurrency: provider.defaultCurrency,
        taxRates: provider.taxRates(),
      },
    };
  }
}
