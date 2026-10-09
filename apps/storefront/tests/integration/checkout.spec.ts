import { expect, test, type Page } from '@playwright/test';
import {
  closeDb,
  db,
  fakeSessions,
  getInventory,
  getOrders,
  payFakeSession,
  resetCommerceData,
  sendSignedWebhook,
  setBagProvince,
  type FakeSession,
} from './helpers';

/**
 * Real browser -> production build -> Postgres, with a fake Stripe. The hosted Checkout page is
 * never visited: navigation to https://checkout.stripe.com is intercepted and fulfilled locally.
 * Serial, with a clean database before every test.
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => {
  await resetCommerceData();
});
test.afterAll(async () => {
  await closeDb();
});

const HERO_30 = 'SAMPLE-LBO-30'; // Lemon Balm & Oat Extract 30 mL, $24.00, 40 in stock after a reset
const HERO_NAME = 'Lemon Balm & Oat Extract';

async function addHeroToBag(page: Page) {
  await page.goto('/products/lemon-balm-oat-extract');
  await page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i }).click();
  await expect(page.getByRole('dialog', { name: /your bag/i })).toBeVisible();
}

type Interception = {
  /** URLs the browser requested on checkout.stripe.com (all fulfilled locally; nothing leaves the machine). */
  reached: string[];
  /** What POST /api/checkout answered, as the server sent it. */
  checkoutResponses: { status: number; location: string | null; cacheControl: string | null }[];
};

/**
 * Intercepts hosted Checkout so the suite never touches the real Stripe. Chromium does not hand
 * redirect-chained requests to page.route, so the 303 from POST /api/checkout is fetched with
 * redirects disabled (and asserted), then the browser is sent to the same Location with a normal
 * navigation, which the checkout.stripe.com route fulfils with a stand-in page.
 */
