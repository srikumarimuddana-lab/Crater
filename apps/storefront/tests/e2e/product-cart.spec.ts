import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Fixture-mode shop journeys. Carts live in an HTTP-only cookie, so each test's fresh context is its own shopper. */

// The visible text is "Bag (n)"; the accessible name keeps it first and adds visually hidden words (WCAG 2.5.3).
const bagButton = (page: Page) => page.getByRole('button', { name: /^bag\b/i });
const drawer = (page: Page) => page.getByRole('dialog', { name: /your bag/i });

async function addToBag(page: Page) {
  await page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i }).click();
}

async function seriousViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']);
  if (include) builder.include(include);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('J1.3 / J2.1 a card opens its product page with title, price and packshot in the server HTML', async ({ page, request }) => {
  const html = await (await request.get('/products/lemon-balm-oat-extract')).text();
  expect(html).toContain('Lemon Balm & Oat Extract');
  expect(html).toContain('$24.00 CAD');
  expect(html).toContain('/products/lemon-balm-oat-extract/packshot.svg');

  await page.goto('/');
  await page.getByRole('region', { name: /shop all/i }).getByRole('link', { name: 'Peppermint & Ginger Extract' }).click();
  await expect(page).toHaveURL(/\/products\/peppermint-ginger-extract$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Peppermint & Ginger Extract' })).toBeVisible();
  await expect(page.getByText('Sample product', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('J2.2 switching size updates the price and URL, and survives back and reload', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  const fieldset = page.getByRole('group', { name: /choose a size/i });
  await expect(fieldset.getByRole('link', { name: /^30 mL/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('$24.00 CAD').first()).toBeVisible();

  await fieldset.getByRole('link', { name: /^60 mL/ }).click();
  await expect(page).toHaveURL(/\?size=15\+mL$/);
  await expect(page.getByText('$38.00 CAD').first()).toBeVisible();
  await expect(fieldset.getByRole('link', { name: /^60 mL/ })).toHaveAttribute('aria-current', 'true');

  await page.goBack();
  await expect(page).toHaveURL(/\/products\/lemon-balm-oat-extract$/);
  await expect(page.getByText('$24.00 CAD').first()).toBeVisible();

  await page.goto('/products/lemon-balm-oat-extract?size=60+mL');
  await expect(page.getByText('$38.00 CAD').first()).toBeVisible();
});

test('J2.3 an unknown size falls back to the default with a message', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract?size=bogus');
  await expect(page.getByText(/not available for this product/i)).toBeVisible();
  await expect(page.getByText('$24.00 CAD').first()).toBeVisible();
});

test('J2.4 a sold-out size is marked unavailable and cannot be added', async ({ page }) => {
  await page.goto('/products/chamomile-linden-extract?size=60+mL');
  const shade = page.getByRole('group', { name: /choose a size/i });
  await expect(shade.getByRole('link', { name: /^60 mL.*Sold out/i })).toBeVisible();
  await expect(page.getByText(/60 mL is currently unavailable/i)).toBeVisible();
  const add = page.getByRole('button', { name: /currently unavailable/i });
  await expect(add).toBeDisabled();
  await expect(bagButton(page)).toHaveAccessibleName(/empty/i);

  await shade.getByRole('link', { name: /^30 mL/ }).click();
  await expect(page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i })).toBeEnabled();
});

test('J2.4 / J6.3 the server refuses an out-of-stock add and says so without "Added"', async ({ page }) => {
  // Without JavaScript the disabled button cannot be bypassed in the UI, so drive the form directly.
  await page.goto('/products/chamomile-linden-extract?size=60+mL');
  await page.evaluate(() => {
    const btn = document.querySelector<HTMLButtonElement>('#add-to-bag-form button[type=submit]');
    if (btn) btn.disabled = false;
  });
  await page.locator('#add-to-bag-form button[type=submit]').click();
  await expect(page.getByText(/out of stock right now/i)).toBeVisible();
  await expect(page.getByText(/added to (your )?bag/i)).toHaveCount(0);
  await expect(drawer(page)).toBeHidden();
});

test('J2.5 / J6.3 low stock shows the real count and an add of 5 is clamped to 2 with a warning', async ({ page }) => {
  await page.goto('/products/hawthorn-rose-hip-extract?size=30+mL');
  await expect(page.getByText('Low stock: 2 available')).toBeVisible();
  await page.getByLabel('Quantity', { exact: true }).fill('5');
  await addToBag(page);

  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByRole('listitem').filter({ hasText: 'Hawthorn & Rose Hip Extract' })).toContainText('2');
  await expect(drawer(page).getByText(/limited quantity of Hawthorn & Rose Hip Extract/i)).toBeVisible();
  await expect(bagButton(page)).toHaveAccessibleName('Bag (2) items');
});

test('J2.6 / J6.1 out-of-range quantity is explained inline and nothing is added', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  const qty = page.getByLabel('Quantity', { exact: true });
  await qty.fill('11');
  await addToBag(page);
  await expect(page.getByText(/more than can be added/i)).toBeVisible();
  await expect(qty).toHaveAttribute('aria-invalid', 'true');
  await expect(drawer(page)).toBeHidden();
  await expect(bagButton(page)).toHaveAccessibleName(/empty/i);
});

test('J2.7 / J3.2 add opens the drawer with focus inside; Escape closes it and returns focus to the bag button', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  await expect(bagButton(page)).toBeVisible();
  await addToBag(page);

  const dlg = drawer(page);
  await expect(dlg).toBeVisible();
  await expect.poll(() => dlg.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await expect(dlg.getByRole('link', { name: 'Lemon Balm & Oat Extract' })).toBeVisible();
  await expect(dlg.getByText('$24.00 CAD').first()).toBeVisible();
  await expect(bagButton(page)).toHaveAccessibleName('Bag (1) item');

  // Tab stays inside the modal.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dlg.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(bagButton(page)).toBeFocused();

  // Reopen from the header and close with the button.
  await bagButton(page).click();
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: /close bag/i }).click();
  await expect(dlg).toBeHidden();
  await expect(bagButton(page)).toBeFocused();
});

