import {
  CountryAccountingProvider,
  InvoiceNumberingRules,
  TaxCalcInput,
  TaxCalcResult,
  TaxRateDefinition,
} from './country-provider.interface';
import { calculateStandardTax } from './tax-math';

/**
 * New Zealand — GST 15%.
 */
export class NzCountryProvider implements CountryAccountingProvider {
  readonly countryCode = 'NZ';
  readonly registrationIdLabel = 'IRD Number / GST Number';
  readonly defaultCurrency = 'NZD';

  taxRates(): TaxRateDefinition[] {
    return [
      { code: 'GST_STANDARD', label: 'GST 15%', rate: '0.15' },
      { code: 'GST_ZERO', label: 'GST zero-rated', rate: '0.00' },
      { code: 'GST_EXEMPT', label: 'GST exempt', rate: '0.00' },
    ];
  }

  calculateTax(input: TaxCalcInput): TaxCalcResult {
    return calculateStandardTax(this.taxRates(), input, 'NZ');
  }

  invoiceNumberingRules(): InvoiceNumberingRules {
    return { prefix: 'INV', padLength: 5 };
  }
}