async function interceptStripeCheckout(page: Page): Promise<Interception> {
  const state: Interception = { reached: [], checkoutResponses: [] };
  await page.route('https://checkout.stripe.com/**', async (route) => {
    state.reached.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Fake Stripe Checkout</title><h1>Fake hosted checkout</h1>' });
  });
  await page.route('**/api/checkout', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch({ maxRedirects: 0 });
    const location = response.headers()['location'] ?? null;
    state.checkoutResponses.push({ status: response.status(), location, cacheControl: response.headers()['cache-control'] ?? null });
    if (response.status() === 303 && location && new URL(location).host === 'checkout.stripe.com') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><script>location.replace(${JSON.stringify(location)})</script>` });
    } else {
      await route.fulfill({ response });
    }
  });
  return state;
}

async function startCheckoutFromCart(page: Page, intercepted: Interception, province = 'ON'): Promise<FakeSession> {
  await setBagProvince(page, province); // tax depends on the ship-to province; checkout requires it
  await page.goto('/cart');
  await expect(page.locator('#bag-lines').getByRole('link', { name: HERO_NAME })).toBeVisible();
  await page.getByRole('complementary').getByRole('button', { name: /^checkout/i }).click();
  await expect(page.getByRole('heading', { name: 'Fake hosted checkout' })).toBeVisible();
  const { reached, checkoutResponses } = intercepted;
  const sessions = await fakeSessions();
  expect(sessions).toHaveLength(1);
  const session = sessions[0];
  // The server answered 303 -> the Stripe-hosted URL, uncached, and the browser really requested that host.
  expect(checkoutResponses).toEqual([{ status: 303, location: session.url, cacheControl: 'no-store' }]);
  expect(reached).toEqual([session.url]);
  expect(new URL(reached[0]).host).toBe('checkout.stripe.com');
  return session;
}

test('buys the hero product: redirect to hosted checkout, signed webhook, confirmed order, stock and bag updated', async ({ page }) => {
  const intercepted = await interceptStripeCheckout(page);
  await addHeroToBag(page);
  const before = await getInventory(HERO_30);
  expect(before).toBe(40);

  const session = await startCheckoutFromCart(page, intercepted);
  // Server-authoritative money, and return URLs on the integration origin (not a dev default).
  // Ontario bag: HST 13% of $24.00 = $3.12, charged through a fixed tax rate on the line item.
  expect(session).toMatchObject({ amount_subtotal: 2400, amount_total: 2712, currency: 'cad', payment_status: 'unpaid', total_details: { amount_tax: 312 } });
  expect(session.line_items_requested).toEqual([{ quantity: 1, unit_amount: 2400, name: `${HERO_NAME} — 30 mL`, tax_rates: [expect.stringMatching(/^txr_/)] }]);
  expect(session.shipping_address_collection).toEqual({ allowed_countries: ['CA'] });
  expect(session.metadata.tax_province).toBe('ON');
  // Stripe returns the buyer to /api/checkout/complete, which reconciles the cart cookie and 303s to the confirmation.
  expect(session.success_url).toBe('http://127.0.0.1:3300/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}');
  expect(session.cancel_url).toBe('http://127.0.0.1:3300/cart?checkout=cancelled');
  expect(session.client_reference_id).toMatch(/^chk_[a-f0-9]{32}$/);

  // Before the webhook: not paid, no order, stock untouched.
  await page.goto(`/checkout/success?session_id=${session.id}`);
  await expect(page.getByText('Thank you. Your order is confirmed')).toHaveCount(0);
  expect(await getOrders()).toEqual([]);
  expect(await getInventory(HERO_30)).toBe(40);

  const paid = await payFakeSession(session.id);
  const hook = await sendSignedWebhook('checkout.session.completed', paid);
  expect(hook.status).toBe(200);

  // The buyer comes back the way Stripe sends them: through /api/checkout/complete (success_url).
  // The server compares the session's cart digest with the cookie cart, clears the cookie, and 303s on.
  const cartCookie = async () => (await page.context().cookies()).find((c) => c.name === 'crater_cart' && c.value !== '');
  expect(await cartCookie()).toBeDefined();
  const landing = await page.goto(`/api/checkout/complete?session_id=${session.id}`);
  expect(landing!.request().redirectedFrom()?.url()).toContain('/api/checkout/complete');
  await expect(page).toHaveURL(`/checkout/success?session_id=${session.id}`);
  expect(await cartCookie()).toBeUndefined();
  await expect(page.getByRole('heading', { name: /your order is confirmed/i })).toBeVisible();
  await expect(page.getByText('#1001')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: HERO_NAME })).toContainText('30 mL');
  await expect(page.getByRole('listitem').filter({ hasText: HERO_NAME })).toContainText('× 1');
  await expect(page.getByRole('listitem').filter({ hasText: HERO_NAME })).toContainText('$24.00');
  await expect(page.getByText(/this was a test payment/i)).toBeVisible();

  const orders = await getOrders();
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({
    order_number: 1001,
    financial_status: 'PAID',
    subtotal_minor: 2400,
    tax_minor: 312,
    total_minor: 2712,
    tax_province: 'ON',
    shipping_province: 'ON',
    review_flags: [],
    lines: [{ sku: HERO_30, quantity: 1, unit_minor: 2400 }],
  });
  expect(await getInventory(HERO_30)).toBe(39);

  // Admin Slice 1: the webhook snapshots the address Stripe collected and writes the stock movement in the same transaction.
  const stored = await db().query(
    `select o.shipping_address, o.fulfilment_status,
            (select json_agg(json_build_object('delta', m.delta, 'reason', m.reason, 'after', m.available_after, 'sku', m.sku))
               from commerce.inventory_movements m where m.order_id = o.id) as movements
       from commerce.orders o`,
  );
  expect(stored.rows[0].shipping_address).toMatchObject({ name: 'Test Buyer', line1: '100 Sample Street', city: 'Toronto', province: 'ON', postalCode: 'M5V 2T6', country: 'CA' });
  expect(stored.rows[0].fulfilment_status).toBe('UNFULFILLED');
  expect(stored.rows[0].movements).toEqual([{ delta: -1, reason: 'ORDER_PAID', after: 39, sku: HERO_30 }]);

  // The completed cart is closed and the cookie is gone: the bag is the normal empty bag, never "expired".
  await page.goto('/cart');
  await expect(page.locator('#bag-lines').getByText('Your bag is empty')).toBeVisible();
  await expect(page.getByText(/your bag has expired/i)).toHaveCount(0);
  await expect(page.locator('#bag-lines').getByRole('link', { name: HERO_NAME })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^checkout/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^bag/i }).first()).toHaveAccessibleName(/empty/i);
  const cart = await (await page.request.get('/api/storefront/cart')).json();
  expect(cart.cart).toBeNull();
});

test('returning to /api/checkout/complete before the session is paid keeps the bag, and a malformed id is ignored', async ({ page }) => {
  const intercepted = await interceptStripeCheckout(page);
  await addHeroToBag(page);
  const session = await startCheckoutFromCart(page, intercepted);
  const cartCookie = async () => (await page.context().cookies()).find((c) => c.name === 'crater_cart' && c.value !== '');

  // Unfinished session (the buyer abandoned or went back): still redirected, bag untouched.
  await page.goto(`/api/checkout/complete?session_id=${session.id}`);
  await expect(page).toHaveURL(`/checkout/success?session_id=${session.id}`);
  expect(await cartCookie()).toBeDefined();

  // A malformed id never reaches Stripe, is not echoed into the redirect, and keeps the bag.
  const bad = await page.request.get('/api/checkout/complete?session_id=not-a-session', { maxRedirects: 0 });
  expect(bad.status()).toBe(303);
  expect(bad.headers()['location']).toBe('/checkout/success');
  expect(bad.headers()['cache-control']).toBe('no-store');
  expect(await cartCookie()).toBeDefined();

  await page.goto('/cart');
  await expect(page.locator('#bag-lines').getByRole('link', { name: HERO_NAME })).toBeVisible();
});

test('an unsigned, wrongly signed or tampered webhook is rejected with 400 and creates no order', async ({ page }) => {
  const intercepted = await interceptStripeCheckout(page);
  await addHeroToBag(page);
  const session = await startCheckoutFromCart(page, intercepted);
  const paid = await payFakeSession(session.id);

  expect((await sendSignedWebhook('checkout.session.completed', paid, { signed: false })).status).toBe(400);
  expect((await sendSignedWebhook('checkout.session.completed', paid, { secret: 'whsec_not_the_real_secret' })).status).toBe(400);

  expect(await getOrders()).toEqual([]);
  expect(await getInventory(HERO_30)).toBe(40);
  await page.goto(`/checkout/success?session_id=${session.id}`);
  await expect(page.getByText('#1001')).toHaveCount(0);

  // The same event with a valid signature is accepted afterwards (nothing was recorded as processed).
  expect((await sendSignedWebhook('checkout.session.completed', paid)).status).toBe(200);
  expect(await getOrders()).toHaveLength(1);
});

test('a duplicate webhook delivery, or a new event for the same session, still yields one order and one stock decrement', async ({ page }) => {
  const intercepted = await interceptStripeCheckout(page);
  await addHeroToBag(page);
  const session = await startCheckoutFromCart(page, intercepted);
  const paid = await payFakeSession(session.id);

  const first = await sendSignedWebhook('checkout.session.completed', paid, { eventId: 'evt_integration_dup_1' });
  const redelivery = await sendSignedWebhook('checkout.session.completed', paid, { eventId: 'evt_integration_dup_1' });
  const otherEvent = await sendSignedWebhook('checkout.session.completed', paid, { eventId: 'evt_integration_dup_2' });
  expect([first.status, redelivery.status, otherEvent.status]).toEqual([200, 200, 200]);

  const orders = await getOrders();
  expect(orders).toHaveLength(1);
  expect(orders[0].order_number).toBe(1001);
  expect(await getInventory(HERO_30)).toBe(39);

  await page.goto(`/checkout/success?session_id=${session.id}`);
  await expect(page.getByText('#1001')).toBeVisible();
});

test('the bag is a Postgres-backed cookie cart that survives reload and a fresh page in the same browser', async ({ page, context }) => {
  await addHeroToBag(page);
  await page.goto('/cart');
  await expect(page.locator('#bag-lines').getByRole('link', { name: HERO_NAME })).toBeVisible();

  await page.reload();
  await expect(page.locator('#bag-lines').getByRole('link', { name: HERO_NAME })).toBeVisible();
  await expect(page.locator('#bag-lines').getByText('Your bag is empty')).toHaveCount(0);

  const cookies = await context.cookies();
  const cart = cookies.find((c) => c.name === 'crater_cart');
  expect(cart).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

  // A second tab shares the cookie and sees the same cart; a different shopper does not.
  const tab = await context.newPage();
  await tab.goto('/cart');
  await expect(tab.locator('#bag-lines').getByRole('link', { name: HERO_NAME })).toBeVisible();
  const other = await page.context().browser()!.newContext();
  const stranger = await other.newPage();
  await stranger.goto(new URL('/cart', page.url()).toString());
  await expect(stranger.locator('#bag-lines').getByText('Your bag is empty')).toBeVisible();
  await other.close();

  // And the data really is in Postgres, in server-priced integer minor units.
  const rows = (await db().query('select quantity, price_at_add_minor from commerce.cart_lines')).rows;
  expect(rows).toEqual([{ quantity: 1, price_at_add_minor: 2400 }]);
});
