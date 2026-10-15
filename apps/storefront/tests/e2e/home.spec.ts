import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function disableWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

test.beforeEach(async ({ context, baseURL }) => {
  // Most tests exercise shopping with analytics rejected. The consent test starts fresh.
  await context.addCookies([{ name: 'crater_analytics', value: 'denied', url: baseURL! }]);
});

test('reference hero, photography and real collection work without WebGL', async ({ page }) => {
  await disableWebGL(page);
  await page.goto('/');
  await expect(page.getByRole('region', { name: /preview notice/i })).toContainText(/sample products/i);
  const hero = page.locator('#home');
  await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(hero.locator('.glowing')).not.toHaveText('');
  await expect(hero.locator('.skin')).not.toHaveText('');
  for (const image of [hero.locator('.hero-model'), hero.locator('.hero-texture')]) {
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await expect(hero.locator('[data-track="home.hero.shop"]')).toHaveAttribute('href', '/#collection');
  await hero.locator('[data-track="home.hero.shop"]').click();
  await expect(page).toHaveURL(/\/#collection$/);
  const collection = page.locator('#collection');
  await expect(collection.getByRole('heading', { level: 3 })).toHaveCount(9);
  await expect(collection.getByText('Sample product', { exact: true })).toHaveCount(9);
  for (const image of await collection.getByRole('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await collection.getByRole('link', { name: 'Lemon Balm & Oat Extract', exact: true }).click();
  await expect(page).toHaveURL(/\/products\/lemon-balm-oat-extract$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lemon Balm & Oat Extract' })).toBeVisible();
  await expect(page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('collection filters, sorting and search return real products', async ({ page }) => {
  await page.goto('/#collection');
  const collection = page.locator('#collection');
  await collection.getByRole('link', { name: 'Body oils', exact: true }).click();
  await expect(page).toHaveURL(/\?category=body-oils#collection$/);
  await expect(collection.getByRole('heading', { level: 3 })).toHaveText(['Calendula & Almond Body Oil', 'Lavender & Jojoba Body Oil']);
  await expect(collection.getByRole('link', { name: 'Body oils', exact: true })).toHaveAttribute('aria-current', 'page');
  await collection.getByRole('link', { name: 'All products', exact: true }).click();
  await expect(collection.getByRole('heading', { level: 3 })).toHaveCount(9);
  await collection.locator('select[name="sort"]').selectOption('price-desc');
  await collection.locator('form').filter({ has: page.locator('select[name="sort"]') }).getByRole('button').click();
  await expect(collection.getByRole('heading', { level: 3 }).first()).toHaveText('Evening Ritual Kit');
  await collection.getByRole('searchbox').fill('nettle');
  await collection.getByRole('button', { name: /search/i }).click();
  await expect(collection.getByRole('heading', { level: 3 })).toHaveText(['Nettle Leaf Extract']);
  await collection.getByRole('link', { name: 'Nettle Leaf Extract', exact: true }).click();
  await expect(page).toHaveURL(/\/products\/nettle-leaf-extract$/);
});

test('header keeps brand and bag usable at each viewport', async ({ page }) => {
  await page.goto('/');
  const header = page.getByRole('banner'), logo = header.locator('.r-brand');
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('href', '/');
  const bag = header.getByRole('button', { name: /^bag\b/i });
  await expect(bag).toBeVisible();
  const logoBox = (await logo.boundingBox())!, bagBox = (await bag.boundingBox())!, viewport = page.viewportSize()!;
  expect(bagBox.x).toBeGreaterThan(logoBox.x + logoBox.width);
  expect(bagBox.x + bagBox.width).toBeLessThanOrEqual(viewport.width);
  if (viewport.width >= 701) {
    expect(Math.abs(logoBox.x + logoBox.width / 2 - viewport.width / 2)).toBeLessThan(4);
    await expect(header.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Shop', exact: true })).toHaveAttribute('href', '/#collection');
  }
  await bag.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Your bag is empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(bag).toBeFocused();
});

test('routine tabs support arrows, Home and End with matching content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const tabs = page.getByRole('tablist', { name: 'Skincare routine' }).getByRole('tab'), panel = page.getByRole('tabpanel');
  await expect(tabs).toHaveCount(3);
  await tabs.nth(0).focus();
  const initial = await panel.innerText();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(0)).toHaveAttribute('tabindex', '-1');
  await expect(panel).toHaveAttribute('aria-labelledby', 'step1');
  await expect(panel).not.toHaveText(initial);
  await page.keyboard.press('End');
  await expect(tabs.nth(2)).toBeFocused();
  await expect(panel).toHaveAttribute('aria-labelledby', 'step2');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(2)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  await expect(panel).toHaveText(initial);
});

test('mobile navigation works with keyboard disclosure controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', 'Native mobile disclosure is shown below 701px.');
  await page.goto('/');
  const menu = page.locator('.r-mobile-menu'), trigger = menu.locator('summary');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveJSProperty('open', true);
  await expect(menu.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveJSProperty('open', false);
  await page.keyboard.press('Space');
  await menu.getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible();
});

test('editorial and policy pages render content and footer navigation', async ({ page }) => {
  for (const path of ['/about', '/ingredients-sourcing', '/journal', '/shipping-returns', '/contact', '/privacy', '/terms']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main .r-content-body').first()).not.toHaveText('');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  }
  const footer = page.getByRole('contentinfo');
  for (const [label, path] of [['Our story', '/about'], ['Contact', '/contact'], ['Shipping & returns', '/shipping-returns'], ['Privacy', '/privacy'], ['Terms', '/terms']]) {
    await expect(footer.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: label, exact: true })).toHaveAttribute('href', path);
  }
  await footer.getByRole('link', { name: /discover the collection/i }).click();
  await expect(page).toHaveURL(/\/#collection$/);
});

test('journal cards navigate to the corresponding article', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const card = page.locator('#journal .journal-card').nth(1), title = (await card.locator('h3').innerText()).replace('↗', '').trim();
  await card.click();
  await expect(page).toHaveURL(/\/journal\/a-routine-that-feels-like-you$/);
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(page.locator('main .r-content-body')).not.toHaveText('');
});

test('analytics is opt-in and rejecting again does not block shopping', async ({ page, context }) => {
  await context.clearCookies();
  const events: string[] = [];
  await page.route('**/api/analytics', async route => {
    if (route.request().method() === 'POST') events.push(route.request().postDataJSON().name);
    await route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Allow analytics', exact: true })).toBeVisible();
  expect(events).toEqual([]);
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(() => events.includes('page_view')).toBe(true);
  await page.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Reject analytics', exact: true }).click();
  const count = events.length;
  await page.goto('/products/lemon-balm-oat-extract');
  await expect(page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analytics preferences', exact: true })).toBeVisible();
  expect(events).toHaveLength(count);
  expect((await context.cookies()).find(c => c.name === 'crater_analytics')?.value).toBe('denied');
  expect((await context.cookies()).some(c => c.name === 'crater_analytics_session')).toBe(false);
});

test('reduced motion disables hero drift, marquee and reveal hiding', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.hero-scene')).toHaveCSS('position', 'relative');
  await expect(page.locator('.marquee div')).toHaveCSS('animation-name', 'none');
  await page.locator('#ritual').scrollIntoViewIfNeeded();
  await expect(page.locator('#heroTitle .glowing')).toHaveCSS('transform', 'none');
  await expect(page.locator('.story-copy h2')).toHaveCSS('opacity', '1');
  await expect(page.locator('#ritual h2')).toHaveCSS('opacity', '1');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.remedy-home')).toHaveClass(/motion-ready/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.remedy-home')).not.toHaveClass(/motion-ready/);
  await expect(page.locator('.marquee div')).toHaveCSS('animation-name', 'none');
});

test('home has no horizontal page overflow from hero through footer', async ({ page }) => {
  await page.goto('/');
  for (const selector of ['#home', '#ritual', '#collection', '#journal', '.r-footer']) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test('home exposes the keyboard skip link and visible focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /skip to content/i });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  expect(await skip.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('home has no serious automated accessibility violations', async ({ page }) => {
  // Reveal content must be exposed so animation cannot conceal failures from the audit.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', '))).toEqual([]);
});

test('failed decorative photography leaves product content and shopping links usable', async ({ page }) => {
  await page.route('**/remedy/*', route => /\.(png|jpe?g|webp|avif)$/.test(new URL(route.request().url()).pathname) ? route.abort() : route.continue());
  await page.goto('/');
  await expect(page.locator('#heroTitle')).toBeVisible();
  await page.locator('[data-track="home.hero.shop"]').click();
  await page.locator('#collection').getByRole('link', { name: 'Nettle Leaf Extract', exact: true }).click();
  await expect(page).toHaveURL(/\/products\/nettle-leaf-extract$/);
  await expect(page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i })).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('hero, editorial text and collection navigation stay available', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#heroTitle')).toBeVisible();
    await expect(page.locator('.story-copy h2')).toHaveCSS('opacity', '1');
    await expect(page.locator('#ritual h2')).toHaveCSS('opacity', '1');
    await page.locator('#collection').getByRole('link', { name: 'Body oils', exact: true }).press('Enter');
    await expect(page).toHaveURL(/\?category=body-oils#collection$/);
    await page.waitForLoadState('load');
    await expect(page.locator('#collection').getByRole('heading', { level: 3 })).toHaveCount(2);
    await page.locator('#collection').getByRole('link', { name: 'Calendula & Almond Body Oil', exact: true }).press('Enter');
    await expect(page).toHaveURL(/\/products\/calendula-almond-body-oil$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Calendula & Almond Body Oil' })).toBeVisible();
    await expect(page.locator('#add-to-bag-form')).toHaveAttribute('method', 'POST');
    await expect(page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i })).toBeEnabled();
    await page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i }).press('Enter');
    await expect(page.getByText(/added to your bag/i)).toBeVisible();
    await page.goto('/cart');
    await expect(page.locator('main').getByRole('link', { name: 'Calendula & Almond Body Oil', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^bag \(1\) item/i })).toHaveAttribute('href', '/cart');
  });
  test('native mobile navigation opens and follows links', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'Mobile disclosure.');
    await page.goto('/');
    const menu = page.locator('.r-mobile-menu');
    await menu.locator('summary').click();
    await expect(menu).toHaveJSProperty('open', true);
    await menu.getByRole('link', { name: 'Contact', exact: true }).click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(menu).toHaveJSProperty('open', false);
  });
});
