import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRepositoryForTests } from '@/lib/commerce/repository-factory';
import { overrideStripeFactoryForTests, resetServicesForTests } from '@/lib/commerce/services';
import { CART_COOKIE } from '@/lib/commerce/cart-cookie';
import { cartRefOf } from '@/lib/commerce/checkout';
import { mockStripe, SESSION_ID, sessionEvent, sign, STRIPE_URL, TEST_ENV, V, realStripe } from './helpers/harness';

const jar = vi.hoisted(() => ({
  values: new Map<string, string>(),
  sets: [] as { name: string; value: string; options: Record<string, unknown> }[],
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { name, value: jar.values.get(name)! } : undefined),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      jar.sets.push({ name, value, options });
      if (options.maxAge === 0) jar.values.delete(name);
      else jar.values.set(name, value);
    },
  }),
}));

import { POST as checkoutPOST, GET as checkoutGET } from '@/app/api/checkout/route';
import { GET as completeGET } from '@/app/api/checkout/complete/route';
import { POST as webhookPOST, GET as webhookGET } from '@/app/api/webhooks/stripe/route';
import { GET as productsGET } from '@/app/api/storefront/products/route';
import { GET as productGET } from '@/app/api/storefront/products/[handle]/route';
import { GET as cartGET, PATCH as cartPATCH, POST as cartPOST } from '@/app/api/storefront/cart/route';
import { POST as ackPOST, GET as ackGET } from '@/app/api/storefront/cart/price-changes/acknowledge/route';
import { POST as linesPOST, PATCH as linesPATCH, DELETE as linesDELETE } from '@/app/api/storefront/cart/lines/route';

const ENV_KEYS = ['COMMERCE_PROVIDER', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_ALLOW_LIVE', 'NEXT_PUBLIC_SITE_URL', 'COMMERCE_DB'];

function resetAll() {
  jar.values.clear();
  jar.sets.length = 0;
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('crater.commerce.memory-state')];
  resetRepositoryForTests();
  resetServicesForTests();
}

beforeEach(() => {
  resetAll();
  for (const k of ENV_KEYS) vi.stubEnv(k, '');
  vi.stubEnv('COMMERCE_DB', 'memory');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetAll();
});

const stubStripe = () => {
  for (const [k, v] of Object.entries(TEST_ENV)) vi.stubEnv(k, v);
  const stripe = mockStripe();
  overrideStripeFactoryForTests(() => stripe.client);
  return stripe;
};

const json = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

const PRIVATE = 'private, no-store';

/** Fills the cookie cart with the hero product and (default ON) a ship-to province, the way the bag does before checkout. */
const fillWithProvince = async (province: string | null = 'ON') => {
  const res = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.hero30 }] }));
  if (province) await cartPATCH(json('PATCH', '/api/storefront/cart', { buyerIdentity: { provinceCode: province } }));
  return res;
};

