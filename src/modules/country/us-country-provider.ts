import {
  CountryAccountingProvider,
  InvoiceNumberingRules,
  TaxCalcInput,
  TaxCalcResult,
  TaxRateDefinition,
} from './country-provider.interface';
import { calculateStandardTax } from './tax-math';

/**
 * United States — SIMPLIFIED sales tax model.
 *
 * Real US sales tax is state + county + city and depends on nexus and product
 * taxability. This provider exposes a few common single rates for demo and
 * early go-to-market. It is NOT a full Avalara/TaxJar replacement.
 */
export class UsCountryProvider implements CountryAccountingProvider {
  readonly countryCode = 'US';
  readonly registrationIdLabel = 'EIN';
  readonly defaultCurrency = 'USD';

  taxRates(): TaxRateDefinition[] {
    return [
      { code: 'SALES_TAX_NONE', label: 'No sales tax / exempt', rate: '0.00' },
      { code: 'SALES_TAX_5', label: 'Sales tax 5%', rate: '0.05' },
      { code: 'SALES_TAX_6', label: 'Sales tax 6%', rate: '0.06' },
      { code: 'SALES_TAX_7', label: 'Sales tax 7%', rate: '0.07' },
      { code: 'SALES_TAX_8', label: 'Sales tax 8%', rate: '0.08' },
      { code: 'SALES_TAX_8_25', label: 'Sales tax 8.25%', rate: '0.0825' },
      { code: 'SALES_TAX_9', label: 'Sales tax 9%', rate: '0.09' },
      { code: 'SALES_TAX_10', label: 'Sales tax 10%', rate: '0.10' },
    ];
  }

  calculateTax(input: TaxCalcInput): TaxCalcResult {
    return calculateStandardTax(this.taxRates(), input, 'US');
  }

  invoiceNumberingRules(): InvoiceNumberingRules {
    return { prefix: 'INV', padLength: 5 };
  }
}
