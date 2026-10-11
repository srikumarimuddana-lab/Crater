import type { ProductRecord } from '@/lib/commerce/records';
import { minorToAmount } from '@/lib/commerce/money';
import type { ProductPatch } from './records';
import type { PublishCheck } from './types';

/** Pure product rules shared by the memory and Postgres admin repositories and the product service. */

const PLACEHOLDER = /^\s*placeholder\b|pending (owner|licen)|\(sample\b|\bTODO\b|lorem ipsum/i;
export const isPlaceholderText = (text: string): boolean => PLACEHOLDER.test(text);
const real = (text: string): boolean => text.trim().length > 0 && !isPlaceholderText(text);

/**
 * Publish gate. Activation requires every check to pass. The admin never writes content for the owner:
 * empty or placeholder text fails. Sample products always fail NOT_SAMPLE.
 */
const sold = (p: ProductRecord) => p.variants.filter((v) => v.priceMinor > 0);

export function publishChecks(p: ProductRecord): PublishCheck[] {
  return [
    { key: 'NOT_SAMPLE', passed: !p.sample },
    { key: 'HAS_INGREDIENTS', passed: p.details.ingredients.some((i) => i.trim().length > 1) && !p.details.ingredients.some(isPlaceholderText) },
    { key: 'HAS_PRECAUTIONS', passed: real(p.details.precautions) },
    { key: 'HAS_DIRECTIONS', passed: real(p.details.howToUse) },
    { key: 'IMAGES_HAVE_ALT', passed: p.images.length > 0 && p.images.every((i) => i.altText.trim().length > 0) },
    { key: 'HAS_ACTIVE_VARIANT', passed: p.variants.some((v) => v.priceMinor > 0) },
    // Owner decision (docs/tax.md): every sellable variant needs a cost price before a product can go live.
    { key: 'HAS_COST', passed: sold(p).length > 0 && sold(p).every((v) => v.costMinor !== null) },
  ];
}

/** Applies a validated patch to a copy. Returns the unknown variant id when the patch names a foreign variant. */
export function applyProductPatch(before: ProductRecord, patch: ProductPatch, now: string): { after: ProductRecord } | { invalidVariant: string } {
  const after = structuredClone(before);
  if (patch.title !== undefined) after.title = patch.title;
  if (patch.description !== undefined) after.description = patch.description;
  if (patch.details) after.details = { ...after.details, ...patch.details };
  for (const change of patch.variants ?? []) {
    const v = after.variants.find((x) => x.id === change.id);
    if (!v) return { invalidVariant: change.id };
    if (change.priceMinor !== undefined) v.priceMinor = change.priceMinor;
    if (change.costMinor !== undefined) v.costMinor = change.costMinor;
    if (change.lowStockThreshold !== undefined) v.lowStockThreshold = change.lowStockThreshold;
  }
  // The optimistic-concurrency token must change on every write, even within one millisecond.
  const prev = new Date(before.updatedAt).getTime();
  after.updatedAt = new Date(Math.max(new Date(now).getTime(), prev + 1)).toISOString();
  return { after };
}

export const sameInstant = (a: string, b: string): boolean => new Date(a).getTime() === new Date(b).getTime();

const brief = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}...` : s);

/** Non-PII before/after pairs for the audit log. Money as decimal strings; text truncated. */
export function diffProduct(before: ProductRecord, after: ProductRecord): {
  fields: Record<string, { from: unknown; to: unknown }>;
  prices: Record<string, { from: unknown; to: unknown }>;
} {
  const fields: Record<string, { from: unknown; to: unknown }> = {};
  const prices: Record<string, { from: unknown; to: unknown }> = {};
  if (before.title !== after.title) fields.title = { from: brief(before.title), to: brief(after.title) };
  if (before.description !== after.description) fields.description = { from: brief(before.description), to: brief(after.description) };
  for (const key of ['benefits', 'ingredients'] as const) {
    if (JSON.stringify(before.details[key]) !== JSON.stringify(after.details[key])) {
      fields[`details.${key}`] = { from: `${before.details[key].length} items`, to: `${after.details[key].length} items` };
    }
  }
  for (const key of ['howToUse', 'precautions'] as const) {
    if (before.details[key] !== after.details[key]) fields[`details.${key}`] = { from: brief(before.details[key]), to: brief(after.details[key]) };
  }
  for (const v of after.variants) {
    const old = before.variants.find((x) => x.id === v.id);
    if (!old) continue;
    const sku = v.sku;
    if (old.priceMinor !== v.priceMinor) prices[`${sku}.price`] = { from: minorToAmount(old.priceMinor), to: minorToAmount(v.priceMinor) };
    if (old.costMinor !== v.costMinor) prices[`${sku}.cost`] = { from: old.costMinor === null ? null : minorToAmount(old.costMinor), to: v.costMinor === null ? null : minorToAmount(v.costMinor) };
    if (old.lowStockThreshold !== v.lowStockThreshold) fields[`${sku}.lowStockThreshold`] = { from: old.lowStockThreshold, to: v.lowStockThreshold };
  }
  return { fields, prices };
}
