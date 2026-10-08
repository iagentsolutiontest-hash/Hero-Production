import { Pool } from 'pg';
import { CountryAccountingProvider } from './country-provider.interface';

export interface OrganizationAccountingSettings {
  baseCurrency: string;
  taxRates: ReturnType<CountryAccountingProvider['taxRates']>;
}

export async function getOrganizationAccountingSettings(
  pool: Pool,
  organizationId: string,
  provider: CountryAccountingProvider,
): Promise<OrganizationAccountingSettings> {
  const result = await pool.query(
    `SELECT base_currency, tax_standard_rate, tax_free_rate, tax_input_rate
     FROM organizations WHERE id = $1 AND is_active = TRUE`,
    [organizationId],
  );
  if (!result.rows.length) {
    return { baseCurrency: provider.defaultCurrency, taxRates: provider.taxRates() };
  }
  const row = result.rows[0];
  const defaults = provider.taxRates();
  const customRates = [row.tax_standard_rate, row.tax_free_rate, row.tax_input_rate];
  const taxRates = defaults.map((rate, index) => {
    const custom = customRates[index];
    if (custom === null || custom === undefined || custom === '') return rate;
    return {
      ...rate,
      rate: Number(custom).toFixed(6),
      label: `${rate.code === defaults[0]?.code ? 'Standard' : rate.code === defaults[1]?.code ? 'Tax-free' : 'Input-taxed'} ${(Number(custom) * 100).toFixed(2)}%`,
    };
  });
  return {
    baseCurrency: String(row.base_currency || provider.defaultCurrency).toUpperCase(),
    taxRates,
  };
}
