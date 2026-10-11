import Stripe from 'stripe';
import { vi } from 'vitest';
import { createCheckoutService } from '@/lib/commerce/checkout';
import { readConfig } from '@/lib/commerce/config';
import { createMemoryRepository } from '@/lib/commerce/memory-repository';
import type { CommerceRepository } from '@/lib/commerce/records';
import { createStorefront } from '@/lib/commerce/storefront';
import type { StripeClient } from '@/lib/commerce/stripe-client';
import { TAX_KEYS, TAX_RATES, taxOnMinor } from '@/lib/commerce/tax';
import { desiredParams, type StripeTaxRate } from '@/lib/commerce/tax-rates';
import type { Cart, ProvinceCode } from '@/lib/commerce/types';

// Seeded variant ids (see catalog-seed.ts; ids start at 11 so retired skincare ids never alias).
export const V = {
  hero30: 'gid://crater/ProductVariant/11', // Lemon Balm & Oat Extract 30 mL, $24.00, qty 40, default variant of the hero
  hero60: 'gid://crater/ProductVariant/12', // Lemon Balm & Oat Extract 60 mL, $38.00, qty 25
  peppermint30: 'gid://crater/ProductVariant/13', // Peppermint & Ginger Extract 30 mL, $22.00, qty 35
  hawthorn30: 'gid://crater/ProductVariant/17', // Hawthorn & Rose Hip Extract 30 mL, $26.00, qty 2 (low stock)
  oil100: 'gid://crater/ProductVariant/23', // Calendula & Almond Body Oil 100 mL, $30.00, qty 22 (single variant)
  chamomile30: 'gid://crater/ProductVariant/15', // Chamomile & Linden Extract 30 mL, $24.00, qty 30 (purchasable)
  chamomile60: 'gid://crater/ProductVariant/16', // Chamomile & Linden Extract 60 mL, $38.00, qty 0 (SOLD OUT)
} as const;

export const TEST_ENV = {
  COMMERCE_PROVIDER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_test_abc123DEF456',
  STRIPE_WEBHOOK_SECRET: 'whsec_unit_test_secret',
  NEXT_PUBLIC_SITE_URL: 'https://shop.example',
};

export const SESSION_ID = 'cs_test_a1B2c3D4e5F6g7H8i9J0';
export const STRIPE_URL = `https://checkout.stripe.com/c/pay/${SESSION_ID}`;

/** Real Stripe object only for signature verification/generation; it never makes a request here. */
export const realStripe = new Stripe('sk_test_abc123DEF456');

/** In-memory stand-in for Stripe's tax-rate endpoints: list/create/update with the same semantics the code relies on. */
export function fakeTaxRates(preload = true) {
  const rates: StripeTaxRate[] = [];
  let n = 0;
  const make = (p: ReturnType<typeof desiredParams>, id = `txr_${String(++n).padStart(4, '0')}`): StripeTaxRate => ({
    id, active: p.active, display_name: p.display_name, percentage: p.percentage, inclusive: p.inclusive, country: p.country,
    state: p.state ?? null, jurisdiction: p.jurisdiction, tax_type: p.tax_type, metadata: { ...p.metadata },
  });
  if (preload) for (const key of TAX_KEYS) rates.push(make(desiredParams(TAX_RATES, key), `txr_test_${key}`));
  const api = {
    list: vi.fn(async (p: { active: boolean; limit: number; starting_after?: string }) => {
      const all = rates.filter((r) => r.active === p.active);
      const start = p.starting_after ? all.findIndex((r) => r.id === p.starting_after) + 1 : 0;
      const data = all.slice(start, start + p.limit);
      return { data: structuredClone(data), has_more: start + p.limit < all.length };
    }),
    create: vi.fn(async (p: ReturnType<typeof desiredParams>) => {
      const r = make(p);
      rates.push(r);
      return structuredClone(r);
    }),
    update: vi.fn(async (id: string, p: { active: false }) => {
      const r = rates.find((x) => x.id === id);
      if (!r) throw new Error('no such tax rate');
      r.active = p.active;
      return structuredClone(r);
    }),
  };
  return { rates, api };
}

export function mockStripe(overrides: { url?: string | null; id?: string } = {}) {
  const create = vi.fn(async () => ({ id: overrides.id ?? SESSION_ID, url: overrides.url === undefined ? STRIPE_URL : overrides.url }));
  /** Sessions registered by paidSession(): the webhook payload ("light") and what retrieve(expand) returns ("full"). */
  const known = new Map<string, { light: Record<string, unknown>; full: Record<string, unknown> }>();
  const retrieve = vi.fn(async (id: string, params?: { expand?: string[] }) => {
    const s = known.get(id);
    if (s) return (params?.expand?.includes('total_details.breakdown') ? s.full : s.light) as never;
    return { id: SESSION_ID, payment_status: 'unpaid', status: 'open' };
  });
  const tax = fakeTaxRates();
  const client = {
    checkout: { sessions: { create, retrieve } },
    taxRates: tax.api,
    webhooks: { constructEvent: (p: string, h: string, s: string) => realStripe.webhooks.constructEvent(p, h, s) },
  } as unknown as StripeClient;
  return { client, create, retrieve, taxRates: tax.api, rates: tax.rates, known };
}

