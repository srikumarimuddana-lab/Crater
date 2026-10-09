import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRepositoryForTests } from '@/lib/commerce/repository-factory';
import { overrideStripeFactoryForTests, resetServicesForTests } from '@/lib/commerce/services';
import { CART_COOKIE } from '@/lib/commerce/cart-cookie';
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
import { POST as webhookPOST, GET as webhookGET } from '@/app/api/webhooks/stripe/route';
import { GET as productsGET } from '@/app/api/storefront/products/route';
import { GET as productGET } from '@/app/api/storefront/products/[handle]/route';
import { GET as cartGET, POST as cartPOST } from '@/app/api/storefront/cart/route';
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

const useStripe = () => {
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

describe('catalog routes', () => {
  it('GET /api/storefront/products lists, filters, paginates, and is briefly publicly cacheable', async () => {
    const res = await productsGET(new Request('http://localhost:3000/api/storefront/products?first=2&sortKey=TITLE&reverse=true'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/^public, .*s-maxage=60/);
    expect(res.headers.get('set-cookie')).toBeNull();
    const page = await res.json();
    expect(page.nodes.map((p: { handle: string }) => p.handle)).toEqual(['mineral-serum', 'lip-cheek-balm']);
    const next = await productsGET(new Request(`http://localhost:3000/api/storefront/products?first=2&sortKey=TITLE&reverse=true&after=${page.pageInfo.endCursor}`));
    expect((await next.json()).nodes[0].handle).toBe('gel-cleanser');
    const q = await productsGET(new Request('http://localhost:3000/api/storefront/products?query=product_type%3AMist'));
    expect((await q.json()).nodes.map((p: { handle: string }) => p.handle)).toEqual(['facial-mist']);
    const c = await productsGET(new Request('http://localhost:3000/api/storefront/products?collection=balms'));
    expect((await c.json()).nodes).toHaveLength(1);
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
    const ok = await productGET(new Request('http://x'), ctx('mineral-serum'));
    expect(ok.status).toBe(200);
    expect((await ok.json()).variants[0].title).toBe('30 mL');
    for (const h of ['nope', 'Mineral-Serum', '../etc', 'a'.repeat(200)]) expect((await productGET(new Request('http://x'), ctx(h))).status, h).toBe(404);
  });
});

describe('cart routes', () => {
  it('POST /cart creates a cart, sets a hardened cookie, and responds private/no-store', async () => {
    const res = await cartPOST(json('POST', '/api/storefront/cart', { lines: [{ merchandiseId: V.serum30, quantity: 2 }] }));
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
    const first = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.cleanser }] }));
    const created = (await first.json()).cart;
    expect(created.lines.nodes).toHaveLength(1);
    const second = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.cleanser, quantity: 2 }] }));
    const merged = (await second.json()).cart;
    expect(merged.id).toBe(created.id);
    expect(merged.lines.nodes[0].quantity).toBe(3);
    expect(second.headers.get('cache-control')).toBe(PRIVATE);
  });

  it('recreates the cart when the cookie points at an expired or unknown cart', async () => {
    jar.values.set(CART_COOKIE, 'gid://crater/Cart/' + 'z'.repeat(32));
    const res = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.serum30 }] }));
    const body = await res.json();
    expect(body.userErrors).toEqual([]);
    expect(body.cart.id).not.toContain('zzzz');
    expect(jar.values.get(CART_COOKIE)).toBe(body.cart.id);
  });

  it('a malformed cookie value is ignored', async () => {
    jar.values.set(CART_COOKIE, "'; drop table carts; --");
    expect((await (await cartGET()).json()).cart).toBeNull();
    const res = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.serum30 }] }));
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
    const created = (await (await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.serum30 }, { merchandiseId: V.cleanser }] }))).json()).cart;
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
      ['unknown top-level field', { lines: [{ merchandiseId: V.serum30 }], extra: 1 }],
      ['unknown line field', { lines: [{ merchandiseId: V.serum30, price: '0.01' }] }],
      ['string quantity', { lines: [{ merchandiseId: V.serum30, quantity: '2' }] }],
      ['no lines', { lines: [] }],
      ['lines not a list', { lines: 'x' }],
      ['too many lines', { lines: Array.from({ length: 51 }, () => ({ merchandiseId: V.serum30 })) }],
      ['array body', []],
      ['bad JSON', '{not json'],
      ['wrong content type', { lines: [{ merchandiseId: V.serum30 }] }, { 'content-type': 'text/plain' }],
      ['oversized', { lines: [{ merchandiseId: V.serum30, attributes: [{ key: 'k', value: 'v'.repeat(20000) }] }] }],
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
    const res = await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.serum30, quantity: 99 }] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userErrors[0]).toMatchObject({ code: 'GREATER_THAN' });
    expect(body.cart).toBeNull();
    expect(jar.sets).toHaveLength(0); // nothing was created, no cookie
  });

  it('blocks cross-site state changes', async () => {
    const headers = { 'sec-fetch-site': 'cross-site' };
    expect((await cartPOST(json('POST', '/api/storefront/cart', {}, headers))).status).toBe(403);
    expect((await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.serum30 }] }, headers))).status).toBe(403);
    expect((await linesDELETE(json('DELETE', '/api/storefront/cart/lines', { lineIds: ['x'] }, headers))).status).toBe(403);
    const same = await cartPOST(json('POST', '/api/storefront/cart', {}, { 'sec-fetch-site': 'same-origin' }));
    expect(same.status).toBe(200);
  });
});