test('J3.3 / J3.4 drawer quantity update and remove, then the empty state', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  await addToBag(page);
  const dlg = drawer(page);
  await expect(dlg).toBeVisible();

  await dlg.getByRole('button', { name: /increase quantity of lemon balm/i }).click();
  await expect(bagButton(page)).toHaveAccessibleName('Bag (2) items');
  await expect(dlg.getByText('$48.00 CAD').first()).toBeVisible();
  await expect(dlg.getByRole('button', { name: /increase quantity/i })).toBeFocused();
  await expect(dlg.getByText('Taxes and shipping are confirmed at checkout.')).toBeVisible();

  await dlg.getByRole('button', { name: /decrease quantity/i }).click();
  await expect(bagButton(page)).toHaveAccessibleName('Bag (1) item');

  await dlg.getByRole('button', { name: /remove lemon balm/i }).click();
  await expect(dlg.getByText('Your bag is empty')).toBeVisible();
  await expect(dlg.getByRole('button', { name: /^checkout$/i })).toHaveCount(0);
  await expect(bagButton(page)).toHaveAccessibleName(/empty/i);
  // Focus lands on the bag heading, never on <body>.
  await expect(dlg.getByRole('heading', { name: /your bag/i })).toBeFocused();
});

test('J3.7 increase is disabled at the quantity limit', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  await page.getByLabel('Quantity', { exact: true }).fill('10');
  await addToBag(page);
  const dlg = drawer(page);
  await expect(dlg.getByText(/reached the limit of 10/i)).toBeVisible();
  await expect(dlg.getByRole('button', { name: /increase quantity/i })).toHaveAttribute('aria-disabled', 'true');
});

