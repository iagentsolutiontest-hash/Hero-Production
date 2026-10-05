import {
  CountryAccountingProvider,
  InvoiceNumberingRules,
  TaxCalcInput,
  TaxCalcResult,
  TaxRateDefinition,
} from './country-provider.interface';
import { toCents, fromCents, applyRate } from '../../common/money';

/**
 * Deliberately minimal — this exists only so country-provider.spec.ts can
 * prove that LedgerService/InvoiceService work against ANY
 * CountryAccountingProvider, not just AuCountryProvider. It is NOT a real
 * implementation of US sales tax (which varies by state/locality) and must
 * not be used outside tests.
 */
export class StubUsCountryProvider implements CountryAccountingProvider {
  readonly countryCode = 'US';
  readonly registrationIdLabel = 'EIN';
  readonly defaultCurrency = 'USD';

  taxRates(): TaxRateDefinition[] {
    return [{ code: 'FLAT_TEST_RATE', label: 'Flat test sales tax', rate: '0.07' }];
  }

  calculateTax(input: TaxCalcInput): TaxCalcResult {
    const rateDef = this.taxRates().find((r) => r.code === input.taxRateCode);
    if (!rateDef) throw new Error(`Unknown stub US tax rate: ${input.taxRateCode}`);
    const amountCents = toCents(input.amount);
    if (input.isTaxInclusive) {
      throw new Error('Tax-inclusive pricing not implemented in stub provider');
    }
    const taxCents = applyRate(amountCents, rateDef.rate);
    return {
      netAmount: fromCents(amountCents),
      taxAmount: fromCents(taxCents),
      grossAmount: fromCents(amountCents + taxCents),
      taxRateCode: input.taxRateCode,
    };
  }

  invoiceNumberingRules(): InvoiceNumberingRules {
    return { prefix: 'INV', padLength: 4 };
  }
}