describe('catalog routes', () => {
  it('GET /api/storefront/products lists, filters, paginates, and is briefly publicly cacheable', async () => {
    const res = await productsGET(new Request('http://localhost:3000/api/storefront/products?first=2&sortKey=TITLE&reverse=true'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/^public, .*s-maxage=60/);
    expect(res.headers.get('set-cookie')).toBeNull();
    const page = await res.json();
    expect(page.nodes.map((p: { handle: string }) => p.handle)).toEqual(['peppermint-ginger-extract', 'nettle-leaf-extract']);
    const next = await productsGET(new Request(`http://localhost:3000/api/storefront/products?first=2&sortKey=TITLE&reverse=true&after=${page.pageInfo.endCursor}`));
    expect((await next.json()).nodes[0].handle).toBe('lemon-balm-oat-extract');
    const q = await productsGET(new Request('http://localhost:3000/api/storefront/products?query=product_type%3AKit'));
    expect((await q.json()).nodes.map((p: { handle: string }) => p.handle)).toEqual(['evening-ritual-kit']);
    const c = await productsGET(new Request('http://localhost:3000/api/storefront/products?collection=body-oils'));
    expect((await c.json()).nodes).toHaveLength(2);
  });

  it('rejects invalid query parameters with 400', async () => {
    for (const qs of ['first=0', 'first=51', 'first=abc', 'sortKey=NOPE', 'reverse=yes', 'after=%25%25', 'after=e30', 'collection=Bad_Handle', 'surprise=1', `query=${'x'.repeat(300)}`]) {
      const res = await productsGET(new Request(`http://localhost:3000/api/storefront/products?${qs}`));
      expect(res.status, qs).toBe(400);
      expect(res.headers.get('cache-control')).toBe(PRIVATE);
    }
  });

  it('GET /api/storefront/products/[handle] returns the product or 404', async () => {
    const ctx = (handle: string) => ({ params: Promise.resolve({ handle }) });
    const ok = await productGET(new Request('http://x'), ctx('lemon-balm-oat-extract'));
    expect(ok.status).toBe(200);
    expect((await ok.json()).variants[0].title).toBe('30 mL');
    for (const h of ['nope', 'Lemon-Balm-Oat-Extract', '../etc', 'a'.repeat(200)]) expect((await productGET(new Request('http://x'), ctx(h))).status, h).toBe(404);
  });
});

describe('cart routes', () => {
  it('POST /cart creates a cart, sets a hardened cookie, and responds private/no-store', async () => {
    const res = await cartPOST(json('POST', '/api/storefront/cart', { lines: [{ merchandiseId: V.hero30, quantity: 2 }] }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(PRIVATE);
    const { cart } = await res.json();
    expect(cart.totalQuantity).toBe(2);
    expect(jar.sets).toHaveLength(1);
    expect(jar.sets[0]).toMatchObject({
      name: CART_COOKIE,
      value: cart.id,
      options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 14 * 24 * 60 * 60, secure: false },
    });
    // GET reads it back from the cookie.
    const got = await cartGET();
    expect(got.headers.get('cache-control')).toBe(PRIVATE);
    expect((await got.json()).cart.id).toBe(cart.id);
  });

  it('marks the cookie Secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await cartPOST(json('POST', '/api/storefront/cart', {}));
    expect(jar.sets[0].options.secure).toBe(true);
  });

  it('POST /cart/lines creates a cart when none exists, then merges', async () => {
    const first = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.oil100 }] }));
    const created = (await first.json()).cart;
    expect(created.lines.nodes).toHaveLength(1);
    const second = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.oil100, quantity: 2 }] }));
    const merged = (await second.json()).cart;
    expect(merged.id).toBe(created.id);
    expect(merged.lines.nodes[0].quantity).toBe(3);
    expect(second.headers.get('cache-control')).toBe(PRIVATE);
  });

  it('recreates the cart when the cookie points at an expired or unknown cart', async () => {
    jar.values.set(CART_COOKIE, 'gid://crater/Cart/' + 'z'.repeat(32));
    const res = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.hero30 }] }));
    const body = await res.json();
    expect(body.userErrors).toEqual([]);
    expect(body.cart.id).not.toContain('zzzz');
    expect(jar.values.get(CART_COOKIE)).toBe(body.cart.id);
  });

  it('a malformed cookie value is ignored', async () => {
    jar.values.set(CART_COOKIE, "'; drop table carts; --");
    expect((await (await cartGET()).json()).cart).toBeNull();
    const res = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.hero30 }] }));
    expect((await res.json()).cart.lines.nodes).toHaveLength(1);
  });

  it('PATCH updates, DELETE removes, and both report MISSING_CART without a cart', async () => {
    for (const call of [
      () => linesPATCH(json('PATCH', '/api/storefront/cart/lines', { lines: [{ id: 'gid://crater/CartLine/1', quantity: 1 }] })),
      () => linesDELETE(json('DELETE', '/api/storefront/cart/lines', { lineIds: ['gid://crater/CartLine/1'] })),
    ]) {
      const body = await (await call()).json();
      expect(body.cart).toBeNull();
      expect(body.userErrors[0].code).toBe('MISSING_CART');
    }
    const created = (await (await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.hero30 }, { merchandiseId: V.oil100 }] }))).json()).cart;
    const [a, b] = created.lines.nodes;
    const patched = (await (await linesPATCH(json('PATCH', '/api/storefront/cart/lines', { lines: [{ id: a.id, quantity: 4 }] }))).json()).cart;
    expect(patched.lines.nodes[0].quantity).toBe(4);
    const removed = (await (await linesDELETE(json('DELETE', '/api/storefront/cart/lines', { lineIds: [b.id] }))).json()).cart;
    expect(removed.lines.nodes).toHaveLength(1);
    // Userfacing mutation errors keep the cart and surface the Storefront-style payload.
    const bad = await (await linesPATCH(json('PATCH', '/api/storefront/cart/lines', { lines: [{ id: 'gid://crater/CartLine/99', quantity: 1 }] }))).json();
    expect(bad.userErrors[0]).toMatchObject({ code: 'INVALID_MERCHANDISE_LINE', field: ['lines', '0', 'id'] });
    expect(bad.cart.id).toBe(created.id);
  });

  it('an expired cart clears the dead cookie on read', async () => {
    jar.values.set(CART_COOKIE, 'gid://crater/Cart/' + 'q'.repeat(32));
    expect((await (await cartGET()).json()).cart).toBeNull();
    expect(jar.values.has(CART_COOKIE)).toBe(false);
  });

  it('rejects unknown shapes, wrong types, and bad bodies with 400', async () => {
    const bodies: [string, unknown, Record<string, string>?][] = [
      ['unknown top-level field', { lines: [{ merchandiseId: V.hero30 }], extra: 1 }],
      ['unknown line field', { lines: [{ merchandiseId: V.hero30, price: '0.01' }] }],
      ['string quantity', { lines: [{ merchandiseId: V.hero30, quantity: '2' }] }],
      ['no lines', { lines: [] }],
      ['lines not a list', { lines: 'x' }],
      ['too many lines', { lines: Array.from({ length: 51 }, () => ({ merchandiseId: V.hero30 })) }],
      ['array body', []],
      ['bad JSON', '{not json'],
      ['wrong content type', { lines: [{ merchandiseId: V.hero30 }] }, { 'content-type': 'text/plain' }],
      ['oversized', { lines: [{ merchandiseId: V.hero30, attributes: [{ key: 'k', value: 'v'.repeat(20000) }] }] }],
    ];
    for (const [name, body, headers] of bodies) {
      const res = await linesPOST(json('POST', '/api/storefront/cart/lines', body, headers));
      expect(res.status, name).toBe(400);
      expect(res.headers.get('cache-control'), name).toBe(PRIVATE);
      expect(JSON.stringify(await res.json())).not.toMatch(/stack|at .*\(/);
    }
    expect((await cartPOST(json('POST', '/api/storefront/cart', { unknown: 1 }))).status).toBe(400);
    expect((await linesDELETE(json('DELETE', '/api/storefront/cart/lines', { lineIds: [1] }))).status).toBe(400);
    expect((await linesPATCH(json('PATCH', '/api/storefront/cart/lines', { lines: [{ quantity: 1 }] }))).status).toBe(400);
    expect(jar.sets).toHaveLength(0);
  });

  it('semantic errors from the service are returned as userErrors, not 400', async () => {
    const res = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.hero30, quantity: 99 }] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userErrors[0]).toMatchObject({ code: 'GREATER_THAN' });
    expect(body.cart).toBeNull();
    expect(jar.sets).toHaveLength(0); // nothing was created, no cookie
  });

  it('blocks cross-site state changes', async () => {
    const headers = { 'sec-fetch-site': 'cross-site' };
    expect((await cartPOST(json('POST', '/api/storefront/cart', {}, headers))).status).toBe(403);
    expect((await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.hero30 }] }, headers))).status).toBe(403);
    expect((await linesDELETE(json('DELETE', '/api/storefront/cart/lines', { lineIds: ['x'] }, headers))).status).toBe(403);
    const same = await cartPOST(json('POST', '/api/storefront/cart', {}, { 'sec-fetch-site': 'same-origin' }));
    expect(same.status).toBe(200);
  });
});