test('J3.6 /cart: update, remove and the empty state', async ({ page }) => {
  await page.goto('/cart');
  const main = page.locator('main');
  await expect(main.getByText('Your bag is empty')).toBeVisible();
  await expect(page.getByRole('button', { name: /^checkout$/i })).toHaveCount(0);

  await page.goto('/products/peppermint-ginger-extract');
  await addToBag(page);
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/cart');
  await expect(page.getByRole('heading', { level: 1, name: /your bag/i })).toBeVisible();
  await page.getByRole('button', { name: /increase quantity of peppermint/i }).click();
  await expect(main.getByText('$44.00 CAD').first()).toBeVisible();
  await expect(main.getByRole('link', { name: 'Peppermint & Ginger Extract' })).toHaveAttribute('href', '/products/peppermint-ginger-extract');
  await page.getByRole('button', { name: /remove peppermint/i }).click();
  await expect(main.getByText('Your bag is empty')).toBeVisible();
  await expect(main.getByRole('link', { name: /continue shopping/i })).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('J3.6 / J6.6 add from the product page, then update and remove on /cart', async ({ page }) => {
    await page.goto('/products/lemon-balm-oat-extract?size=60+mL');
    await expect(page.getByRole('heading', { level: 1, name: 'Lemon Balm & Oat Extract' })).toBeVisible();
    await page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i }).click();
    await expect(page.getByText(/added to your bag/i)).toBeVisible();

    await page.goto('/cart');
    const main = page.locator('main');
    await expect(main.getByText('$38.00 CAD').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^bag \(1\) item/i })).toHaveAttribute('href', '/cart');

    const checkout = page.locator('main form[action="/api/checkout"]');
    await expect(checkout).toHaveAttribute('method', 'post');

    await page.getByRole('button', { name: /increase quantity of lemon balm/i }).click();
    await expect(main.getByText('$76.00 CAD').first()).toBeVisible();

    await page.getByRole('button', { name: /remove lemon balm/i }).click();
    await expect(main.getByText('Your bag is empty')).toBeVisible();
  });
});

test('J4.1 fixture mode: checkout stays on the site with the demo message and keeps the bag', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  await addToBag(page);
  await page.keyboard.press('Escape');
  await page.goto('/cart');

  const requests: string[] = [];
  page.on('request', (r) => requests.push(new URL(r.url()).hostname));
  await page.getByRole('button', { name: /^checkout$/i }).click();

  await expect(page).toHaveURL(/\/cart\?checkout_error=FIXTURE_MODE$/);
  const alert = page.locator('main [role=alert]');
  await expect(alert).toContainText('Checkout is switched off in preview');
  await expect(page.locator('main').getByRole('link', { name: 'Lemon Balm & Oat Extract' })).toBeVisible();
  expect(requests.some((h) => h.endsWith('stripe.com'))).toBe(false);
});

test('J4.3 / J4.4 return banners map known codes to copy and never echo the query', async ({ page }) => {
  await page.goto('/cart?checkout=cancelled');
  await expect(page.locator('main [role=status]').filter({ hasText: 'Checkout was cancelled' })).toBeVisible();

  await page.goto('/cart?checkout_error=CART_INVALID');
  await expect(page.locator('main [role=alert]')).toContainText(/no longer available in the quantity requested/i);

  await page.goto('/cart?checkout_error=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  await expect(page.locator('main [role=alert]')).toContainText('We could not start checkout');
  await expect(page.locator('body')).not.toContainText('script');
});

test('J5.4 an unknown session id shows the not-found state and never the id', async ({ page }) => {
  await page.goto('/checkout/success?session_id=cs_test_unknown');
  await expect(page.getByRole('heading', { level: 1, name: /could not find that order/i })).toBeFocused();
  await expect(page.locator('body')).not.toContainText('cs_test_unknown');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);

  await page.goto('/checkout/success');
  await expect(page.getByRole('heading', { level: 1, name: /could not find that order/i })).toBeVisible();
});

test('J1.4 an unknown product renders the styled 404 with a way back', async ({ page }) => {
  const response = await page.goto('/products/no-such-product');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: /could not find that product/i })).toBeVisible();
  await page.getByRole('link', { name: /browse the collection/i }).click();
  await expect(page).toHaveURL(/\/#collection$/);
});

test('metadata: product pages are noindex while sample, cart pages are noindex', async ({ page }) => {
  for (const path of ['/products/lemon-balm-oat-extract', '/cart']) {
    await page.goto(path);
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  }
  await page.goto('/products/lemon-balm-oat-extract');
  await expect(page).toHaveTitle(/Lemon Balm & Oat Extract/);
});