describe('POST /api/checkout', () => {
  const post = (headers: Record<string, string> = {}) => checkoutPOST(new Request('http://localhost:3000/api/checkout', { method: 'POST', headers }));
  const fillCart = () => linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.serum30 }] }));

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
    const stripe = useStripe();
    await fillCart();
    const res = await post({ 'sec-fetch-site': 'same-origin' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(STRIPE_URL);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(stripe.create).toHaveBeenCalledTimes(1);
  });

  it('never redirects to a non-Stripe host', async () => {
    const stripe = useStripe();
    stripe.create.mockResolvedValueOnce({ id: SESSION_ID, url: 'https://evil.example/pay' } as never);
    await fillCart();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await post();
    expect(res.headers.get('location')).toBe('/cart?checkout_error=PAYMENT_PROVIDER_UNAVAILABLE');
  });

  it('rejects cross-site posts and non-POST methods', async () => {
    useStripe();
    await fillCart();
    expect((await post({ 'sec-fetch-site': 'cross-site' })).headers.get('location')).toBe('/cart?checkout_error=FORBIDDEN');
    const get = await checkoutGET();
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
  });

  it('ignores any price or cart data in the request body', async () => {
    const stripe = useStripe();
    await fillCart();
    await checkoutPOST(new Request('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unit_amount: 1, cartId: 'gid://crater/Cart/' + 'x'.repeat(32) }),
    }));
    const params = (stripe.create.mock.calls as unknown as [{ line_items: { price_data: { unit_amount: number } }[] }][])[0][0];
    expect(params.line_items[0].price_data.unit_amount).toBe(6800);
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
    useStripe();
    for (const sig of [null, 'bad', sign('{}', 'whsec_other')]) {
      const res = await post('{}', sig);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_request' });
    }
  });

  it('verifies against the RAW body (odd whitespace survives) and fulfils the order end to end', async () => {
    const stripe = useStripe();
    const cart = (await (await linesPOST(json('POST', '/api/storefront/cart/lines', { lines: [{ merchandiseId: V.serum30 }] }))).json()).cart;
    const redirect = await checkoutPOST(new Request('http://localhost:3000/api/checkout', { method: 'POST' }));
    expect(redirect.status).toBe(303);
    const params = (stripe.create.mock.calls as unknown as [{ metadata: unknown; line_items: { quantity: number; price_data: { unit_amount: number } }[] }][])[0][0];
    const session = { id: SESSION_ID, payment_status: 'paid', currency: 'cad', amount_subtotal: 6800, amount_total: 6800, metadata: params.metadata, total_details: { amount_shipping: 0, amount_tax: 0, amount_discount: 0 }, customer_details: { email: 'x@example.com' } };
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
