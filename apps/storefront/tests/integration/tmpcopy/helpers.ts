import Stripe from 'stripe';
import pg from 'pg';
import { catalogSeed } from '../../../src/lib/commerce/catalog-seed';
import {
  FAKE_STRIPE_ORIGIN,
  INTEGRATION_ORIGIN,
  INTEGRATION_WEBHOOK_SECRET,
  requireTestDatabaseUrl,
} from '../env.mjs';

/** Helpers for the integration suite. They talk to the throwaway Postgres directly and to the fake Stripe. */

let pool: pg.Pool | null = null;

/** One pg pool from TEST_DATABASE_URL (whose database name must contain "test"). */
export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: requireTestDatabaseUrl(), max: 3 });
  return pool;
}

export async function closeDb(): Promise<void> {
  const p = pool;
  pool = null;
  await p?.end();
}

/**
 * Back to the pristine seeded state: catalog prices, images and inventory re-seeded; carts,
 * checkouts, orders and webhook events cleared; the next order is #1001; the fake Stripe forgotten.
 */
export async function resetCommerceData(): Promise<void> {
  const pool = db();
  const c = await pool.connect();
  try {
    await c.query('set session_replication_role = replica');
    await c.query(`truncate commerce.order_lines, commerce.orders, commerce.checkouts, commerce.cart_lines, commerce.carts, commerce.processed_webhook_events restart identity cascade`);
    await c.query('set session_replication_role = default');
  } finally {
    c.release();
  }
  await pool.query("update commerce.counters set value = 1000 where name = 'order_number'");
  // db/seed.mjs uses top-level await, so it must be loaded with import() from this CommonJS-compiled file.
  const { seedCatalog } = await import('../../../db/seed.mjs');
  await seedCatalog(pool); // refreshes content, images and prices (it deliberately keeps inventory)
  for (const product of catalogSeed.products) {
    for (const variant of product.variants) {
      await pool.query('update commerce.variants set inventory_quantity = $2 where id = $1', [tail(variant.id), variant.quantity]);
    }
  }
  await fetch(`${FAKE_STRIPE_ORIGIN}/__test/reset`, { method: 'POST' });
}

const tail = (gid: string) => Number(gid.split('/').pop());

/** Variant ids are `gid://crater/ProductVariant/<n>`; SKUs look like SAMPLE-LBO-30. */
async function variantNumericId(skuOrGid: string): Promise<number> {
  if (skuOrGid.startsWith('gid://')) return tail(skuOrGid);
  const { rows } = await db().query('select id from commerce.variants where sku = $1', [skuOrGid]);
  if (!rows[0]) throw new Error(`Unknown variant ${skuOrGid}`);
  return rows[0].id as number;
}

/** Changes the catalog price (integer minor units, e.g. 2800 = $28.00), as an owner edit would. */
export async function setVariantPrice(skuOrGid: string, priceMinor: number): Promise<void> {
  if (!Number.isInteger(priceMinor) || priceMinor < 0) throw new Error('priceMinor must be a non-negative integer');
  const res = await db().query('update commerce.variants set price_minor = $2 where id = $1', [await variantNumericId(skuOrGid), priceMinor]);
  if (res.rowCount !== 1) throw new Error(`Unknown variant ${skuOrGid}`);
}

export async function getInventory(skuOrGid: string): Promise<number | null> {
  const { rows } = await db().query('select inventory_quantity from commerce.variants where id = $1', [await variantNumericId(skuOrGid)]);
  if (!rows[0]) throw new Error(`Unknown variant ${skuOrGid}`);
  return rows[0].inventory_quantity as number | null;
}

export type OrderRow = {
  order_number: number;
  financial_status: string;
  stripe_session_id: string;
  email: string | null;
  subtotal_minor: number;
  total_minor: number;
  review_flags: string[];
  lines: { sku: string; quantity: number; unit_minor: number }[];
};

export async function getOrders(): Promise<OrderRow[]> {
  const { rows } = await db().query(
    `select o.order_number, o.financial_status, o.stripe_session_id, o.email, o.subtotal_minor, o.total_minor, o.review_flags,
            coalesce((select json_agg(json_build_object('sku', l.sku, 'quantity', l.quantity, 'unit_minor', l.unit_minor) order by l.position)
                        from commerce.order_lines l where l.order_id = o.id), '[]') as lines
       from commerce.orders o order by o.order_number`,
  );
  return rows as OrderRow[];
}

// --- fake Stripe ----------------------------------------------------------------------------

export type FakeSession = {
  id: string;
  url: string;
  payment_status: string;
  status: string;
  amount_subtotal: number;
  amount_total: number;
  currency: string;
  client_reference_id: string | null;
  metadata: Record<string, string>;
  success_url: string | null;
  cancel_url: string | null;
  line_items_requested: { quantity: number; unit_amount: number; name: string | null }[];
};

export async function fakeSessions(): Promise<FakeSession[]> {
  return ((await (await fetch(`${FAKE_STRIPE_ORIGIN}/__test/sessions`)).json()) as { data: FakeSession[] }).data;
}

/** Marks a session paid on the fake Stripe (the buyer finished paying) and returns it. */
export async function payFakeSession(id: string): Promise<FakeSession> {
  const res = await fetch(`${FAKE_STRIPE_ORIGIN}/__test/sessions/${id}/pay`, { method: 'POST' });
  if (!res.ok) throw new Error(`fake stripe pay failed: ${res.status}`);
  return (await res.json()) as FakeSession;
}

// --- webhooks -------------------------------------------------------------------------------

const signer = new Stripe(INTEGRATION_WEBHOOK_SECRET.replace('whsec_', 'sk_test_')); // only used to sign, never to call

export type WebhookOptions = { eventId?: string; signed?: boolean; secret?: string };

/**
 * POSTs a Stripe-shaped event for `session` to /api/webhooks/stripe, signed over the exact raw
 * body with the integration secret (stripe.webhooks.generateTestHeaderString). `signed: false`
 * sends it with no signature at all. Returns the HTTP status and the event id used.
 */
export async function sendSignedWebhook(
  type: string,
  session: Record<string, unknown>,
  options: WebhookOptions = {},
): Promise<{ status: number; eventId: string; body: unknown }> {
  const eventId = options.eventId ?? `evt_integration_${Math.random().toString(36).slice(2, 14)}`;
  const payload = JSON.stringify({
    id: eventId,
    object: 'event',
    api_version: '2026-08-26.dahlia',
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: { object: 'checkout.session', ...session } },
  });
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.signed !== false) {
    headers['stripe-signature'] = signer.webhooks.generateTestHeaderString({ payload, secret: options.secret ?? INTEGRATION_WEBHOOK_SECRET });
  }
  const res = await fetch(`${INTEGRATION_ORIGIN}/api/webhooks/stripe`, { method: 'POST', headers, body: payload });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON error body
  }
  return { status: res.status, eventId, body };
}