test('mobile document flow: no horizontal scroll on the product page and /cart', async ({ page }) => {
  for (const path of ['/products/lemon-balm-oat-extract', '/cart']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test('accessibility: no serious violations on the product page, the open drawer and /cart', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  expect(await seriousViolations(page)).toEqual([]);

  await addToBag(page);
  await expect(drawer(page)).toBeVisible();
  // The drawer is a modal: audit the whole document, which axe treats as the dialog in the top layer.
  await page.waitForTimeout(350);
  expect(await seriousViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');

  await page.goto('/cart');
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto('/products/chamomile-linden-extract?size=60+mL');
  expect(await seriousViolations(page)).toEqual([]);
});

test('J2.8 on small screens the sticky add-to-bag bar appears only after scrolling past the main button', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', 'The sticky bar is a small-screen pattern (hidden from lg up).');
  await page.goto('/products/lemon-balm-oat-extract');
  const sticky = page.getByTestId('sticky-add-to-bag');
  // Before the shopper reaches the size picker and main button, no sticky bar covers them.
  await expect(sticky).toHaveCount(0);
  // Open the detail sections so the page is long enough to scroll fully past the main button.
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => d.setAttribute('open', '')));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(sticky).toBeVisible();
  await expect(sticky.getByRole('button', { name: /add to bag/i })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(sticky).toHaveCount(0);
});

test('WCAG 2.5.3 the bag button name contains its visible text', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  await expect(bagButton(page)).toBeVisible();
  await expect(bagButton(page)).toHaveText('Bag (empty)');
  await expect(bagButton(page)).toHaveAccessibleName('Bag (empty)');
  await addToBag(page);
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press('Escape');
  // Visible text first, hidden words after: the name starts with exactly what sighted users read.
  await expect(bagButton(page)).toHaveAccessibleName(/^Bag \(1\)/);
  expect(await bagButton(page).evaluate((el) => (el.firstChild as Text).textContent)).toBe('Bag (1)');
});

test('J6.4 a bag action that cannot reach the server shows an inline message, re-enables controls and never replays', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  await expect(bagButton(page)).toBeVisible(); // hydrated: the trigger is a button only after hydration

  let blocked = true;
  let aborted = 0;
  await page.route('**/products/lemon-balm-oat-extract*', (route) => {
    const request = route.request();
    if (blocked && request.method() === 'POST' && request.headers()['next-action']) {
      aborted += 1;
      return route.abort('failed');
    }
    return route.continue();
  });

  const form = page.locator('#add-to-bag-form');
  await form.getByRole('button', { name: /^add to bag/i }).click();

  const recovery = page.getByTestId('action-recovery');
  await expect(recovery.getByRole('alert')).toContainText('We could not reach the store');
  await expect(recovery.getByRole('alert')).toContainText('could not confirm that this item was added');
  expect(aborted).toBe(1);
  // Nothing was added, nothing replayed, the route error page did not take over.
  await expect(page.getByRole('heading', { level: 1, name: 'Lemon Balm & Oat Extract' })).toBeVisible();
  await expect(bagButton(page)).toHaveAccessibleName('Bag (empty)');
  await expect(form.getByRole('button', { name: /^add to bag/i })).toBeEnabled();
  await expect(form.getByRole('button', { name: /^add to bag/i })).not.toHaveAttribute('aria-disabled', 'true');
  await expect(recovery.getByRole('button', { name: 'Try again' })).toBeFocused();

  // "Check your bag" opens the drawer, which shows what the server really holds.
  await recovery.getByRole('button', { name: 'Check your bag' }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByText('Your bag is empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();

  // Network back: Try again clears the message and a fresh add works.
  blocked = false;
  await recovery.getByRole('button', { name: 'Try again' }).click();
  await expect(recovery).toHaveCount(0);
  await form.getByRole('button', { name: /^add to bag/i }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(bagButton(page)).toHaveAccessibleName('Bag (1) item');
  expect(aborted).toBe(1);
});

test('J6.4 a failed bag update shows Try again in the drawer and the quantity stays as the server has it', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  await expect(bagButton(page)).toBeVisible();
  await addToBag(page);
  const dlg = drawer(page);
  await expect(dlg).toBeVisible();

  let blocked = true;
  await page.route('**/products/lemon-balm-oat-extract*', (route) => {
    const request = route.request();
    return blocked && request.method() === 'POST' && request.headers()['next-action'] ? route.abort('failed') : route.continue();
  });

  await dlg.getByRole('button', { name: /increase quantity of lemon balm/i }).click();
  const recovery = dlg.getByTestId('action-recovery');
  await expect(recovery.getByRole('alert')).toContainText('We could not reach the store');
  // The add-uncertain wording is for adds only.
  await expect(recovery.getByText(/could not confirm/i)).toHaveCount(0);
  await expect(bagButton(page)).toHaveAccessibleName('Bag (1) item');
  await expect(dlg.getByRole('button', { name: /increase quantity/i })).not.toHaveAttribute('aria-disabled', 'true');

  blocked = false;
  await recovery.getByRole('button', { name: 'Try again' }).click();
  await expect(recovery).toHaveCount(0);
  await dlg.getByRole('button', { name: /increase quantity of lemon balm/i }).click();
  await expect(bagButton(page)).toHaveAccessibleName('Bag (2) items');
});

test('J6.4 without JavaScript the add form still posts as a plain form', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/products/lemon-balm-oat-extract');
  // The Server Action form renders a hidden action id and posts to the page itself.
  await expect(page.locator('#add-to-bag-form input[name^="$ACTION_"]').first()).toBeAttached();
  await context.close();
});

