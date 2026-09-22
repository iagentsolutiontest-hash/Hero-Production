import { Injectable } from '@nestjs/common';
import { CountryAccountingProvider, TaxRateDefinition } from './country-provider.interface';
import { AuCountryProvider } from './au-country-provider';
import { GbCountryProvider } from './gb-country-provider';
import { UsCountryProvider } from './us-country-provider';
import { CaCountryProvider } from './ca-country-provider';
import { InCountryProvider } from './in-country-provider';
import { NzCountryProvider } from './nz-country-provider';

export interface CountryInfo {
  countryCode: string;
  name: string;
  registrationIdLabel: string;
  defaultCurrency: string;
  taxRates: TaxRateDefinition[];
}

const COUNTRY_NAMES: Record<string, string> = {
  AU: 'Australia',
  GB: 'United Kingdom',
  US: 'United States',
  CA: 'Canada',
  IN: 'India',
  NZ: 'New Zealand',
};

@Injectable()
export class CountryProviderRegistry {
  private providers = new Map<string, CountryAccountingProvider>();

  constructor() {
    this.register(new AuCountryProvider());
    this.register(new GbCountryProvider());
    this.register(new UsCountryProvider());
    this.register(new CaCountryProvider());
    this.register(new InCountryProvider());
    this.register(new NzCountryProvider());
  }

  register(provider: CountryAccountingProvider): void {
    this.providers.set(provider.countryCode, provider);
  }

  get(countryCode: string): CountryAccountingProvider {
    const provider = this.providers.get(countryCode.toUpperCase());
    if (!provider) {
      throw new Error(
        `No CountryAccountingProvider registered for country code: ${countryCode}`,
      );
    }
    return provider;
  }

  listCountries(): CountryInfo[] {
    return Array.from(this.providers.values()).map((p) => ({
      countryCode: p.countryCode,
      name: COUNTRY_NAMES[p.countryCode] || p.countryCode,
      registrationIdLabel: p.registrationIdLabel,
      defaultCurrency: p.defaultCurrency,
      taxRates: p.taxRates(),
    }));
  }
}
