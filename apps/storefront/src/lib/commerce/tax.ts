import type { MoneyV2, ProvinceCode, TaxLine } from './types';

/**
 * Sales-tax configuration and arithmetic (docs/tax.md). Owner decisions, not tax advice: the
 * accountant confirms registrations and product taxability before live sales.
 *
 * The shopper chooses a ship-to province; Crater computes the tax for it per line item (integer cents,
 * half up) and Stripe charges the same amounts through fixed, exclusive Tax Rate objects.
 *
 * This file is plain data and integer math with TYPE-ONLY imports, so Node can load it directly
 * (`scripts/stripe-tax-rates.mjs` uses Node's built-in type stripping).
 */

export type TaxKey = 'CA_GST' | 'CA_HST_ON' | 'CA_HST_NS' | 'CA_HST_NB' | 'CA_HST_NL' | 'CA_HST_PE' | 'SK_PST';

export type TaxRateDef = {
  key: TaxKey;
  /** Shopper-facing label (also the Stripe display name). */
  title: string;
  /** Decimal string, at most three decimals. */
  ratePercent: string;
  /** Stripe Tax Rate attributes. */
  stripe: { country: 'CA'; state?: ProvinceCode; jurisdiction: string; taxType: 'gst' | 'hst' | 'pst' };
};

/** Source: CRA "GST/HST calculator (and rates)", effective on or after 2025-04-01; SK PST from saskatchewan.ca. */
export const TAX_RATE_SOURCE = 'CRA GST/HST rates (effective 2025-04-01); Saskatchewan PST 6% (saskatchewan.ca)';

export const TAX_RATES: Readonly<Record<TaxKey, TaxRateDef>> = {
  CA_GST: { key: 'CA_GST', title: 'GST', ratePercent: '5', stripe: { country: 'CA', jurisdiction: 'Canada', taxType: 'gst' } },
  CA_HST_ON: { key: 'CA_HST_ON', title: 'HST (Ontario)', ratePercent: '13', stripe: { country: 'CA', state: 'ON', jurisdiction: 'Ontario', taxType: 'hst' } },
  CA_HST_NS: { key: 'CA_HST_NS', title: 'HST (Nova Scotia)', ratePercent: '14', stripe: { country: 'CA', state: 'NS', jurisdiction: 'Nova Scotia', taxType: 'hst' } },
  CA_HST_NB: { key: 'CA_HST_NB', title: 'HST (New Brunswick)', ratePercent: '15', stripe: { country: 'CA', state: 'NB', jurisdiction: 'New Brunswick', taxType: 'hst' } },
  CA_HST_NL: { key: 'CA_HST_NL', title: 'HST (Newfoundland and Labrador)', ratePercent: '15', stripe: { country: 'CA', state: 'NL', jurisdiction: 'Newfoundland and Labrador', taxType: 'hst' } },
  CA_HST_PE: { key: 'CA_HST_PE', title: 'HST (Prince Edward Island)', ratePercent: '15', stripe: { country: 'CA', state: 'PE', jurisdiction: 'Prince Edward Island', taxType: 'hst' } },
  SK_PST: { key: 'SK_PST', title: 'PST (Saskatchewan)', ratePercent: '6', stripe: { country: 'CA', state: 'SK', jurisdiction: 'Saskatchewan', taxType: 'pst' } },
};

export const TAX_KEYS = Object.keys(TAX_RATES) as TaxKey[];

/** What the store is registered to collect. Nothing else (BC PST, MB RST, QC QST) is ever charged. */
export const TAX_REGISTRATIONS: readonly string[] = ['CA_GST', 'SK_PST'];

export const PROVINCE_NAMES: Readonly<Record<ProvinceCode, string>> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

export const PROVINCE_CODES = Object.keys(PROVINCE_NAMES) as ProvinceCode[];

/** Components charged per ship-to province, in display order. */
export const PROVINCE_TAX_KEYS: Readonly<Record<ProvinceCode, readonly TaxKey[]>> = {
  AB: ['CA_GST'],
  BC: ['CA_GST'],
  MB: ['CA_GST'],
  NB: ['CA_HST_NB'],
  NL: ['CA_HST_NL'],
  NS: ['CA_HST_NS'],
  NT: ['CA_GST'],
  NU: ['CA_GST'],
  ON: ['CA_HST_ON'],
  PE: ['CA_HST_PE'],
  QC: ['CA_GST'],
  SK: ['CA_GST', 'SK_PST'],
  YT: ['CA_GST'],
};

export function isProvinceCode(value: unknown): value is ProvinceCode {
  return typeof value === 'string' && Object.hasOwn(PROVINCE_NAMES, value);
}

/** Accepts a code ("on"), or a full English name ("Ontario"), as Stripe or a shopper may give it. Null if unknown. */
export function normaliseProvince(value: unknown): ProvinceCode | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (isProvinceCode(upper)) return upper;
  const byName = PROVINCE_CODES.find((c) => PROVINCE_NAMES[c].toLowerCase() === v.toLowerCase());
  return byName ?? null;
}

/** Percent string -> thousandths of a percent (integer). "9.975" -> 9975. */
function milli(ratePercent: string): number {
  return Math.round(Number(ratePercent) * 1000);
}

/** Tax on one amount, in minor units, rounded half up. Integer math only. */
export function taxOnMinor(amountMinor: number, ratePercent: string): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return 0;
  // amount * (milli / 1000) / 100 = amount * milli / 100000; add half the divisor for half-up.
  return Math.floor((amountMinor * milli(ratePercent) + 50_000) / 100_000);
}

const money = (minor: number): MoneyV2 => ({ amount: `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`, currencyCode: 'CAD' });

/**
 * Tax components for a ship-to province. `lineTotalsMinor` holds one entry per cart/checkout line (unit price
 * times quantity): tax is rounded per line, as Stripe does for line items, and then summed per key.
 * Unknown, blank or invalid province: no tax (empty list).
 */
export function taxLinesFor(province: string | null | undefined, lineTotalsMinor: readonly number[]): TaxLine[] {
  if (!isProvinceCode(province)) return [];
  return PROVINCE_TAX_KEYS[province].map((key) => {
    const def = TAX_RATES[key];
    const minor = lineTotalsMinor.reduce((sum, line) => sum + taxOnMinor(line, def.ratePercent), 0);
    return { key, title: def.title, ratePercent: def.ratePercent, amount: money(minor) };
  });
}

const toMinor = (m: MoneyV2): number => Math.round(Number(m.amount) * 100);

export const sumTaxMinor = (lines: readonly TaxLine[]): number => lines.reduce((sum, l) => sum + toMinor(l.amount), 0);

/** Read-only table for the admin Settings screen. */
export function taxSettingsView(): {
  registrations: string[];
  provinces: { code: ProvinceCode; name: string; lines: { key: string; title: string; ratePercent: string }[] }[];
  source: string;
  notice: string;
} {
  return {
    registrations: [...TAX_REGISTRATIONS],
    provinces: PROVINCE_CODES.map((code) => ({
      code,
      name: PROVINCE_NAMES[code],
      lines: PROVINCE_TAX_KEYS[code].map((key) => ({ key, title: TAX_RATES[key].title, ratePercent: TAX_RATES[key].ratePercent })),
    })).sort((a, b) => a.name.localeCompare(b.name)),
    source: TAX_RATE_SOURCE,
    notice:
      'Configured from the owner decisions in docs/tax.md. Not tax advice: the accountant should confirm registrations, ' +
      'product taxability and filing before live sales. BC PST, Manitoba RST and Quebec QST are not collected.',
  };
}