describe('POST /api/checkout', () => {
  const post = (headers: Record<string, string> = {}) => checkoutPOST(new Request('http://localhost:3000/api/checkout', { method: 'POST', headers }));
  const fillCart = () => fillWithProvince();

  it('303s to the cart with EMPTY_CART when there is no cart cookie', async () => {
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/cart?checkout_error=EMPTY_CART');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('fixture mode redirects with FIXTURE_MODE and never calls Stripe', async () => {
    const stripe = mockStripe();
    overrideStripeFactoryForTests(() => stripe.client);
    await fillCart();
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/cart?checkout_error=FIXTURE_MODE');
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it('stripe-test mode redirects (303) to the Stripe-hosted URL', async () => {
    const stripe = stubStripe();
    await fillCart();
    const res = await post({ 'sec-fetch-site': 'same-origin' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(STRIPE_URL);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(stripe.create).toHaveBeenCalledTimes(1);
  });

  it('never redirects to a non-Stripe host', async () => {
    const stripe = stubStripe();
    stripe.create.mockResolvedValueOnce({ id: SESSION_ID, url: 'https://evil.example/pay' } as never);
    await fillCart();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await post();
    expect(res.headers.get('location')).toBe('/cart?checkout_error=PAYMENT_PROVIDER_UNAVAILABLE');
  });

  it('rejects cross-site posts and non-POST methods', async () => {
    stubStripe();
    await fillCart();
    expect((await post({ 'sec-fetch-site': 'cross-site' })).headers.get('location')).toBe('/cart?checkout_error=FORBIDDEN');
    const get = await checkoutGET();
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
  });

  it('ignores any price or cart data in the request body', async () => {
    const stripe = stubStripe();
    await fillCart();
    await checkoutPOST(new Request('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unit_amount: 1, cartId: 'gid://crater/Cart/' + 'x'.repeat(32) }),
    }));
    const params = (stripe.create.mock.calls as unknown as [{ line_items: { price_data: { unit_amount: number } }[] }][])[0][0];
    expect(params.line_items[0].price_data.unit_amount).toBe(2400);
  });
});

describe('GET /api/checkout/complete (Stripe success_url)', () => {
  const fillCart = () => fillWithProvince();
  const complete = (query = `session_id=${SESSION_ID}`) => completeGET(new Request(`http://localhost:3000/api/checkout/complete?${query}`));
  const cookieCart = () => jar.values.get(CART_COOKIE);

  /** A shopper with a cart who has paid: the session Stripe would report back, optionally for another cart. */
  async function paidShopper(overrides: Record<string, unknown> = {}) {
    const stripe = stubStripe();
    await fillCart();
    expect((await checkoutPOST(new Request('http://localhost:3000/api/checkout', { method: 'POST' }))).status).toBe(303);
    const params = (stripe.create.mock.calls as unknown as [{ metadata: Record<string, string> }][])[0][0];
    const session = { id: SESSION_ID, status: 'complete', payment_status: 'paid', metadata: params.metadata, ...overrides };
    stripe.retrieve.mockResolvedValue(session as never);
    return stripe;
  }

  it('clears the cart cookie when the session metadata digest matches the cookie cart, then 303s to the confirmation', async () => {
    const stripe = await paidShopper();
    const cartId = cookieCart()!;
    expect(cartId).toBeTruthy();
    const res = await complete();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/checkout/success?session_id=${SESSION_ID}`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(stripe.retrieve).toHaveBeenCalledWith(SESSION_ID);
    expect(cookieCart()).toBeUndefined();
    const cleared = jar.sets.at(-1)!;
    expect(cleared).toMatchObject({ name: CART_COOKIE, value: '', options: { maxAge: 0, httpOnly: true, sameSite: 'lax', path: '/' } });
    expect((await (await cartGET()).json()).cart).toBeNull(); // a normal empty bag, no dead cookie left behind
  });

  it('keeps the cookie when the digest belongs to another cart (a newer bag is never cleared)', async () => {
    await paidShopper({ metadata: { cart_id: cartRefOf('gid://crater/Cart/' + 'Z'.repeat(32)), checkout_id: 'chk_' + 'a'.repeat(32) } });
    const before = cookieCart();
    const res = await complete();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/checkout/success?session_id=${SESSION_ID}`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(cookieCart()).toBe(before);
    expect(jar.sets.filter((s) => s.options.maxAge === 0)).toEqual([]);
  });

  it('keeps the cookie, without calling Stripe, for a malformed or missing session id', async () => {
    const stripe = await paidShopper();
    const before = cookieCart();
    for (const query of ['', 'session_id=', 'session_id=nope', 'session_id=cs_test_short', `session_id=${SESSION_ID}/../x`, `session_id=${SESSION_ID}%0d%0aSet-Cookie:x=1`, 'session_id=cs_live_' + 'x'.repeat(300)]) {
      const res = await complete(query);
      expect(res.status, query).toBe(303);
      expect(res.headers.get('location'), query).toBe('/checkout/success'); // the bad value is never echoed
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(cookieCart(), query).toBe(before);
    }
    expect(stripe.retrieve).not.toHaveBeenCalled();
  });

  it('keeps the cookie when the session is unfinished, when Stripe fails, and with no cookie', async () => {
    const stripe = await paidShopper({ status: 'open', payment_status: 'unpaid' });
    const before = cookieCart();
    expect((await complete()).status).toBe(303);
    expect(cookieCart()).toBe(before);

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stripe.retrieve.mockRejectedValue(Object.assign(new Error(`boom ${SESSION_ID} ${before}`), { type: 'StripeConnectionError' }));
    const failed = await complete();
    expect(failed.status).toBe(303);
    expect(failed.headers.get('location')).toBe(`/checkout/success?session_id=${SESSION_ID}`);
    expect(cookieCart()).toBe(before);
    expect(JSON.stringify(error.mock.calls)).not.toContain(before!); // the cart id never reaches the log
    expect(JSON.stringify(error.mock.calls)).not.toContain(SESSION_ID);

    jar.values.delete(CART_COOKIE);
    stripe.retrieve.mockClear();
    expect((await complete()).status).toBe(303);
    expect(stripe.retrieve).not.toHaveBeenCalled();
  });

  it('keeps the cookie and never calls Stripe in fixture mode', async () => {
    const fixture = mockStripe();
    overrideStripeFactoryForTests(() => fixture.client);
    await fillCart();
    const kept = cookieCart();
    expect(kept).toBeTruthy();
    expect((await complete()).status).toBe(303);
    expect(fixture.retrieve).not.toHaveBeenCalled();
    expect(cookieCart()).toBe(kept);
  });
});

describe('POST /api/webhooks/stripe', () => {
  const post = (body: string, signature: string | null) =>
    webhookPOST(new Request('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: signature === null ? {} : { 'stripe-signature': signature },
      body,
    }));

  it('rejects missing and bad signatures with 400 and no detail', async () => {
    stubStripe();
    for (const sig of [null, 'bad', sign('{}', 'whsec_other')]) {
      const res = await post('{}', sig);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_request' });
    }
  });

  it('verifies against the RAW body (odd whitespace survives) and fulfils the order end to end', async () => {
    const stripe = stubStripe();
    const cart = (await (await fillWithProvince()).json()).cart;
    const redirect = await checkoutPOST(new Request('http://localhost:3000/api/checkout', { method: 'POST' }));
    expect(redirect.status).toBe(303);
    const params = (stripe.create.mock.calls as unknown as [{ metadata: unknown; line_items: { quantity: number; price_data: { unit_amount: number } }[] }][])[0][0];
    const session = { id: SESSION_ID, payment_status: 'paid', currency: 'cad', amount_subtotal: 2400, amount_total: 2712, metadata: params.metadata, total_details: { amount_shipping: 0, amount_tax: 312, amount_discount: 0, breakdown: { discounts: [], taxes: [{ amount: 312, rate: stripe.rates.find((r) => r.id === 'txr_test_CA_HST_ON'), taxability_reason: 'standard_rated', taxable_amount: 2400 }] } }, customer_details: { email: 'x@example.com' }, collected_information: { shipping_details: { name: 'X', address: { line1: '1 Test St', city: 'Toronto', state: 'ON', postal_code: 'M5V 2T6', country: 'CA' } } } };
    const body = `  ${sessionEvent('checkout.session.completed', session, 'evt_route_1').replace(/,"/g, ',  "')}\n`;
    const res = await post(body, realStripe.webhooks.generateTestHeaderString({ payload: body, secret: TEST_ENV.STRIPE_WEBHOOK_SECRET }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const again = await post(body, realStripe.webhooks.generateTestHeaderString({ payload: body, secret: TEST_ENV.STRIPE_WEBHOOK_SECRET }));
    expect(again.status).toBe(200);
    expect((await (await cartGET()).json()).cart).toBeNull(); // completed cart is gone
    expect(cart.id).toBeTruthy();
  });

  it('is unavailable (503) in fixture mode and rejects other methods', async () => {
    expect((await post('{}', sign('{}'))).status).toBe(503);
    const get = await webhookGET();
    expect(get.status).toBe(405);
  });
});

describe('price changes: acknowledge route and checkout redirect', () => {
  const fill = () => fillWithProvince();
  const ack = (headers: Record<string, string> = {}, body: unknown = undefined) =>
    ackPOST(json('POST', '/api/storefront/cart/price-changes/acknowledge', body, headers));
  const checkout = () => checkoutPOST(new Request('http://localhost:3000/api/checkout', { method: 'POST' }));

  it('POST acknowledge: private/no-store, cookie cart, clears hasPriceChanges', async () => {
    const created = (await (await fill()).json()).cart;
    const { getRepository } = await import('@/lib/commerce/repository-factory');
    await (await getRepository()).updateVariant(V.hero30, { priceMinor: 2800 });
    const before = await (await cartGET()).json();
    expect(before.cart.hasPriceChanges).toBe(true);
    expect(before.cart.lines.nodes[0].priceAtAdd.amount).toBe('24.00');

    const res = await ack({ 'sec-fetch-site': 'same-origin' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(PRIVATE);
    const payload = await res.json();
    expect(payload.userErrors).toEqual([]);
    expect(payload.cart.id).toBe(created.id);
    expect(payload.cart.hasPriceChanges).toBe(false);
    expect(payload.cart.lines.nodes[0].priceAtAdd.amount).toBe('28.00');
    // Retrying is harmless.
    expect((await (await ack()).json()).cart.hasPriceChanges).toBe(false);
  });

  it('rejects cross-site, non-JSON, non-empty bodies and other methods', async () => {
    await fill();
    expect((await ack({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await ackPOST(new Request('http://localhost:3000/x', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }))).status).toBe(400);
    expect((await ack({}, { cartId: 'gid://crater/Cart/other' })).status).toBe(400);
    expect((await ack({}, [1])).status).toBe(400);
    const get = ackGET();
    expect(get.status).toBe(405);
  });

  it('without a cart cookie, or with an expired cart, reports MISSING_CART and clears the dead cookie', async () => {
    const none = await (await ack()).json();
    expect(none).toMatchObject({ cart: null, userErrors: [{ code: 'MISSING_CART' }] });
    jar.values.set(CART_COOKIE, 'gid://crater/Cart/' + 'A'.repeat(32));
    const dead = await (await ack()).json();
    expect(dead).toMatchObject({ cart: null, userErrors: [{ code: 'MISSING_CART' }] });
    expect(jar.values.has(CART_COOKIE)).toBe(false);
  });

  it('POST /api/checkout redirects to PRICE_CHANGED without calling Stripe, then proceeds once acknowledged', async () => {
    const stripe = stubStripe();
    await fill();
    const { getRepository } = await import('@/lib/commerce/repository-factory');
    await (await getRepository()).updateVariant(V.hero30, { priceMinor: 2800 });
    const blocked = await checkout();
    expect(blocked.status).toBe(303);
    expect(blocked.headers.get('location')).toBe('/cart?checkout_error=PRICE_CHANGED');
    expect(stripe.create).not.toHaveBeenCalled();
    await ack();
    const ok = await checkout();
    expect(ok.headers.get('location')).toBe(STRIPE_URL);
    expect(stripe.create).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /api/storefront/cart (ship-to province)', () => {
  const patch = (body: unknown, headers: Record<string, string> = {}) => cartPATCH(json('PATCH', '/api/storefront/cart', body, headers));

  it('sets the province on the cookie cart, returns tax lines, and is never cached', async () => {
    await fillWithProvince(null);
    const res = await patch({ buyerIdentity: { provinceCode: 'SK' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(PRIVATE);
    const body = await res.json();
    expect(body.userErrors).toEqual([]);
    expect(body.cart.cost.taxLines.map((l: { key: string }) => l.key)).toEqual(['CA_GST', 'SK_PST']);
    expect(body.cart.cost.totalTaxAmount.amount).toBe('2.64');
    expect(body.cart.cost.totalAmount.amount).toBe('26.64');
    expect(body.cart.buyerIdentity.provinceCode).toBe('SK');
    expect((await (await cartGET()).json()).cart.buyerIdentity.provinceCode).toBe('SK');
    // Retrying the same absolute value is harmless; null clears it.
    expect((await (await patch({ buyerIdentity: { provinceCode: 'SK' } })).json()).cart.cost.totalTaxAmount.amount).toBe('2.64');
    expect((await (await patch({ buyerIdentity: { provinceCode: null } })).json()).cart.cost.totalTaxAmount).toBeNull();
  });

  it('an invalid province is a userError (INVALID at buyerIdentity.provinceCode), not an HTTP error, and changes nothing', async () => {
    await fillWithProvince('ON');
    const body = await (await patch({ buyerIdentity: { provinceCode: 'XX' } })).json();
    expect(body.userErrors).toEqual([{ code: 'INVALID', field: ['buyerIdentity', 'provinceCode'], message: expect.any(String) }]);
    expect(body.cart.buyerIdentity.provinceCode).toBe('ON');
  });

  it('rejects malformed bodies (400), cross-site requests (403) and a missing cart (MISSING_CART)', async () => {
    await fillWithProvince('ON');
    for (const bad of [{}, { buyerIdentity: 'SK' }, { buyerIdentity: { provinceCode: 5 } }, { buyerIdentity: { price: 1 } }, { buyerIdentity: {}, extra: 1 }, '{nope']) {
      expect((await patch(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await patch({ buyerIdentity: { provinceCode: 'SK' } }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await cartPATCH(new Request('http://localhost:3000/api/storefront/cart', { method: 'PATCH', headers: { 'content-type': 'text/plain' }, body: '{}' }))).status).toBe(400);
    jar.values.clear();
    expect(await (await patch({ buyerIdentity: { provinceCode: 'SK' } })).json()).toMatchObject({ cart: null, userErrors: [{ code: 'MISSING_CART' }] });
    jar.values.set(CART_COOKIE, 'gid://crater/Cart/' + 'A'.repeat(32));
    expect(await (await patch({ buyerIdentity: { provinceCode: 'SK' } })).json()).toMatchObject({ cart: null, userErrors: [{ code: 'MISSING_CART' }] });
    expect(jar.values.has(CART_COOKIE)).toBe(false);
  });
});
