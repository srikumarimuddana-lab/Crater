import Stripe from 'stripe';
import { vi } from 'vitest';
import { createCheckoutService } from '@/lib/commerce/checkout';
import { readConfig } from '@/lib/commerce/config';
import { createMemoryRepository } from '@/lib/commerce/memory-repository';
import type { CommerceRepository } from '@/lib/commerce/records';
import { createStorefront } from '@/lib/commerce/storefront';
import type { StripeClient } from '@/lib/commerce/stripe-client';
import type { Cart } from '@/lib/commerce/types';

// Seeded variant ids (see catalog-seed.ts).
export const V = {
  serum30: 'gid://crater/ProductVariant/1', // $68.00, qty 40, default variant
  serum15: 'gid://crater/ProductVariant/2', // $42.00, qty 25
  cream50: 'gid://crater/ProductVariant/3', // $58.00, qty 30
  creamRefill: 'gid://crater/ProductVariant/4', // $50.00, qty 2 (low stock)
  cleanser: 'gid://crater/ProductVariant/5', // $34.00
  balm01: 'gid://crater/ProductVariant/8', // qty 0 (sold out)
  balm02: 'gid://crater/ProductVariant/9', // qty 18
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

export function mockStripe(overrides: { url?: string | null; id?: string } = {}) {
  const create = vi.fn(async () => ({ id: overrides.id ?? SESSION_ID, url: overrides.url === undefined ? STRIPE_URL : overrides.url }));
  const retrieve = vi.fn(async () => ({ id: SESSION_ID, payment_status: 'unpaid', status: 'open' }));
  const client = {
    checkout: { sessions: { create, retrieve } },
    webhooks: { constructEvent: (p: string, h: string, s: string) => realStripe.webhooks.constructEvent(p, h, s) },
  } as unknown as StripeClient;
  return { client, create, retrieve };
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

export async function cartWith(h: Harness, lines: { merchandiseId: string; quantity?: number }[]): Promise<Cart> {
  const { cart, userErrors } = await h.storefront.cartCreate({ input: { lines } });
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
    metadata: { cart_id: string; checkout_id: string };
    line_items: { quantity: number; price_data: { unit_amount: number } }[];
  };
  const subtotal = params.line_items.reduce((s, l) => s + l.quantity * l.price_data.unit_amount, 0);
  return {
    id: SESSION_ID,
    payment_status: 'paid',
    status: 'complete',
    mode: 'payment',
    currency: 'cad',
    amount_subtotal: subtotal,
    amount_total: subtotal,
    total_details: { amount_shipping: 0, amount_tax: 0, amount_discount: 0 },
    metadata: params.metadata,
    customer_details: { email: 'buyer@example.com' },
    ...overrides,
  };
}

export async function deliver(h: Harness, body: string, header = sign(body)) {
  return h.checkout.handleStripeWebhook(body, header);
}

export function variantQuantity(products: Awaited<ReturnType<CommerceRepository['listProducts']>>, variantId: string) {
  for (const p of products) for (const v of p.variants) if (v.id === variantId) return v.quantity;
  return undefined;
}
