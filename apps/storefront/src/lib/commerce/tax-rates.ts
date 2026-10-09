import type { TaxKey, TaxRateDef } from './tax';

/** The rate table (tax.ts TAX_RATES); passed in so this file needs no runtime imports. */
export type TaxTable = Readonly<Record<TaxKey, TaxRateDef>>;
const keysOf = (table: TaxTable): TaxKey[] => Object.keys(table) as TaxKey[];

/**
 * Stripe Tax Rate objects for the keys in tax.ts. Stripe tax rates are IMMUTABLE for the fields that matter
 * (percentage, inclusive, ...), so a rate that no longer matches the table is archived and replaced, never mutated.
 * Rates are found by `metadata.crater_tax_key`; the list API has no metadata filter, so active rates are paged.
 *
 * Plain functions over a narrow client type with TYPE-ONLY imports: loadable by Node type stripping
 * (scripts/stripe-tax-rates.mjs) and by the Next server alike.
 */

export type StripeTaxRate = {
  id: string;
  active: boolean;
  display_name: string;
  percentage: number;
  inclusive: boolean;
  country: string | null;
  state: string | null;
  jurisdiction: string | null;
  tax_type?: string | null;
  metadata: Record<string, string> | null;
};

export type TaxRateParams = {
  display_name: string;
  percentage: number;
  inclusive: false;
  country: string;
  state?: string;
  jurisdiction: string;
  tax_type: string;
  active: true;
  metadata: Record<string, string>;
};

export interface TaxRateApi {
  taxRates: {
    list(params: { active: boolean; limit: number; starting_after?: string }): Promise<{ data: StripeTaxRate[]; has_more: boolean }>;
    create(params: TaxRateParams, options: { idempotencyKey: string }): Promise<StripeTaxRate>;
    update(id: string, params: { active: false }): Promise<StripeTaxRate>;
  };
}

export const TAX_KEY_METADATA = 'crater_tax_key';
const MAX_PAGES = 20;

export function desiredParams(table: TaxTable, key: TaxKey): TaxRateParams {
  const def = table[key];
  return {
    display_name: def.title,
    percentage: Number(def.ratePercent),
    inclusive: false,
    country: def.stripe.country,
    ...(def.stripe.state ? { state: def.stripe.state } : {}),
    jurisdiction: def.stripe.jurisdiction,
    tax_type: def.stripe.taxType,
    active: true,
    metadata: { [TAX_KEY_METADATA]: key },
  };
}

/** True when an existing Stripe rate has exactly the attributes the table asks for. */
export function rateMatches(table: TaxTable, rate: StripeTaxRate, key: TaxKey): boolean {
  const want = desiredParams(table, key);
  return (
    rate.active === true &&
    rate.inclusive === false &&
    rate.display_name === want.display_name &&
    Number(rate.percentage) === want.percentage &&
    rate.country === want.country &&
    (rate.state ?? null) === (want.state ?? null) &&
    (rate.jurisdiction ?? null) === want.jurisdiction &&
    (rate.tax_type ?? null) === want.tax_type
  );
}

/** Every active rate that carries one of our keys, grouped by key. */
export async function listCraterRates(api: TaxRateApi, table: TaxTable): Promise<Map<TaxKey, StripeTaxRate[]>> {
  const found = new Map<TaxKey, StripeTaxRate[]>();
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await api.taxRates.list({ active: true, limit: 100, ...(after ? { starting_after: after } : {}) });
    for (const rate of res.data) {
      const key = rate.metadata?.[TAX_KEY_METADATA];
      if (key && keysOf(table).includes(key as TaxKey)) found.set(key as TaxKey, [...(found.get(key as TaxKey) ?? []), rate]);
    }
    if (!res.has_more || res.data.length === 0) break;
    after = res.data[res.data.length - 1].id;
  }
  return found;
}

export type EnsureReport = { key: TaxKey; id: string; action: 'kept' | 'created' | 'replaced'; archived: string[] }[];

/**
 * Idempotent: one active rate per key. Matching rate kept; mismatched or duplicate old ones archived
 * (never mutated); a missing one created. Re-running changes nothing.
 */
export async function ensureTaxRates(api: TaxRateApi, table: TaxTable, log: (line: string) => void = () => {}): Promise<EnsureReport> {
  const existing = await listCraterRates(api, table);
  const report: EnsureReport = [];
  for (const key of keysOf(table)) {
    const rates = existing.get(key) ?? [];
    const keep = rates.find((r) => rateMatches(table, r, key));
    const archived: string[] = [];
    for (const rate of rates) {
      if (rate === keep) continue;
      await api.taxRates.update(rate.id, { active: false });
      archived.push(rate.id);
      log(`archived ${rate.id} (${key}: no longer matches the table or a duplicate)`);
    }
    if (keep) {
      report.push({ key, id: keep.id, action: 'kept', archived });
      continue;
    }
    // The idempotency key is derived from the rate content, so a retried run cannot create a second rate.
    const want = desiredParams(table, key);
    const created = await api.taxRates.create(want, {
      idempotencyKey: `crater-taxrate-${key}-${want.percentage}-${want.state ?? 'XX'}-${want.tax_type}-${rates.length}`,
    });
    log(`created ${created.id} (${key} ${want.percentage}%)`);
    report.push({ key, id: created.id, action: rates.length ? 'replaced' : 'created', archived });
  }
  return report;
}

/** Read-only: the id of the active, matching rate for each requested key. Throws when one is missing or stale. */
export async function resolveTaxRateIds(api: TaxRateApi, table: TaxTable, keys: readonly TaxKey[]): Promise<Map<TaxKey, string>> {
  const existing = await listCraterRates(api, table);
  const out = new Map<TaxKey, string>();
  for (const key of keys) {
    const rate = (existing.get(key) ?? []).find((r) => rateMatches(table, r, key));
    if (!rate) throw new Error(`Stripe tax rate ${key} is missing or out of date; run "npm run stripe:tax-rates"`);
    out.set(key, rate.id);
  }
  return out;
}
