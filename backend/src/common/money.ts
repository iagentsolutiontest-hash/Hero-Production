/**
 * All money math in Hero goes through these helpers. We represent amounts
 * as integer cents (BigInt) internally and only ever parse/format decimal
 * strings via string manipulation — never parseFloat/Number on a money
 * value, per the brief's "never use JS floating point for financial
 * calculations" rule.
 */

export function toCents(decimalString: string): bigint {
  const trimmed = decimalString.trim();
  const negative = trimmed.startsWith('-');
  const clean = trimmed.replace('-', '');
  const [wholeStr, fracStr = ''] = clean.split('.');
  const whole = BigInt(wholeStr || '0');
  const frac = BigInt((fracStr + '00').slice(0, 2));
  const total = whole * 100n + frac;
  return negative ? -total : total;
}

export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

/** Rounds a rate (e.g. 0.10 for 10%) applied to cents, using standard
 * round-half-up on the resulting cent value — a deterministic, documented
 * rounding rule as the brief requires. */
export function applyRate(amountCents: bigint, rateDecimalString: string): bigint {
  // rate expressed as an integer over 10^rateScale to stay in BigInt math
  const [rWhole, rFrac = ''] = rateDecimalString.split('.');
  const rateScale = rFrac.length;
  const rateInt = BigInt((rWhole || '0') + rFrac);
  const scale = 10n ** BigInt(rateScale);

  const numerator = amountCents * rateInt;
  const half = scale / 2n;
  const result =
    numerator >= 0n
      ? (numerator + half) / scale
      : -((-numerator + half) / scale);
  return result;
}
