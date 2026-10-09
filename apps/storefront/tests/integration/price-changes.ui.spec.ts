import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { closeDb, fakeSessions, resetCommerceData, setBagProvince, setVariantPrice } from './helpers';

/**
 * Price-changed banner (J6.2) in a real browser against Postgres and a fake Stripe: the banner in the
 * drawer and on /cart, checkout blocked until the shopper accepts the new prices, then the redirect to
 * hosted Checkout. Serial, with a clean database before every test.
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => {
  await resetCommerceData();
});
test.afterAll(async () => {
  await closeDb();
});

const HERO_30 = 'SAMPLE-LBO-30'; // Lemon Balm & Oat Extract 30 mL, $24.00
const PEPPERMINT_30 = 'SAMPLE-PG-30'; // Peppermint & Ginger Extract 30 mL, $22.00
/** Optional: SHOTS_DIR=/some/dir saves screenshots of the banner for visual review. */
async function shot(page: Page, name: string, testInfo: TestInfo) {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}-${testInfo.project.name}.png` });
}
const drawer = (page: Page) => page.getByRole('dialog', { name: /your bag/i });

async function add(page: Page, handle: string) {
  await page.goto(`/products/${handle}`);
  await page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i }).click();
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
}

/** Hosted Checkout is never visited: the 303 is read without following it, then fulfilled locally. */
async function interceptStripe(page: Page) {
  const reached: string[] = [];
  const answers: { status: number; location: string | null }[] = [];
  await page.route('https://checkout.stripe.com/**', async (route) => {
    reached.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Fake Stripe Checkout</title><h1>Fake hosted checkout</h1>' });
  });
  await page.route('**/api/checkout', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch({ maxRedirects: 0 });
    const location = response.headers()['location'] ?? null;
    answers.push({ status: response.status(), location });
    if (response.status() === 303 && location && new URL(location, response.url()).host === 'checkout.stripe.com') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><script>location.replace(${JSON.stringify(location)})</script>` });
    } else {
      await route.fulfill({ response });
    }
  });
  return { reached, answers };
}

