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

  // Sample status is unmistakable while fixtures are in use.
  await expect(page.getByRole('region', { name: /preview notice/i })).toContainText(/sample products/i);

  const hero = page.getByRole('region', { name: 'Mineral Serum' });
  await expect(hero.getByRole('heading', { level: 1, name: 'Mineral Serum' })).toBeVisible();
  await expect(hero.getByText('30 mL')).toBeVisible();
  await expect(hero.getByText('$68.00 CAD')).toBeVisible();

  const heroImage = hero.getByRole('img', { name: /Mineral Serum/ });
  await expect(heroImage).toBeVisible();
  await expect.poll(() => heroImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // Primary shopping action leads to the product in the collection.
  const shop = hero.getByRole('link', { name: /shop the serum/i });
  await expect(shop).toBeVisible();
  await expect(shop).toHaveAttribute('href', '/products/mineral-serum');
  await shop.click();
  await expect(page).toHaveURL(/\/products\/mineral-serum$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mineral Serum' })).toBeVisible();
  await page.goto('/');

  // Collection: six sample cards with price and size, and working filter links.
  const collection = page.getByRole('region', { name: /shop all/i });
  await expect(collection.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) })).toHaveCount(6);
  await expect(collection.getByText('Sample product', { exact: true })).toHaveCount(6);

  // Every card image decodes (lazy images load once scrolled into view).
  for (const img of await collection.getByRole('img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }

  // The whole card is one stretched link whose text is the product title.
  await expect(collection.getByRole('link', { name: 'Gel Cleanser' })).toHaveAttribute('href', '/products/gel-cleanser');

  await collection.getByRole('link', { name: 'Cleansers' }).click();
  await expect(page).toHaveURL(/\?category=cleansers#collection$/);
  const filtered = page.getByRole('region', { name: /shop all/i });
  await expect(filtered.getByRole('heading', { level: 3 })).toHaveText(['Gel Cleanser']);
  await expect(filtered.getByRole('link', { name: 'Cleansers' })).toHaveAttribute('aria-current', 'page');

  await filtered.getByRole('link', { name: 'All products' }).click();
  await expect(page.getByRole('region', { name: /shop all/i }).getByRole('heading', { level: 3 })).toHaveCount(6);

  // No canvas is required for any of the above.
  await expect(page.locator('canvas')).toHaveCount(0);
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
  const hero = page.getByRole('region', { name: 'Mineral Serum' });
  const heroImage = hero.getByRole('img', { name: /Mineral Serum/ });

  // Content and action are usable while images and fonts are still pending.
  await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(hero.getByRole('link', { name: /shop the serum/i })).toBeVisible();
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
