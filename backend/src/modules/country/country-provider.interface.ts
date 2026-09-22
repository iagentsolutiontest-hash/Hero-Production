export interface TaxRateDefinition {
  code: string; // e.g. "GST_STANDARD"
  label: string; // e.g. "GST 10%"
  rate: string; // decimal string, e.g. "0.10"
}

export interface TaxCalcInput {
  amount: string; // decimal string, the base amount
  taxRateCode: string;
  isTaxInclusive: boolean;
}

export interface TaxCalcResult {
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
  taxRateCode: string;
}

export interface InvoiceNumberingRules {
  prefix: string;
  padLength: number;
}

/**
 * The seam that keeps country-specific accounting/tax/compliance rules out
 * of the core ledger/invoicing code. Adding a new country means writing a
 * new class that implements this interface and registering it in
 * CountryProviderRegistry — nothing in LedgerService, InvoiceService, etc.
 * should ever branch on a country code directly.
 */
export interface CountryAccountingProvider {
  readonly countryCode: string; // ISO 3166-1 alpha-2
  readonly registrationIdLabel: string; // "ABN", "EIN", "VAT No.", etc.
  readonly defaultCurrency: string;

  taxRates(): TaxRateDefinition[];
  calculateTax(input: TaxCalcInput): TaxCalcResult;
  invoiceNumberingRules(): InvoiceNumberingRules;
}