test('motion: with reduced motion the bag drawer has no transition and is open immediately after Add', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/products/lemon-balm-oat-extract');
  await expect(bagButton(page)).toBeVisible();
  await addToBag(page);
  const dlg = drawer(page);
  await expect(dlg).toBeVisible();
  expect(await dlg.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  // No slide-in: the panel is already in place when it first reports visible.
  expect(await dlg.evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth + 1)).toBe(true);
  expect(await dlg.evaluate((el) => getComputedStyle(el, '::backdrop').transitionDuration)).toBe('0s');
});

test('product gallery: reserved ratios, alt text, only the first image eager, and a position label per slide', async ({ page }, testInfo) => {
  await page.goto('/products/lemon-balm-oat-extract');
  const gallery = page.getByRole('region', { name: /product images/i });
  const imgs = gallery.locator('ul').first().locator('img');
  const n = await imgs.count();
  expect(n).toBeGreaterThanOrEqual(1);

  for (let i = 0; i < n; i++) {
    const img = imgs.nth(i);
    expect(((await img.getAttribute('alt')) ?? '').length).toBeGreaterThan(3);
    // Fixed box (aspect-ratio on the wrapper), so nothing shifts when the image decodes.
    const box = await img.evaluate((el) => {
      const r = el.parentElement!.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(box.w).toBeGreaterThan(200);
    expect(box.h).toBeGreaterThan(200);
    if (i === 0) expect(await img.getAttribute('loading')).not.toBe('lazy');
    else expect(await img.getAttribute('loading')).toBe('lazy');
  }

  if (n === 1) {
    await expect(gallery.getByText(/^1 \/ 1$/)).toHaveCount(0);
    await expect(gallery.getByRole('list', { name: /choose an image/i })).toHaveCount(0);
    return;
  }

  const strip = gallery.locator('ul').first();
  if (testInfo.project.name === 'desktop-1440') {
    // Stacked in the column: each image sits below the previous one, no horizontal scroller.
    const tops = await imgs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(tops[1]).toBeGreaterThan(tops[0]);
    expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(gallery.getByRole('list', { name: /choose an image/i })).toBeHidden();
    return;
  }

  {
    // Below lg: a scroll-snap strip with a static "i / n" label on each slide and thumbnail anchors.
    expect(await strip.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x');
    expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(gallery.getByText(`1 / ${n}`)).toBeVisible();
    await gallery.getByRole('link', { name: `Show image 2 of ${n}` }).click();
    await expect(gallery.getByText(`2 / ${n}`)).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test('J1.4 an address outside the shop renders the styled global 404', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: /could not find that page/i })).toBeVisible();
  await page.locator('main').getByRole('link', { name: 'Shop all' }).click();
  await expect(page).toHaveURL(/\/#collection$/);
});

test.describe('mobile menu', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'The Menu disclosure is a small-screen control.');
  });

  const menu = (page: Page) => page.locator('details', { has: page.locator('summary', { hasText: 'Menu' }) });

  test('lists the same columns as the mega menu, and closes after following a link or same-page link', async ({ page }) => {
    await page.goto('/products/lemon-balm-oat-extract');
    await expect(bagButton(page)).toBeVisible(); // hydrated
    await menu(page).locator('summary').click();
    await expect(menu(page)).toHaveJSProperty('open', true);
    for (const heading of ['Formats', 'Rituals', 'Explore']) await expect(menu(page).getByText(heading, { exact: true })).toBeVisible();
    await menu(page).getByRole('link', { name: 'Shop all' }).click();
    await expect(page).toHaveURL(/\/#collection$/);
    await expect(menu(page)).toHaveJSProperty('open', false);

    // A link that only changes the query on the same page.
    await menu(page).locator('summary').click();
    await menu(page).getByRole('link', { name: 'Body oils' }).click();
    await expect(page).toHaveURL(/\?category=body-oils/);
    await expect(menu(page)).toHaveJSProperty('open', false);

    // Back and Forward do not restore an open menu.
    await menu(page).locator('summary').click();
    await page.goBack();
    await expect(menu(page)).toHaveJSProperty('open', false);
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('a full navigation starts with the menu closed', async ({ page }) => {
      await page.goto('/products/lemon-balm-oat-extract');
      await menu(page).locator('summary').click();
      await expect(menu(page)).toHaveJSProperty('open', true);
      await menu(page).getByRole('link', { name: 'Body oils' }).click();
      await expect(page).toHaveURL(/\?category=body-oils/);
      await expect(menu(page)).toHaveJSProperty('open', false);
    });
  });
});

