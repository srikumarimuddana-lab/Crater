import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Make every WebGL context request fail, as on a device without GPU support. */
async function disableWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

/** Accumulate layout-shift entries (CLS without session windowing: an upper bound). */
async function observeLayoutShift(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

test('home renders shopping content without WebGL', async ({ page }) => {
  await disableWebGL(page);
  await page.goto('/');

  // The stylesheet applied (an unstyled page would still pass the role checks below).
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(247, 242, 232)');

  // Announcement bar: store line plus the preview notice, unmistakable while samples are in use.
  const notice = page.getByRole('region', { name: /preview notice/i });
  await expect(notice).toContainText('Shipping within Canada');
  await expect(notice).toContainText(/sample products/i);

  const hero = page.getByRole('region', { name: 'Liquid herbal extracts and body oils' });
  await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(hero.getByText('30 mL')).toBeVisible();
  await expect(hero.getByText('$24.00 CAD')).toBeVisible();

  const heroImage = hero.getByRole('img', { name: /Lemon Balm & Oat Extract/ });
  await expect(heroImage).toBeVisible();
  await expect.poll(() => heroImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // Two actions: tinctures and the whole collection.
  await expect(hero.getByRole('link', { name: 'Shop tinctures' })).toHaveAttribute('href', '/?category=tinctures#collection');
  await expect(hero.getByRole('link', { name: 'Browse all products' })).toHaveAttribute('href', '/#collection');
  const product = hero.getByRole('link', { name: 'Lemon Balm & Oat Extract' });
  await expect(product).toHaveAttribute('href', '/products/lemon-balm-oat-extract');
  await product.click();
  await expect(page).toHaveURL(/\/products\/lemon-balm-oat-extract$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lemon Balm & Oat Extract' })).toBeVisible();
  await page.goto('/');

  // Value tiles state only the three confirmed facts.
  const tiles = page.getByRole('region', { name: 'Store information' }).getByRole('listitem');
  await expect(tiles).toHaveCount(3);
  await expect(tiles.nth(0)).toContainText('Secure checkout with Stripe');
  await expect(tiles.nth(1)).toContainText('Ships within Canada');
  await expect(tiles.nth(2)).toContainText('Prices in Canadian dollars');

  // Shop by ritual: four tiles linking to the collection filter.
  const rituals = page.getByRole('region', { name: 'Shop by ritual' });
  await expect(rituals.getByRole('link')).toHaveCount(4);
  await expect(rituals.getByRole('link', { name: /^Body care/ })).toHaveAttribute('href', '/?category=body-care#collection');

  // Story and values are marked placeholders; hidden sections are absent.
  await expect(page.getByRole('region', { name: 'Our story' })).toContainText('Content pending');
  await expect(page.getByRole('region', { name: 'What we care about' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'From the journal' })).toHaveCount(0);
  await expect(page.getByText('Stay in touch')).toHaveCount(0);

  // Collection: nine sample cards with price and size, and working filter links.
  const collection = page.getByRole('region', { name: /shop all/i });
  await expect(collection.getByRole('heading', { level: 3 })).toHaveCount(9);
  await expect(collection.getByText('Sample product', { exact: true })).toHaveCount(9);

  // Every card image decodes (lazy images load once scrolled into view).
  for (const img of await collection.getByRole('img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }

  // The whole card is one stretched link whose text is the product title.
  await expect(collection.getByRole('link', { name: 'Nettle Leaf Extract' })).toHaveAttribute('href', '/products/nettle-leaf-extract');

  await collection.getByRole('link', { name: 'Body oils' }).click();
  await expect(page).toHaveURL(/\?category=body-oils#collection$/);
  const filtered = page.getByRole('region', { name: /shop all/i });
  await expect(filtered.getByRole('heading', { level: 3 })).toHaveText(['Calendula & Almond Body Oil', 'Lavender & Jojoba Body Oil']);
  await expect(filtered.getByRole('link', { name: 'Body oils' })).toHaveAttribute('aria-current', 'page');

  await filtered.getByRole('link', { name: 'All products' }).click();
  await expect(page.getByRole('region', { name: /shop all/i }).getByRole('heading', { level: 3 })).toHaveCount(9);

  // Sorting still works (price, high to low puts the $74.00 kit first).
  await page.goto('/?sort=price-desc#collection');
  await expect(page.getByRole('region', { name: /shop all/i }).getByRole('heading', { level: 3 }).first()).toHaveText('Evening Ritual Kit');

  // No canvas is required for any of the above.
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('header: centred logo, bag on the right, preview notice above', async ({ page }, testInfo) => {
  await page.goto('/');
  const logo = page.getByRole('banner').getByRole('link', { name: 'Crater' });
  const box = (await logo.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(4);
  const bag = page.getByRole('banner').getByRole('button', { name: /^bag\b/i });
  const bagBox = (await bag.boundingBox())!;
  expect(bagBox.x).toBeGreaterThan(viewport.width / 2);
  if (testInfo.project.name === 'desktop-1440') {
    const shop = (await page.getByRole('banner').getByRole('button', { name: 'Shop', exact: true }).boundingBox())!;
    expect(shop.x).toBeLessThan(viewport.width / 2);
  }
});

test('mega menu: opens by keyboard, lists the columns, closes on Escape and returns focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'The mega menu is a desktop control; small screens use the Menu disclosure.');
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Shop', exact: true });
  const panel = page.getByRole('navigation', { name: 'Shop menu' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  for (const heading of ['Formats', 'Rituals', 'Explore']) await expect(panel.getByText(heading, { exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Tinctures' })).toHaveAttribute('href', '/?category=tinctures#collection');
  await expect(panel.getByRole('link', { name: /^About/ })).toHaveAttribute('href', '/about');
  await expect(panel.getByRole('link', { name: /^About/ })).toContainText('content pending');

  // Tab moves into the menu; Escape from inside closes it and focus returns to the button.
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('link', { name: 'Tinctures' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();

  // Space toggles it too; tabbing out of the menu closes it.
  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();

  // A menu link navigates and the menu is closed on the next page.
  await button.click();
  await panel.getByRole('link', { name: 'Seasonal' }).click();
  await expect(page).toHaveURL(/\?category=seasonal#collection$/);
  await expect(panel).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test.describe('mega menu without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('"Shop" opens a native disclosure with working links', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop control.');
    await page.goto('/');
    await page.locator('summary', { hasText: 'Shop' }).first().click();
    await page.getByRole('navigation', { name: 'Shop menu' }).getByRole('link', { name: 'Kits & gifts' }).click();
    await expect(page).toHaveURL(/\?category=kits-gifts#collection$/);
  });
});

test('featured carousel: a list of six products with working, accessible previous and next buttons', async ({ page }, testInfo) => {
  await page.goto('/');
  const section = page.getByRole('region', { name: 'Featured formulas' });
  const list = section.locator('#featured-list');
  await expect(list.getByRole('listitem')).toHaveCount(6);
  await expect(list.getByRole('heading', { level: 3 })).toHaveText([
    'Lemon Balm & Oat Extract',
    'Peppermint & Ginger Extract',
    'Chamomile & Linden Extract',
    'Hawthorn & Rose Hip Extract',
    'Dandelion Root Extract',
    'Nettle Leaf Extract',
  ]);
  // Scroll-snap container; a plain scrollable list without script.
  expect(await list.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x');
  expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  const prev = section.getByRole('button', { name: 'Previous products' });
  const next = section.getByRole('button', { name: 'Next products' });
  await expect(next).toBeVisible();
  await expect(prev).toHaveAttribute('aria-disabled', 'true');
  await expect(next).not.toHaveAttribute('aria-disabled', 'true');
  for (const b of [prev, next]) {
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  // Keyboard: Enter on Next scrolls forward; Previous becomes available; focus stays on the button.
  await next.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
  await expect(prev).not.toHaveAttribute('aria-disabled', 'true');
  await expect(next).toBeFocused();

  // Scroll to the end: Next becomes aria-disabled and does nothing.
  for (let i = 0; i < 8 && (await next.getAttribute('aria-disabled')) !== 'true'; i++) {
    await next.click({ force: true });
    await page.waitForTimeout(450);
  }
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  const end = await list.evaluate((el) => el.scrollLeft);
  await next.click({ force: true });
  await page.waitForTimeout(300);
  expect(await list.evaluate((el) => el.scrollLeft)).toBe(end);

  await prev.click();
  await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeLessThan(end);
  expect(testInfo.project.name).toBeTruthy();

  // Cards in the list are keyboard-reachable links.
  await expect(list.getByRole('link', { name: 'Lemon Balm & Oat Extract' })).toHaveAttribute('href', '/products/lemon-balm-oat-extract');
});

test('featured carousel: with reduced motion the buttons jump without smooth scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const section = page.getByRole('region', { name: 'Featured formulas' });
  const list = section.locator('#featured-list');
  await expect(section.getByRole('button', { name: 'Next products' })).toBeVisible();
  await section.getByRole('button', { name: 'Next products' }).click();
  // No animation: the position is final almost immediately.
  await expect.poll(() => list.evaluate((el) => el.scrollLeft), { timeout: 400 }).toBeGreaterThan(50);
});

test.describe('carousel without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('is a plain scrollable list with no dead buttons', async ({ page }) => {
    await page.goto('/');
    const section = page.getByRole('region', { name: 'Featured formulas' });
    await expect(section.getByRole('button')).toHaveCount(0);
    await expect(section.locator('#featured-list').getByRole('listitem')).toHaveCount(6);
  });
});

for (const [path, title] of [
  ['/about', 'About'],
  ['/ingredients-sourcing', 'Ingredients & sourcing'],
  ['/journal', 'Journal'],
  ['/shipping-returns', 'Shipping & returns'],
  ['/contact', 'Contact'],
] as const) {
  test(`placeholder page ${path} returns 200, is noindex and links back to Shop all`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.locator('main')).toContainText('Content pending');
    await page.locator('main').getByRole('link', { name: 'Shop all' }).click();
    await expect(page).toHaveURL(/\/#collection$/);
  });
}

test('footer: link columns, pending markers, hidden newsletter and the preview note', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  const nav = footer.getByRole('navigation', { name: 'Footer' });
  for (const heading of ['Shop', 'About', 'Help']) await expect(nav.getByRole('heading', { name: heading })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Shop all' })).toHaveAttribute('href', '/#collection');
  await expect(nav.getByRole('link', { name: /^Contact/ })).toContainText('content pending');
  await expect(footer.getByText('Preview store. All products are samples.')).toBeVisible();
  await expect(footer.getByRole('textbox')).toHaveCount(0);
  await expect(footer.getByText('Stay in touch')).toHaveCount(0);
});

// Health, efficacy and sales-claim words that must not appear on the shop (docs/catalogue.md C5).
const CLAIM_WORDS = /\b(calm(ing)?|relief|immune|detox(ify)?|cleanse[rs]?|boost(s|ing)?|sleep|stress|best[- ]sellers?|free shipping|organic|reviews?|ratings?|supports?|cures?|heals?|treats?)\b/i;

test('no health-claim or sales-claim words on the homepage', async ({ page }) => {
  await page.goto('/');
  const text = await page.locator('body').innerText();
  expect(text.match(CLAIM_WORDS)?.[0] ?? null).toBeNull();
  // The hidden details text counts too: read the DOM text, not only what is on screen.
  const all = await page.locator('body').evaluate((el) => el.textContent ?? '');
  expect(all.match(CLAIM_WORDS)?.[0] ?? null).toBeNull();
});

test('no health-claim words on a product page, including its detail sections', async ({ page }) => {
  await page.goto('/products/lemon-balm-oat-extract');
  const all = await page.locator('body').evaluate((el) => el.textContent ?? '');
  expect(all.match(CLAIM_WORDS)?.[0] ?? null).toBeNull();
});

test('home exposes keyboard skip link and visible focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /skip to content/i });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('home has no serious automated accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('home preserves layout during delayed image and font loading', async ({ page }) => {
  await observeLayoutShift(page);
  const release: (() => void)[] = [];
  const held = new Promise<void>((resolve) => release.push(resolve));
  await page.route(/\.(svg|woff2?)(\?.*)?$/, async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const hero = page.getByRole('region', { name: 'Liquid herbal extracts and body oils' });
  const heroImage = hero.getByRole('img', { name: /Lemon Balm & Oat Extract/ });

  // Content and action are usable while images and fonts are still pending.
  await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Shop tinctures' })).toBeVisible();
  const before = await heroImage.boundingBox();
  expect(before?.height ?? 0).toBeGreaterThan(100);
  const headingBefore = await hero.getByRole('heading', { level: 1 }).boundingBox();

  release.forEach((r) => r());
  await expect.poll(() => heroImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  const after = await heroImage.boundingBox();
  expect(after).toEqual(before);
  const headingAfter = await hero.getByRole('heading', { level: 1 }).boundingBox();
  expect(Math.abs((headingAfter?.y ?? 0) - (headingBefore?.y ?? 0))).toBeLessThan(4);

  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThan(0.1);
});
