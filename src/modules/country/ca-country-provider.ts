import {
  CountryAccountingProvider,
  InvoiceNumberingRules,
  TaxCalcInput,
  TaxCalcResult,
  TaxRateDefinition,
} from './country-provider.interface';
import { calculateStandardTax } from './tax-math';

/**
 * Canada — GST / HST simplified rates.
 * Federal GST is 5%. HST combines GST+PST in participating provinces.
 * Full provincial matrix and ITCs are not modelled here.
 */
export class CaCountryProvider implements CountryAccountingProvider {
  readonly countryCode = 'CA';
  readonly registrationIdLabel = 'BN / GST Number';
  readonly defaultCurrency = 'CAD';

  taxRates(): TaxRateDefinition[] {
    return [
      { code: 'GST', label: 'GST 5%', rate: '0.05' },
      { code: 'HST_13', label: 'HST 13% (e.g. ON)', rate: '0.13' },
      { code: 'HST_14', label: 'HST 14%', rate: '0.14' },
      { code: 'HST_15', label: 'HST 15% (e.g. NS/NL/NB/PE)', rate: '0.15' },
      { code: 'GST_PST_10', label: 'GST+PST ~10% (approx combined)', rate: '0.10' },
      { code: 'GST_PST_12', label: 'GST+PST ~12% (approx combined)', rate: '0.12' },
      { code: 'TAX_EXEMPT', label: 'Exempt / zero-rated', rate: '0.00' },
    ];
  }

  calculateTax(input: TaxCalcInput): TaxCalcResult {
    return calculateStandardTax(this.taxRates(), input, 'CA');
  }

  invoiceNumberingRules(): InvoiceNumberingRules {
    return { prefix: 'INV', padLength: 5 };
  }
}
