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
