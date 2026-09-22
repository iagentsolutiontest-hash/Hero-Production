import { AuCountryProvider } from '../src/modules/country/au-country-provider';
import { GbCountryProvider } from '../src/modules/country/gb-country-provider';
import { UsCountryProvider } from '../src/modules/country/us-country-provider';
import { CaCountryProvider } from '../src/modules/country/ca-country-provider';
import { InCountryProvider } from '../src/modules/country/in-country-provider';
import { NzCountryProvider } from '../src/modules/country/nz-country-provider';
import { CountryProviderRegistry } from '../src/modules/country/country-provider.registry';

describe('AuCountryProvider', () => {
  const provider = new AuCountryProvider();

  it('applies 10% GST exclusive', () => {
    const result = provider.calculateTax({
      amount: '100.00',
      taxRateCode: 'GST_STANDARD',
      isTaxInclusive: false,
    });
    expect(result.taxAmount).toBe('10.00');
    expect(result.grossAmount).toBe('110.00');
  });

  it('backs out 10% GST from tax-inclusive amount', () => {
    const result = provider.calculateTax({
      amount: '110.00',
      taxRateCode: 'GST_STANDARD',
      isTaxInclusive: true,
    });
    expect(result.grossAmount).toBe('110.00');
    expect(result.taxAmount).toBe('10.00');
    expect(result.netAmount).toBe('100.00');
  });

  it('applies GST-free (0%)', () => {
    const result = provider.calculateTax({
      amount: '50.00',
      taxRateCode: 'GST_FREE',
      isTaxInclusive: false,
    });
    expect(result.taxAmount).toBe('0.00');
    expect(result.grossAmount).toBe('50.00');
  });

  it('rounds odd cents half-up', () => {
    const result = provider.calculateTax({
      amount: '33.33',
      taxRateCode: 'GST_STANDARD',
      isTaxInclusive: false,
    });
    expect(result.taxAmount).toBe('3.33');
  });
});

describe('GbCountryProvider (UK VAT)', () => {
  const provider = new GbCountryProvider();

  it('applies 20% standard VAT', () => {
    const r = provider.calculateTax({
      amount: '100.00',
      taxRateCode: 'VAT_STANDARD',
      isTaxInclusive: false,
    });
    expect(r.taxAmount).toBe('20.00');
    expect(r.grossAmount).toBe('120.00');
  });

  it('applies 5% reduced VAT', () => {
    const r = provider.calculateTax({
      amount: '100.00',
      taxRateCode: 'VAT_REDUCED',
      isTaxInclusive: false,
    });
    expect(r.taxAmount).toBe('5.00');
  });

  it('backs out 20% VAT inclusive', () => {
    const r = provider.calculateTax({
      amount: '120.00',
      taxRateCode: 'VAT_STANDARD',
      isTaxInclusive: true,
    });
    expect(r.netAmount).toBe('100.00');
    expect(r.taxAmount).toBe('20.00');
  });
});

describe('UsCountryProvider (simplified sales tax)', () => {
  const provider = new UsCountryProvider();

  it('applies 8.25% sales tax', () => {
    const r = provider.calculateTax({
      amount: '100.00',
      taxRateCode: 'SALES_TAX_8_25',
      isTaxInclusive: false,
    });
    expect(r.taxAmount).toBe('8.25');
    expect(r.grossAmount).toBe('108.25');
  });

  it('zero rate for exempt', () => {
    const r = provider.calculateTax({
      amount: '100.00',
      taxRateCode: 'SALES_TAX_NONE',
      isTaxInclusive: false,
    });
    expect(r.taxAmount).toBe('0.00');
  });
});

describe('CaCountryProvider (GST/HST)', () => {
  const provider = new CaCountryProvider();

  it('applies federal GST 5%', () => {
    const r = provider.calculateTax({
      amount: '200.00',
      taxRateCode: 'GST',
      isTaxInclusive: false,
    });
    expect(r.taxAmount).toBe('10.00');
  });

  it('applies HST 13%', () => {
    const r = provider.calculateTax({
      amount: '100.00',
      taxRateCode: 'HST_13',
      isTaxInclusive: false,
    });
    expect(r.taxAmount).toBe('13.00');
  });
});

describe('InCountryProvider (India GST slabs)', () => {
  const provider = new InCountryProvider();

  it('applies GST 18%', () => {
    const r = provider.calculateTax({
      amount: '1000.00',
      taxRateCode: 'GST_18',
      isTaxInclusive: false,
    });
    expect(r.taxAmount).toBe('180.00');
    expect(r.grossAmount).toBe('1180.00');
  });

  it('applies GST 28%', () => {
    const r = provider.calculateTax({
      amount: '100.00',
      taxRateCode: 'GST_28',
      isTaxInclusive: false,
    });
    expect(r.taxAmount).toBe('28.00');
  });
});

describe('NzCountryProvider', () => {
  const provider = new NzCountryProvider();

  it('applies GST 15%', () => {
    const r = provider.calculateTax({
      amount: '100.00',
      taxRateCode: 'GST_STANDARD',
      isTaxInclusive: false,
    });
    expect(r.taxAmount).toBe('15.00');
    expect(r.grossAmount).toBe('115.00');
  });
});

describe('CountryProviderRegistry — multi-country', () => {
  it('registers AU, GB, US, CA, IN, NZ', () => {
    const registry = new CountryProviderRegistry();
    const codes = registry.listCountries().map((c) => c.countryCode).sort();
    expect(codes).toEqual(['AU', 'CA', 'GB', 'IN', 'NZ', 'US']);
  });

  it('returns correct registration labels', () => {
    const registry = new CountryProviderRegistry();
    expect(registry.get('AU').registrationIdLabel).toBe('ABN');
    expect(registry.get('GB').registrationIdLabel).toBe('VAT Number');
    expect(registry.get('US').registrationIdLabel).toBe('EIN');
    expect(registry.get('CA').registrationIdLabel).toBe('BN / GST Number');
    expect(registry.get('IN').registrationIdLabel).toBe('GSTIN');
    expect(registry.get('NZ').registrationIdLabel).toBe('IRD Number / GST Number');
  });

  it('throws for unknown country', () => {
    const registry = new CountryProviderRegistry();
    expect(() => registry.get('ZZ')).toThrow(/No CountryAccountingProvider registered/);
  });

  it('same interface works for all countries without core branching', () => {
    const registry = new CountryProviderRegistry();
    for (const info of registry.listCountries()) {
      const p = registry.get(info.countryCode);
      const rate = p.taxRates()[0];
      const result = p.calculateTax({
        amount: '100.00',
        taxRateCode: rate.code,
        isTaxInclusive: false,
      });
      expect(result.taxRateCode).toBe(rate.code);
      expect(result.netAmount).toBe('100.00');
      expect(parseFloat(result.grossAmount)).toBeGreaterThanOrEqual(100);
    }
  });
});