export async function makeHarness(opts: { repo?: CommerceRepository; env?: Record<string, string | undefined> } = {}) {
  const repo = opts.repo ?? createMemoryRepository();
  const clock = { now: new Date('2026-03-01T12:00:00.000Z') };
  const now = () => clock.now;
  const storefront = createStorefront({ repo, now });
  const stripe = mockStripe();
  const env = { ...TEST_ENV, ...opts.env };
  const checkout = createCheckoutService({ repo, stripe: () => stripe.client, config: () => readConfig(env), now });
  return { repo, clock, storefront, stripe, checkout, env };
}

export type Harness = Awaited<ReturnType<typeof makeHarness>>;

/** A cart with lines and a ship-to province (default ON: HST 13%, matching the Toronto address the paid-session helper collects). */
export async function cartWith(
  h: Harness,
  lines: { merchandiseId: string; quantity?: number }[],
  province: ProvinceCode | null = 'ON',
): Promise<Cart> {
  const { cart, userErrors } = await h.storefront.cartCreate({ input: { lines, ...(province ? { buyerIdentity: { provinceCode: province } } : {}) } });
  if (!cart || userErrors.length) throw new Error(`cart setup failed: ${JSON.stringify(userErrors)}`);
  return cart;
}

export function sign(payload: string, secret = TEST_ENV.STRIPE_WEBHOOK_SECRET): string {
  return realStripe.webhooks.generateTestHeaderString({ payload, secret });
}

export function sessionEvent(
  type: string,
  session: Record<string, unknown>,
  eventId = 'evt_test_0001',
): string {
  return JSON.stringify({
    id: eventId,
    object: 'event',
    api_version: '2026-08-26.dahlia',
    created: 1_770_000_000,
    type,
    data: { object: { object: 'checkout.session', ...session } },
  });
}

/** Builds a paid session body matching what our create() call asked Stripe for. */
export function paidSession(h: Harness, overrides: Record<string, unknown> = {}) {
  const params = (h.stripe.create.mock.calls as unknown as unknown[][]).at(-1)?.[0] as {
    metadata: { cart_id: string; checkout_id: string; tax_province?: string };
    line_items: { quantity: number; tax_rates?: string[]; price_data: { unit_amount: number } }[];
  };
  const subtotal = params.line_items.reduce((s, l) => s + l.quantity * l.price_data.unit_amount, 0);
  // Stripe's tax: each line's fixed tax rates applied to its total, half up, then summed per rate (the real behaviour we rely on).
  const byRate = new Map<string, number>();
  for (const l of params.line_items) {
    for (const id of l.tax_rates ?? []) {
      const rate = h.stripe.rates.find((r) => r.id === id);
      if (rate) byRate.set(id, (byRate.get(id) ?? 0) + taxOnMinor(l.quantity * l.price_data.unit_amount, String(rate.percentage)));
    }
  }
  const amountTax = [...byRate.values()].reduce((a, b) => a + b, 0);
  const province = params.metadata.tax_province;
  const session = {
    id: SESSION_ID,
    payment_status: 'paid',
    status: 'complete',
    mode: 'payment',
    currency: 'cad',
    amount_subtotal: subtotal,
    amount_total: subtotal + amountTax,
    total_details: { amount_shipping: 0, amount_tax: amountTax, amount_discount: 0 },
    metadata: params.metadata,
    customer_details: { email: 'buyer@example.com' },
    collected_information: province
      ? { shipping_details: { name: 'Sam Buyer', address: { line1: '100 Sample Street', line2: null, city: 'Somewhere', state: province, postal_code: 'A1A 1A1', country: 'CA' } } }
      : undefined,
    ...overrides,
  };
  // Real webhook payloads omit total_details.breakdown; retrieve(id, { expand }) returns it.
  const full = {
    ...session,
    total_details: {
      ...session.total_details,
      breakdown: {
        discounts: [],
        taxes: [...byRate].map(([id, amount]) => ({ amount, rate: h.stripe.rates.find((r) => r.id === id), taxability_reason: 'standard_rated', taxable_amount: subtotal })),
      },
    },
  };
  h.stripe.known.set(session.id, { light: session, full });
  return session;
}

export async function deliver(h: Harness, body: string, header = sign(body)) {
  return h.checkout.handleStripeWebhook(body, header);
}

export function variantQuantity(products: Awaited<ReturnType<CommerceRepository['listProducts']>>, variantId: string) {
  for (const p of products) for (const v of p.variants) if (v.id === variantId) return v.quantity;
  return undefined;
}
