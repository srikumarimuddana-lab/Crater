import { expect, openNav, test } from './helpers';

test.describe('fulfilment role', () => {
  test.use({ role: 'FULFILMENT' });

  test('sees Orders and Inventory only, and lands on Orders', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/orders/);
    const nav = await openNav(page);
    await expect(nav.getByRole('link', { name: 'Orders', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Inventory', exact: true })).toBeVisible();
    for (const name of ['Overview', 'Products', 'Event log', 'Staff']) {
      await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0);
    }
    // Price-free orders view: no payment or total columns, no payment filter.
    await expect(page.getByRole('columnheader', { name: /Total|Payment/ })).toHaveCount(0);
    await expect(page.getByLabel('Payment status')).toHaveCount(0);
  });

  test('a direct URL to a page the role lacks renders a 403 page', async ({ page }) => {
    for (const url of ['/admin/products', '/admin/staff', '/admin/events']) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1, name: /403/ })).toBeVisible();
      await expect(page.getByText('Your role does not have access to this page')).toBeVisible();
    }
    // The shell still only offers what the role may use.
    const nav = await openNav(page);
    await expect(nav.getByRole('link', { name: 'Products', exact: true })).toHaveCount(0);
  });

  test('the adjust dialog offers only the reasons this role may use', async ({ page }) => {
    await page.goto('/admin/inventory');
    await page.getByRole('link', { name: /^Adjust stock for/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('option', { name: 'Received' })).toHaveCount(1);
    await expect(dialog.getByRole('option', { name: 'Damaged' })).toHaveCount(1);
    await expect(dialog.getByRole('option', { name: 'Return restock' })).toHaveCount(0);
    await expect(dialog.getByRole('option', { name: 'Other' })).toHaveCount(0);
  });
});

test.describe('bookkeeper role', () => {
  test.use({ role: 'BOOKKEEPER' });

  test('can read products but not edit them, and has the audit tab only', async ({ page }) => {
    await page.goto('/admin/products');
    await page.getByRole('link', { name: 'Dandelion Root Extract' }).click();
    await expect(page.getByText('You can view this product but not change it.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update status' })).toHaveCount(0);
    await page.goto('/admin/events');
    await expect(page.getByRole('link', { name: 'Audit' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Webhooks' })).toHaveCount(0);
  });
});
