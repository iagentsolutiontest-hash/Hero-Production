import {
  CountryAccountingProvider,
  InvoiceNumberingRules,
  TaxCalcInput,
  TaxCalcResult,
  TaxRateDefinition,
} from './country-provider.interface';
import { calculateStandardTax } from './tax-math';

/**
 * India — GST rate slabs (CGST+SGST/IGST combined as a single line rate).
 * Does not split CGST/SGST/IGST or handle e-invoicing / GSTR filing.
 */
export class InCountryProvider implements CountryAccountingProvider {
  readonly countryCode = 'IN';
  readonly registrationIdLabel = 'GSTIN';
  readonly defaultCurrency = 'INR';

  taxRates(): TaxRateDefinition[] {
    return [
      { code: 'GST_0', label: 'GST 0%', rate: '0.00' },
      { code: 'GST_5', label: 'GST 5%', rate: '0.05' },
      { code: 'GST_12', label: 'GST 12%', rate: '0.12' },
      { code: 'GST_18', label: 'GST 18%', rate: '0.18' },
      { code: 'GST_28', label: 'GST 28%', rate: '0.28' },
    ];
  }

  calculateTax(input: TaxCalcInput): TaxCalcResult {
    return calculateStandardTax(this.taxRates(), input, 'IN');
  }

  invoiceNumberingRules(): InvoiceNumberingRules {
    return { prefix: 'INV', padLength: 5 };
  }
}
