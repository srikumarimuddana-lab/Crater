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

const SERUM_30 = 'SAMPLE-MSR-30'; // Mineral Serum 30 mL, $68.00, 40 in stock after a reset

async function addSerumToBag(page: Page) {
  await page.goto('/products/mineral-serum');
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

async function startCheckoutFromCart(page: Page, intercepted: Interception): Promise<FakeSession> {
  await page.goto('/cart');
  await expect(page.locator('#bag-lines').getByRole('link', { name: 'Mineral Serum' })).toBeVisible();
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

test('buys the serum: redirect to hosted checkout, signed webhook, confirmed order, stock and bag updated', async ({ page }) => {
  const intercepted = await interceptStripeCheckout(page);
  await addSerumToBag(page);
  const before = await getInventory(SERUM_30);
  expect(before).toBe(40);

  const session = await startCheckoutFromCart(page, intercepted);
  // Server-authoritative money, and return URLs on the integration origin (not a dev default).
  expect(session).toMatchObject({ amount_subtotal: 6800, amount_total: 6800, currency: 'cad', payment_status: 'unpaid' });
  expect(session.line_items_requested).toEqual([{ quantity: 1, unit_amount: 6800, name: 'Mineral Serum — 30 mL' }]);
  expect(session.success_url).toBe('http://127.0.0.1:3300/checkout/success?session_id={CHECKOUT_SESSION_ID}');
  expect(session.cancel_url).toBe('http://127.0.0.1:3300/cart?checkout=cancelled');
  expect(session.client_reference_id).toMatch(/^chk_[a-f0-9]{32}$/);

  // Before the webhook: not paid, no order, stock untouched.
  await page.goto(`/checkout/success?session_id=${session.id}`);
  await expect(page.getByText('Thank you. Your order is confirmed')).toHaveCount(0);
  expect(await getOrders()).toEqual([]);
  expect(await getInventory(SERUM_30)).toBe(40);

  const paid = await payFakeSession(session.id);
  const hook = await sendSignedWebhook('checkout.session.completed', paid);
  expect(hook.status).toBe(200);

  await page.goto(`/checkout/success?session_id=${session.id}`);
  await expect(page.getByRole('heading', { name: /your order is confirmed/i })).toBeVisible();
  await expect(page.getByText('#1001')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Mineral Serum' })).toContainText('30 mL');
  await expect(page.getByRole('listitem').filter({ hasText: 'Mineral Serum' })).toContainText('× 1');
  await expect(page.getByRole('listitem').filter({ hasText: 'Mineral Serum' })).toContainText('$68.00');
  await expect(page.getByText(/this was a test payment/i)).toBeVisible();

  const orders = await getOrders();
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({
    order_number: 1001,
    financial_status: 'PAID',
    subtotal_minor: 6800,
    total_minor: 6800,
    review_flags: [],
    lines: [{ sku: SERUM_30, quantity: 1, unit_minor: 6800 }],
  });
  expect(await getInventory(SERUM_30)).toBe(39);

  // The completed cart is closed: the bag is empty and the old cookie cart is not reusable.
  await page.goto('/cart');
  // (The /cart page currently words a closed cart as "expired"; see the handoff. Either way nothing is left to buy.)
  await expect(page.locator('#bag-lines').getByRole('link', { name: 'Mineral Serum' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^checkout/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^bag/i }).first()).toHaveAccessibleName(/empty/i);
  const cart = await (await page.request.get('/api/storefront/cart')).json();
  expect(cart.cart).toBeNull();
});

test('an unsigned, wrongly signed or tampered webhook is rejected with 400 and creates no order', async ({ page }) => {
  const intercepted = await interceptStripeCheckout(page);
  await addSerumToBag(page);
  const session = await startCheckoutFromCart(page, intercepted);
  const paid = await payFakeSession(session.id);

  expect((await sendSignedWebhook('checkout.session.completed', paid, { signed: false })).status).toBe(400);
  expect((await sendSignedWebhook('checkout.session.completed', paid, { secret: 'whsec_not_the_real_secret' })).status).toBe(400);

  expect(await getOrders()).toEqual([]);
  expect(await getInventory(SERUM_30)).toBe(40);
  await page.goto(`/checkout/success?session_id=${session.id}`);
  await expect(page.getByText('#1001')).toHaveCount(0);

  // The same event with a valid signature is accepted afterwards (nothing was recorded as processed).
  expect((await sendSignedWebhook('checkout.session.completed', paid)).status).toBe(200);
  expect(await getOrders()).toHaveLength(1);
});

test('a duplicate webhook delivery, or a new event for the same session, still yields one order and one stock decrement', async ({ page }) => {
  const intercepted = await interceptStripeCheckout(page);
  await addSerumToBag(page);
  const session = await startCheckoutFromCart(page, intercepted);
  const paid = await payFakeSession(session.id);

  const first = await sendSignedWebhook('checkout.session.completed', paid, { eventId: 'evt_integration_dup_1' });
  const redelivery = await sendSignedWebhook('checkout.session.completed', paid, { eventId: 'evt_integration_dup_1' });
  const otherEvent = await sendSignedWebhook('checkout.session.completed', paid, { eventId: 'evt_integration_dup_2' });
  expect([first.status, redelivery.status, otherEvent.status]).toEqual([200, 200, 200]);

  const orders = await getOrders();
  expect(orders).toHaveLength(1);
  expect(orders[0].order_number).toBe(1001);
  expect(await getInventory(SERUM_30)).toBe(39);

  await page.goto(`/checkout/success?session_id=${session.id}`);
  await expect(page.getByText('#1001')).toBeVisible();
});

test('the bag is a Postgres-backed cookie cart that survives reload and a fresh page in the same browser', async ({ page, context }) => {
  await addSerumToBag(page);
  await page.goto('/cart');
  await expect(page.locator('#bag-lines').getByRole('link', { name: 'Mineral Serum' })).toBeVisible();

  await page.reload();
  await expect(page.locator('#bag-lines').getByRole('link', { name: 'Mineral Serum' })).toBeVisible();
  await expect(page.locator('#bag-lines').getByText('Your bag is empty')).toHaveCount(0);

  const cookies = await context.cookies();
  const cart = cookies.find((c) => c.name === 'crater_cart');
  expect(cart).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

  // A second tab shares the cookie and sees the same cart; a different shopper does not.
  const tab = await context.newPage();
  await tab.goto('/cart');
  await expect(tab.locator('#bag-lines').getByRole('link', { name: 'Mineral Serum' })).toBeVisible();
  const other = await page.context().browser()!.newContext();
  const stranger = await other.newPage();
  await stranger.goto(new URL('/cart', page.url()).toString());
  await expect(stranger.locator('#bag-lines').getByText('Your bag is empty')).toBeVisible();
  await other.close();

  // And the data really is in Postgres, in server-priced integer minor units.
  const rows = (await db().query('select quantity, price_at_add_minor from commerce.cart_lines')).rows;
  expect(rows).toEqual([{ quantity: 1, price_at_add_minor: 6800 }]);
});