const HANDLES = [
  'lemon-balm-oat-extract',
  'peppermint-ginger-extract',
  'chamomile-linden-extract',
  'hawthorn-rose-hip-extract',
  'dandelion-root-extract',
  'nettle-leaf-extract',
  'calendula-almond-body-oil',
  'lavender-jojoba-body-oil',
  'evening-ritual-kit',
];

test('regulatory: every product page shows the licence notice next to the buy box, and no health claims', async ({ page }) => {
  for (const handle of HANDLES) {
    await page.goto(`/products/${handle}`);
    const notice = page.getByTestId('npn-notice');
    await expect(notice).toHaveText('Sample product. Not a licensed natural health product. No health claims are made.');
    await expect(notice).toBeVisible();
    // The notice sits above the add button, in the same column.
    const n = (await notice.boundingBox())!;
    const add = (await page.locator('#add-to-bag-form').boundingBox())!;
    expect(n.y).toBeLessThan(add.y);
    // The details heading is "What it is" (not "Benefits"), without claim-adjacent disclaimers.
    await expect(page.locator('summary', { hasText: 'What it is' })).toBeVisible();
    await expect(page.locator('summary', { hasText: 'Benefits' })).toHaveCount(0);
    await expect(page.getByText('Not an approved claim')).toHaveCount(0);
  }
});

test('J2.x size labels and single-option products', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  const sizes = page.getByRole('group', { name: /choose a size/i });
  await expect(sizes.getByRole('link')).toHaveText([/^30 mL/, /^60 mL/]);

  // A kit has one option: shown as a plain line, no one-tile picker.
  await page.goto('/products/evening-ritual-kit');
  await expect(page.getByRole('group', { name: /choose a size/i })).toHaveCount(0);
  await expect(page.locator('main').getByText('Size: Set of 3')).toBeVisible();
  await expect(page.getByText('$74.00 CAD').first()).toBeVisible();
  await expect(page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i })).toBeEnabled();

  await page.goto('/products/calendula-almond-body-oil');
  await expect(page.getByRole('group', { name: /choose a size/i })).toHaveCount(0);
  await expect(page.locator('main').getByText('Size: 100 mL')).toBeVisible();
});

test('J2.4 the sold-out 60 mL of Chamomile & Linden does not block its purchasable 30 mL', async ({ page }) => {
  await page.goto('/products/chamomile-linden-extract');
  await expect(page.getByText('$24.00 CAD').first()).toBeVisible();
  await expect(page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i })).toBeEnabled();
});
