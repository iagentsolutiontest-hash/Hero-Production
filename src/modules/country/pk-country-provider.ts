import {
  CountryAccountingProvider,
  InvoiceNumberingRules,
  TaxCalcInput,
  TaxCalcResult,
  TaxRateDefinition,
} from './country-provider.interface';
import { calculateStandardTax } from './tax-math';

/**
 * Pakistan — simplified invoice sales-tax rates.
 * Rates and exemptions vary by goods, services, province, and effective date.
 */
export class PkCountryProvider implements CountryAccountingProvider {
  readonly countryCode = 'PK';
  readonly registrationIdLabel = 'NTN / STRN';
  readonly defaultCurrency = 'PKR';

  taxRates(): TaxRateDefinition[] {
    return [
      { code: 'PK_SALES_TAX_STANDARD', label: 'Sales tax 18% (standard goods rate)', rate: '0.18' },
      { code: 'PK_SALES_TAX_ZERO', label: 'Sales tax 0% (zero-rated)', rate: '0.00' },
      { code: 'PK_SALES_TAX_EXEMPT', label: 'Sales tax exempt', rate: '0.00' },
    ];
  }

  calculateTax(input: TaxCalcInput): TaxCalcResult {
    return calculateStandardTax(this.taxRates(), input, 'PK');
  }

  invoiceNumberingRules(): InvoiceNumberingRules {
    return { prefix: 'INV', padLength: 5 };
  }
}
