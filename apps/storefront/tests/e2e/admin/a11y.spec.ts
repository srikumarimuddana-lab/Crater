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

  const anon = await (await browser.newContext({ baseURL })).newPage();
  await anon.goto('/admin/login');
  expect(await serious(anon)).toEqual([]);
  await anon.context().close();
});
