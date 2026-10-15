import type { Page } from '@playwright/test';
import { expect, projectKey, test } from './helpers';

// Each viewport project edits its own product, so parallel projects never conflict.
const PRODUCT: Record<string, string> = { m: 'Calendula & Almond Body Oil', t: 'Lavender & Jojoba Body Oil', d: 'Dandelion Root Extract' };

test.use({ role: 'ADMIN' });

async function openEditor(page: Page, title: string) {
  await page.goto('/admin/products');
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

const price = (page: Page) => page.getByLabel('Price, CAD').first();

test('a price change is saved, shows the open-bags count, and a stale edit gets the conflict notice', async ({ page, context }, info) => {
  const title = PRODUCT[projectKey(info.project.name)];
  await openEditor(page, title);
  await expect(page.getByText(/open bags? hold this variant/).first()).toBeVisible();
  const original = await price(page).inputValue();
  const bumped = original === '41.00' ? '42.00' : '41.00';

  // Plain save.
  await price(page).fill(bumped);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.reload();
  await expect(price(page)).toHaveValue(bumped);

  // Invalid price: inline error, draft kept.
  await price(page).fill('twelve');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Price must be an amount like 24.00.').first()).toBeVisible();
  await expect(price(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(price(page)).toHaveValue('twelve');

  // Stale edit: a second tab saves first.
  await page.reload();
  const other = await context.newPage();
  await openEditor(other, title);
  await price(other).fill(original);
  await other.getByRole('button', { name: 'Save changes' }).click();
  await expect(other.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await other.close();

  await price(page).fill('43.00');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const alert = page.locator('.a-errsummary');
  await expect(alert).toContainText('Someone else changed this');
  await expect(alert).toContainText('Reload the latest version');
  await expect(price(page)).toHaveValue('43.00'); // the draft is kept

  // Reload shows the other tab's value.
  await page.reload();
  await expect(price(page)).toHaveValue(original);
});

test('the publish checklist blocks a sample product and says why', async ({ page }, info) => {
  await openEditor(page, PRODUCT[projectKey(info.project.name)]);
  const list = page.getByRole('region', { name: 'Publish checklist' });
  await expect(list).toBeVisible();
  await expect(list.getByText('Not a sample product')).toBeVisible();
  await expect(list.getByText('not met').first()).toBeAttached();
  await expect(list.getByText(/marked sample product, so it cannot be published/)).toBeVisible();
  await expect(page.getByLabel('Status').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update status' })).toBeVisible();
});

test('the product index shows status, variant count and stock', async ({ page }) => {
  await page.goto('/admin/products');
  await expect(page.getByRole('columnheader', { name: /Variants/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Stock/ })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Dandelion Root Extract' });
  await expect(row).toContainText('Active');
  await expect(row).toContainText('Sample');
});

test('a new draft and variant can be purchased and received through the admin', async ({ page }, info) => {
  test.setTimeout(60_000);
  const suffix = `${projectKey(info.project.name)}-${Date.now()}`;
  const title = `Receiving test ${suffix}`;
  const sku = `RECEIVE-${suffix}`;
  await page.goto('/admin/products/new');
  const create = page.getByRole('region', { name: 'Product and first variant' });
  await create.getByLabel('Product title').fill(title);
  await create.getByLabel('URL handle').fill(`receiving-${suffix}`);
  await create.getByLabel('Description').fill('Operational browser test product.');
  await create.getByLabel('Product type').fill('Test oil');
  await create.getByLabel('Unique SKU').fill(sku);
  await create.getByLabel('Variant size / name').fill('30 ml');
  await create.getByLabel('Price in CAD cents').fill('1000');
  await create.getByLabel('Unit cost in CAD cents').fill('250');
  await create.getByRole('button', { name: 'Create draft' }).click();
  await expect(create.getByRole('status')).toContainText('Saved');
  await openEditor(page, title);
  await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
  const variant = await page.locator('input[name="variants.0.id"]').inputValue();
  const add = page.getByRole('region', { name: 'Add variant', exact: true });
  await add.getByLabel('Unique SKU').fill(`${sku}-60`);
  await add.getByLabel('Size / variant name').fill('60 ml');
  await add.getByLabel('Price, CAD cents', { exact: true }).fill('1800');
  await add.getByLabel('Unit cost, CAD cents').fill('400');
  await add.getByRole('button', { name: 'Add variant with zero stock' }).click();
  await expect(add.getByRole('status')).toContainText('Saved');
  await page.reload();
  await add.getByLabel('Unique SKU').fill(`${sku}-DUPLICATE`);
  await add.getByLabel('Size / variant name').fill('60 ml');
  await add.getByLabel('Price, CAD cents', { exact: true }).fill('1800');
  await add.getByLabel('Unit cost, CAD cents').fill('400');
  await add.getByRole('button', { name: 'Add variant with zero stock' }).click();
  await expect(add.getByRole('alert')).toContainText('Size already exists');

  const supplier = `Supplier ${suffix}`;
  await page.goto('/admin/suppliers');
  const supplierForm = page.getByRole('region', { name: 'Add supplier' });
  await supplierForm.getByRole('textbox', { name: 'Name (required)', exact: true }).fill(supplier);
  await supplierForm.getByRole('button', { name: 'Add supplier' }).click();
  await expect(supplierForm.getByRole('status')).toContainText('Saved');
  await page.goto('/admin/purchasing');
  const purchase = page.getByRole('region', { name: 'Create purchase order' });
  await purchase.getByLabel('Supplier').selectOption({ label: supplier });
  await purchase.getByLabel('Reference').fill(`PO-${suffix}`);
  await purchase.getByLabel('Variant ID, quantity', { exact: true }).fill(`${variant}, 3`);
  await purchase.getByLabel('Unit cost in CAD cents').fill('250');
  await purchase.getByRole('button', { name: 'Create purchase order' }).click();
  await expect(purchase.getByRole('status')).toContainText('Saved');
  const receive = page.getByRole('region', { name: 'Receive stock' });
  await receive.getByLabel('Accounting mode').selectOption('test');
  await receive.getByLabel('Purchase order').selectOption({ label: `PO-${suffix}` });
  await receive.getByLabel('Variant ID, quantity received').fill(`${variant}, 3`);
  await receive.getByRole('button', { name: 'Confirm physical receipt' }).click();
  await expect(receive.getByRole('status')).toContainText('Saved');
  await page.goto(`/admin/inventory?q=${encodeURIComponent(sku)}`);
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: sku, exact: true }) });
  await expect(row.getByRole('cell').nth(1)).toHaveText('3');
  await expect(page.getByRole('columnheader', { name: 'Checkout holds' })).toBeVisible();
});
