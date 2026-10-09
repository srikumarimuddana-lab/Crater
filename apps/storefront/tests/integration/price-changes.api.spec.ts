import { expect, test } from '@playwright/test';
import { closeDb, fakeSessions, resetCommerceData, setVariantPrice } from './helpers';

/**
 * Backend price tracking through the real routes, Postgres and cookie jar (no UI).
 * TODO(frontend): the price-changed UI spec (drawer/cart notice, acknowledge button, checkout
 * retry) belongs in tests/integration/price-changes.ui.spec.ts; setVariantPrice() is ready for it.
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => {
  await resetCommerceData();
});
test.afterAll(async () => {
  await closeDb();
});

const json = { headers: { 'content-type': 'application/json' } };
// The cart cookie is Secure (production build) and Playwright's Node cookie jar drops Secure cookies
// received over plain http, so the cookie is carried by hand here. The browser specs use the real jar.
let cookie = '';
const withCookie = () => ({ headers: { ...json.headers, cookie } });
const VARIANT = 'gid://crater/ProductVariant/1'; // Mineral Serum 30 mL, $68.00

test('a price change blocks checkout with PRICE_CHANGED until acknowledged, then charges the new price', async ({ request }) => {
  cookie = '';
  const added = await request.post('/api/storefront/cart/lines', { ...json, data: { lines: [{ merchandiseId: VARIANT }] } });
  expect(added.headers()['cache-control']).toBe('private, no-store');
  const setCookie = added.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')!.value;
  expect(setCookie).toMatch(/HttpOnly/i);
  cookie = setCookie.split(';')[0];
  expect((await added.json()).cart.hasPriceChanges).toBe(false);

  await setVariantPrice('SAMPLE-MSR-30', 7200);
  const read = (await (await request.get('/api/storefront/cart', withCookie())).json()).cart;
  expect(read.hasPriceChanges).toBe(true);
  expect(read.lines.nodes[0]).toMatchObject({ priceAtAdd: { amount: '68.00' }, cost: { amountPerQuantity: { amount: '72.00' } } });

  const blocked = await request.post('/api/checkout', { ...withCookie(), maxRedirects: 0 });
  expect(blocked.status()).toBe(303);
  expect(blocked.headers()['location']).toBe('/cart?checkout_error=PRICE_CHANGED');
  expect(await fakeSessions()).toEqual([]); // Stripe was never called

  // A quantity change does not hide the change.
  const lineId = read.lines.nodes[0].id;
  const upd = await request.patch('/api/storefront/cart/lines', { ...withCookie(), data: { lines: [{ id: lineId, quantity: 2 }] } });
  expect((await upd.json()).cart.hasPriceChanges).toBe(true);

  const ack = await request.post('/api/storefront/cart/price-changes/acknowledge', withCookie());
  expect(ack.headers()['cache-control']).toBe('private, no-store');
  const acked = (await ack.json()).cart;
  expect(acked.hasPriceChanges).toBe(false);
  expect(acked.lines.nodes[0].priceAtAdd.amount).toBe('72.00');

  const ok = await request.post('/api/checkout', { ...withCookie(), maxRedirects: 0 });
  expect(ok.status()).toBe(303);
  expect(ok.headers()['location']).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
  const [session] = await fakeSessions();
  expect(session.amount_subtotal).toBe(14400); // 2 x $72.00, from the server's catalog
  expect(session.line_items_requested).toEqual([{ quantity: 2, unit_amount: 7200, name: 'Mineral Serum — 30 mL' }]);
});

test('acknowledge without a cart reports MISSING_CART and rejects cross-site requests', async ({ request }) => {
  const none = await request.post('/api/storefront/cart/price-changes/acknowledge', json);
  expect(none.status()).toBe(200);
  expect((await none.json()).userErrors[0]).toMatchObject({ code: 'MISSING_CART' });
  const cross = await request.post('/api/storefront/cart/price-changes/acknowledge', { ...json, headers: { ...json.headers, 'sec-fetch-site': 'cross-site' } });
  expect(cross.status()).toBe(403);
});