test('/cart: banner with old and new price, checkout blocked, accept, then the Stripe redirect', async ({ page }, testInfo) => {
  const stripe = await interceptStripe(page);
  await add(page, 'lemon-balm-oat-extract');
  await setBagProvince(page, 'ON');

  // No change yet: no banner.
  await page.goto('/cart');
  await expect(page.getByTestId('price-change-notice')).toHaveCount(0);

  await setVariantPrice(HERO_30, 2800); // $24.00 -> $28.00 (an owner edit)
  await page.goto('/cart');
  const main = page.locator('main');
  const banner = main.getByTestId('price-change-notice');
  await expect(banner).toHaveAttribute('role', 'status');
  await expect(banner).toContainText('The price of Lemon Balm & Oat Extract changed from $24.00 CAD to $28.00 CAD');
  await expect(banner).toContainText('Current subtotal');
  await expect(banner).toContainText('$28.00 CAD');
  await expect(banner.getByRole('button', { name: 'Accept new prices' })).toBeVisible();
  // The changed line shows the old price struck through next to the new one.
  const line = main.getByRole('listitem').filter({ hasText: 'Lemon Balm & Oat Extract' });
  await expect(line.locator('s')).toContainText('$24.00 CAD');
  await expect(line.locator('s')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(line).toContainText('$28.00 CAD');
  await shot(page, 'cart-price-banner', testInfo);

  // Checkout is blocked and Stripe is never called.
  await main.getByRole('button', { name: /^checkout$/i }).click();
  await expect(page).toHaveURL(/\/cart\?checkout_error=PRICE_CHANGED$/);
  await expect(main.getByRole('alert')).toContainText('A price in your bag has changed since you added it');
  await expect(main.getByTestId('price-change-notice')).toBeVisible();
  expect(stripe.answers.at(-1)).toMatchObject({ status: 303, location: '/cart?checkout_error=PRICE_CHANGED' });
  expect(stripe.reached).toEqual([]);
  expect(await fakeSessions()).toEqual([]);

  // Accept: banner and the stale error go away, a confirmation takes focus.
  await main.getByRole('button', { name: 'Accept new prices' }).click();
  const thanks = main.getByRole('status').filter({ hasText: 'Your bag now shows the current prices' });
  await expect(thanks).toBeVisible();
  await expect(thanks).toBeFocused();
  await expect(main.getByTestId('price-change-notice')).toHaveCount(0);
  await expect(main.getByRole('alert')).toHaveCount(0);
  await expect(line.locator('s')).toHaveCount(0);

  // Checkout now reaches the Stripe redirect, charging the new server price.
  await main.getByRole('button', { name: /^checkout$/i }).click();
  await expect.poll(() => stripe.reached.length).toBe(1);
  expect(stripe.reached[0]).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
  const [session] = await fakeSessions();
  expect(session.amount_subtotal).toBe(2800);
  expect(session.line_items_requested).toEqual([expect.objectContaining({ quantity: 1, unit_amount: 2800 })]);
});

test('drawer: banner shown, checkout from the drawer lands on /cart blocked, accept in the drawer', async ({ page }, testInfo) => {
  const stripe = await interceptStripe(page);
  await add(page, 'lemon-balm-oat-extract');
  await setBagProvince(page, 'ON');
  await setVariantPrice(HERO_30, 2000); // a decrease also counts as a change

  await page.goto('/products/lemon-balm-oat-extract');
  await page.getByRole('button', { name: /^bag\b/i }).click();
  const dlg = drawer(page);
  const banner = dlg.getByTestId('price-change-notice');
  await expect(banner).toContainText('changed from $24.00 CAD to $20.00 CAD');
  await expect(banner).toContainText('$20.00 CAD');
  await shot(page, 'drawer-price-banner', testInfo);

  // Accept inside the drawer: focus stays inside the dialog and the banner is replaced.
  await banner.getByRole('button', { name: 'Accept new prices' }).click();
  await expect(dlg.getByRole('status').filter({ hasText: 'current prices' })).toBeFocused();
  await expect(dlg.getByTestId('price-change-notice')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // A second change, then checkout straight from the drawer.
  await setVariantPrice(HERO_30, 2600);
  await page.goto('/products/lemon-balm-oat-extract');
  await page.getByRole('button', { name: /^bag\b/i }).click();
  await expect(drawer(page).getByTestId('price-change-notice')).toBeVisible();
  await drawer(page).getByRole('button', { name: /^checkout$/i }).click();
  await expect(page).toHaveURL(/\/cart\?checkout_error=PRICE_CHANGED$/);
  await expect(page.locator('main').getByRole('alert')).toContainText('A price in your bag has changed');
  expect(stripe.reached).toEqual([]);
  expect(await fakeSessions()).toEqual([]);
});

test('several changed lines use the generic message', async ({ page }) => {
  await add(page, 'lemon-balm-oat-extract');
  await add(page, 'peppermint-ginger-extract');
  await setVariantPrice(HERO_30, 2500);
  await setVariantPrice(PEPPERMINT_30, 2300);
  await page.goto('/cart');
  const banner = page.locator('main').getByTestId('price-change-notice');
  await expect(banner).toContainText('Some prices in your bag have changed');
  await expect(banner).toContainText('$48.00 CAD');
  await expect(page.locator('main').locator('s')).toHaveCount(2);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('Accept new prices works as a plain form post', async ({ page }) => {
    await page.goto('/products/lemon-balm-oat-extract');
    await page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i }).click();
    await expect(page.getByText(/added to your bag/i)).toBeVisible();
    await setVariantPrice(HERO_30, 2800);

    await page.goto('/cart');
    const main = page.locator('main');
    await expect(main.getByTestId('price-change-notice')).toContainText('changed from $24.00 CAD to $28.00 CAD');
    await main.getByRole('button', { name: 'Accept new prices' }).click();
    await expect(main.getByTestId('price-change-notice')).toHaveCount(0);
    await expect(main.getByText('Your bag now shows the current prices')).toBeVisible();
    await expect(main.getByText('$28.00 CAD').first()).toBeVisible();
  });
});
