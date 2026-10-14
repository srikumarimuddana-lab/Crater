import { expect, serious, test } from './helpers';

test.use({ role: 'OWNER' });

for (const [name, url] of [
  ['overview', '/admin'],
  ['orders', '/admin/orders'],
  ['inventory', '/admin/inventory'],
  ['movements', '/admin/inventory/movements'],
  ['products', '/admin/products'],
  ['event log', '/admin/events'],
  ['staff', '/admin/staff'],
  ['content', '/admin/content'],
  ['media', '/admin/media'],
  ['payments', '/admin/payments'],
  ['finance', '/admin/finance'],
  ['customers', '/admin/customers'],
  ['inbox', '/admin/inbox'],
  ['templates', '/admin/templates'],
  ['campaigns', '/admin/campaigns'],
  ['integrations', '/admin/integrations'],
  ['analytics', '/admin/analytics'],
  ['suppliers', '/admin/suppliers'],
  ['purchasing', '/admin/purchasing'],
  ['shipments', '/admin/shipments'],
  ['returns', '/admin/returns'],
  ['collections', '/admin/collections'],
  ['shipping and discounts', '/admin/settings/shipping'],
] as const) {
  test(`${name} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
}

test('product editor has no serious accessibility violations', async ({ page }) => {
  await page.goto('/admin/products');
  await page.getByRole('link', { name: 'Dandelion Root Extract' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dandelion Root Extract' })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test('adjust dialog and login have no serious accessibility violations', async ({ page, browser, baseURL }) => {
  await page.goto('/admin/inventory');
  await page.getByRole('link', { name: /^Adjust stock for/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await serious(page)).toEqual([]);

  const anon = await (await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })).newPage();
  await anon.goto('/admin/login');
  expect(await serious(anon)).toEqual([]);
  await anon.context().close();
});

for (const url of ['/admin', '/admin/orders', '/admin/inventory', '/admin/products', '/admin/staff']) {
  test(`${url} never scrolls the page sideways`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
