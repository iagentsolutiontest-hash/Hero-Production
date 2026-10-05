import { toCents, fromCents, applyRate } from '../../common/money';
import { TaxCalcInput, TaxCalcResult, TaxRateDefinition } from './country-provider.interface';

/**
 * Shared exclusive / inclusive tax arithmetic for all country providers.
 * Money stays in integer cents — never JS floating point.
 */
export function calculateStandardTax(
  rates: TaxRateDefinition[],
  input: TaxCalcInput,
  countryLabel: string,
): TaxCalcResult {
  const rateDef = rates.find((r) => r.code === input.taxRateCode);
  if (!rateDef) {
    throw new Error(`Unknown ${countryLabel} tax rate code: ${input.taxRateCode}`);
  }

  const amountCents = toCents(input.amount);

  if (input.isTaxInclusive) {
    const [rWhole, rFrac = ''] = rateDef.rate.split('.');
    const rateScale = rFrac.length || 1;
    const scale = 10n ** BigInt(rateScale);
    const rateInt = BigInt((rWhole || '0') + rFrac.padEnd(rateScale, '0'));
    const denominator = scale + rateInt;
    const numerator = amountCents * rateInt;
    const half = denominator / 2n;
    const taxCents = rateInt === 0n ? 0n : (numerator + half) / denominator;
    const netCents = amountCents - taxCents;
    return {
      netAmount: fromCents(netCents),
      taxAmount: fromCents(taxCents),
      grossAmount: fromCents(amountCents),
      taxRateCode: input.taxRateCode,
    };
  }

  const taxCents = applyRate(amountCents, rateDef.rate);
  return {
    netAmount: fromCents(amountCents),
    taxAmount: fromCents(taxCents),
    grossAmount: fromCents(amountCents + taxCents),
    taxRateCode: input.taxRateCode,
  };
}
