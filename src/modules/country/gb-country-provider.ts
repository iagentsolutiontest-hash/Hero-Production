import {
  CountryAccountingProvider,
  InvoiceNumberingRules,
  TaxCalcInput,
  TaxCalcResult,
  TaxRateDefinition,
} from './country-provider.interface';
import { calculateStandardTax } from './tax-math';

/**
 * United Kingdom — VAT.
 * Standard 20%, reduced 5%, zero-rated 0%. Simplified model (no MTD/HMRC filing).
 */
export class GbCountryProvider implements CountryAccountingProvider {
  readonly countryCode = 'GB';
  readonly registrationIdLabel = 'VAT Number';
  readonly defaultCurrency = 'GBP';

  taxRates(): TaxRateDefinition[] {
    return [
      { code: 'VAT_STANDARD', label: 'VAT 20%', rate: '0.20' },
      { code: 'VAT_REDUCED', label: 'VAT 5% (reduced)', rate: '0.05' },
      { code: 'VAT_ZERO', label: 'VAT 0% (zero-rated)', rate: '0.00' },
      { code: 'VAT_EXEMPT', label: 'VAT exempt', rate: '0.00' },
    ];
  }

  calculateTax(input: TaxCalcInput): TaxCalcResult {
    return calculateStandardTax(this.taxRates(), input, 'GB');
  }

  invoiceNumberingRules(): InvoiceNumberingRules {
    return { prefix: 'INV', padLength: 5 };
  }
}
