import { expect, test, type APIRequestContext } from '@playwright/test';
import { FAKE_STRIPE_ORIGIN } from './env.mjs';
import { closeDb, db, ensureFakeTaxRates, fakeSessions, getInventory, getOrders, payFakeSession, resetCommerceData, sendSignedWebhook, type FakeSession } from './helpers';

/**
 * Sales tax end to end over the JSON API (no browser UI needed): province in the bag -> checkout with fixed tax rates
 * on the fake Stripe -> pay -> signed webhook -> order with Stripe's per-rate tax. Real Next server and Postgres.
 * The cart cookie is Secure and Playwright's Node jar drops Secure cookies over http, so it is carried by hand.
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => {
  await resetCommerceData();
});
test.afterAll(async () => {
  await closeDb();
});

const json = { 'content-type': 'application/json' };
const HERO_30 = 'SAMPLE-LBO-30'; // $24.00
const HERO_VARIANT = 'gid://crater/ProductVariant/11';
const PEPPERMINT_VARIANT = 'gid://crater/ProductVariant/13'; // $22.00

async function bag(request: APIRequestContext, province: string | null, lines = [{ merchandiseId: HERO_VARIANT, quantity: 2 }, { merchandiseId: PEPPERMINT_VARIANT }]) {
  const added = await request.post('/api/storefront/cart/lines', { headers: json, data: { lines } });
  const cookie = added.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')!.value.split(';')[0];
  const headers = { ...json, cookie };
  let cart = (await added.json()).cart;
  if (province) {
    const res = await request.patch('/api/storefront/cart', { headers, data: { buyerIdentity: { provinceCode: province } } });
    expect(res.headers()['cache-control']).toBe('private, no-store');
    const body = await res.json();
    expect(body.userErrors).toEqual([]);
    cart = body.cart;
  }
  return { headers, cart };
}

async function checkout(request: APIRequestContext, headers: Record<string, string>): Promise<FakeSession> {
  const res = await request.post('/api/checkout', { headers, maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(new URL(res.headers()['location']).host).toBe('checkout.stripe.com');
  const sessions = await fakeSessions();
  expect(sessions).toHaveLength(1);
  return sessions[0];
}

test('Saskatchewan bag: GST 5% + PST 6% shown in the bag, charged by Stripe, recorded on the order', async ({ request }) => {
  const { headers, cart } = await bag(request, 'SK');
  // Bag: 2 x $24.00 + $22.00 = $70.00; GST 3.50, PST 4.20.
  expect(cart.cost.taxLines.map((l: { key: string; amount: { amount: string } }) => [l.key, l.amount.amount])).toEqual([['CA_GST', '3.50'], ['SK_PST', '4.20']]);
  expect(cart.cost).toMatchObject({ subtotalAmount: { amount: '70.00' }, totalTaxAmount: { amount: '7.70' }, totalAmount: { amount: '77.70' } });

  const session = await checkout(request, headers);
  expect(session).toMatchObject({ amount_subtotal: 7000, amount_total: 7770, total_details: { amount_tax: 770 } });
  expect(session.line_items_requested).toHaveLength(2);
  for (const li of session.line_items_requested) expect(li.tax_rates).toHaveLength(2);
  expect(session.shipping_address_collection).toEqual({ allowed_countries: ['CA'] });

  const paid = await payFakeSession(session.id); // the buyer types an SK address (the default follows the bag)
  expect((paid as unknown as { total_details: { breakdown?: unknown } }).total_details.breakdown).toBeUndefined(); // webhook payloads omit it
  expect((await sendSignedWebhook('checkout.session.completed', paid)).status).toBe(200);

  const [order] = await getOrders();
  expect(order).toMatchObject({ financial_status: 'PAID', review_flags: [], subtotal_minor: 7000, tax_minor: 770, total_minor: 7770, tax_province: 'SK', shipping_province: 'SK' });
  expect(order.tax_lines.map((l) => [l.key, l.title, l.ratePercent, l.amount.amount])).toEqual([
    ['CA_GST', 'GST', '5', '3.50'], ['SK_PST', 'PST (Saskatchewan)', '6', '4.20'],
  ]);
  expect(await getInventory(HERO_30)).toBe(38);
});

test('Ontario bag: HST 13% only', async ({ request }) => {
  const { headers } = await bag(request, 'ON');
  const session = await checkout(request, headers);
  expect(session.total_details.amount_tax).toBe(910);
  for (const li of session.line_items_requested) expect(li.tax_rates).toHaveLength(1);
  expect((await sendSignedWebhook('checkout.session.completed', await payFakeSession(session.id))).status).toBe(200);
  const [order] = await getOrders();
  expect(order).toMatchObject({ financial_status: 'PAID', review_flags: [], tax_minor: 910, total_minor: 7910, tax_province: 'ON' });
  expect(order.tax_lines.map((l) => [l.key, l.amount.amount])).toEqual([['CA_HST_ON', '9.10']]);
});

test('a province mismatch (SK bag, Alberta address) keeps the order PENDING with TAX_PROVINCE_MISMATCH', async ({ request }) => {
  const { headers } = await bag(request, 'SK');
  const session = await checkout(request, headers);
  const paid = await payFakeSession(session.id, { state: 'AB' });
  expect((await sendSignedWebhook('checkout.session.completed', paid)).status).toBe(200);
  const [order] = await getOrders();
  expect(order).toMatchObject({ financial_status: 'PENDING', review_flags: ['TAX_PROVINCE_MISMATCH'], tax_province: 'SK', shipping_province: 'AB', tax_minor: 770 });
  // Not shown to the buyer as confirmed.
  const page = await request.get(`/checkout/success?session_id=${session.id}`);
  expect(await page.text()).not.toContain('Thank you. Your order is confirmed');
});

test('checkout without a province is refused (PROVINCE_REQUIRED) and never reaches Stripe; an invalid province is a userError', async ({ request }) => {
  const { headers } = await bag(request, null);
  const res = await request.post('/api/checkout', { headers, maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()['location']).toBe('/cart?checkout_error=PROVINCE_REQUIRED');
  expect(await fakeSessions()).toEqual([]);
  const bad = await request.patch('/api/storefront/cart', { headers, data: { buyerIdentity: { provinceCode: 'XX' } } });
  expect((await bad.json()).userErrors).toEqual([{ code: 'INVALID', field: ['buyerIdentity', 'provinceCode'], message: expect.any(String) }]);
  const cross = await request.patch('/api/storefront/cart', { headers: { ...headers, 'sec-fetch-site': 'cross-site' }, data: { buyerIdentity: { provinceCode: 'SK' } } });
  expect(cross.status()).toBe(403);
  // Recovery: choosing a province lets the same bag through.
  await request.patch('/api/storefront/cart', { headers, data: { buyerIdentity: { provinceCode: 'AB' } } });
  const ok = await request.post('/api/checkout', { headers, maxRedirects: 0 });
  expect(ok.headers()['location']).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
  expect((await fakeSessions())[0].total_details.amount_tax).toBe(350);
});

test('checkout fails safely when the tax rates are archived in Stripe, and recovers after `stripe:tax-rates` runs', async ({ request }) => {
  const { headers } = await bag(request, 'ON');
  const rates = ((await (await fetch(`${FAKE_STRIPE_ORIGIN}/v1/tax_rates?active=true&limit=100`, { headers: { authorization: 'Bearer sk_test_integration_only' } })).json()) as { data: { id: string }[] }).data;
  for (const r of rates) await fetch(`${FAKE_STRIPE_ORIGIN}/v1/tax_rates/${r.id}`, { method: 'POST', headers: { authorization: 'Bearer sk_test_integration_only', 'content-type': 'application/x-www-form-urlencoded' }, body: 'active=false' });
  try {
    const res = await request.post('/api/checkout', { headers, maxRedirects: 0 });
    expect(res.headers()['location']).toBe('/cart?checkout_error=PAYMENT_PROVIDER_UNAVAILABLE');
    expect(await fakeSessions()).toEqual([]);
    expect((await db().query('select count(*)::int as n from commerce.orders')).rows[0].n).toBe(0);
  } finally {
    await ensureFakeTaxRates(); // what the owner does: npm run stripe:tax-rates
  }
  const again = await request.post('/api/checkout', { headers, maxRedirects: 0 });
  expect(again.headers()['location']).toMatch(/^https:\/\/checkout\.stripe\.com\//);
});
