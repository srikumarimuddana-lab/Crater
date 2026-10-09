import type { MoneyV2 } from '@/lib/commerce/types';

/** Display helpers. Money stays a decimal string: grouping and sign are text operations, no float maths. */
export function fmtAmount(amount: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!m) return amount;
  const int = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${m[1] ? '−' : ''}${int}${m[3] ? `.${m[3]}` : ''}`;
}

/** `$24.00` style cell text; null (redacted) renders nothing, never "0.00". */
export function fmtMoney(money: MoneyV2 | null | undefined): string | null {
  if (!money) return null;
  const text = fmtAmount(money.amount);
  return text.startsWith('−') ? `−$${text.slice(1)}` : `$${text}`;
}

const SHORT = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const FULL = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'medium', timeStyle: 'long', hour12: false });

export function fmtDate(iso: string, timeZone: string): { short: string; full: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { short: iso, full: iso };
  return { short: SHORT(timeZone).format(d), full: FULL(timeZone).format(d) };
}

/** URL slug for a `gid://crater/<Type>/<n>` id (and back). Ids stay opaque to the browser. */
export const gidSlug = (gid: string): string => gid.slice(gid.lastIndexOf('/') + 1);
export const gidFrom = (type: 'Order' | 'Product' | 'ProductVariant', slug: string): string | null =>
  /^[1-9]\d{0,9}$/.test(slug) ? `gid://crater/${type}/${slug}` : null;

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export const FINANCIAL_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
  VOIDED: 'Voided',
};
export const FULFILMENT_LABEL: Record<string, string> = { UNFULFILLED: 'Unfulfilled', FULFILLED: 'Fulfilled' };
export const REASON_LABEL: Record<string, string> = {
  RECEIVED: 'Received',
  COUNT_CORRECTION: 'Count correction',
  DAMAGED: 'Damaged',
  RETURN_RESTOCK: 'Return restock',
  OTHER: 'Other',
  ORDER_PAID: 'Order paid',
};
export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  FULFILMENT: 'Fulfilment',
  BOOKKEEPER: 'Bookkeeper',
  SUPPORT: 'Support',
};

export const CHECK_LABEL: Record<string, string> = {
  NOT_SAMPLE: 'Not a sample product',
  HAS_INGREDIENTS: 'Ingredients listed',
  HAS_PRECAUTIONS: 'Precautions written',
  HAS_DIRECTIONS: 'Directions for use written',
  IMAGES_HAVE_ALT: 'Alt text on every image',
  HAS_ACTIVE_VARIANT: 'At least one variant has a price',
};
export const CHECK_HELP: Record<string, string> = {
  NOT_SAMPLE: 'Sample products can never be published. Replace sample content with real, verified product information first.',
  HAS_INGREDIENTS: 'List the real ingredients (placeholder text does not count).',
  HAS_PRECAUTIONS: 'Write the precautions for this product.',
  HAS_DIRECTIONS: 'Write the directions for use.',
  IMAGES_HAVE_ALT: 'Every image needs descriptive alt text.',
  HAS_ACTIVE_VARIANT: 'Set a price above zero on at least one variant.',
};
