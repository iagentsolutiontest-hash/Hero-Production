import {
  CountryAccountingProvider,
  InvoiceNumberingRules,
  TaxCalcInput,
  TaxCalcResult,
  TaxRateDefinition,
} from './country-provider.interface';
import { calculateStandardTax } from './tax-math';

/**
 * Australia — GST (Goods and Services Tax).
 * Arithmetic is unit-tested. Not a substitute for ATO-reviewed BAS software.
 */
export class AuCountryProvider implements CountryAccountingProvider {
  readonly countryCode = 'AU';
  readonly registrationIdLabel = 'ABN';
  readonly defaultCurrency = 'AUD';

  taxRates(): TaxRateDefinition[] {
    return [
      { code: 'GST_STANDARD', label: 'GST 10%', rate: '0.10' },
      { code: 'GST_FREE', label: 'GST-free', rate: '0.00' },
      { code: 'INPUT_TAXED', label: 'Input taxed', rate: '0.00' },
    ];
  }

  calculateTax(input: TaxCalcInput): TaxCalcResult {
    return calculateStandardTax(this.taxRates(), input, 'AU');
  }

  invoiceNumberingRules(): InvoiceNumberingRules {
    return { prefix: 'INV', padLength: 5 };
  }
}
