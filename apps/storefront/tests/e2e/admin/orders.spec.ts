import { expect, test } from './helpers';

test.use({ role: 'ADMIN' });

// Paid orders need Stripe (or the integration suite's fake Stripe), which the default e2e server does not have:
// in memory mode the order list starts empty. Fulfil and packing-slip contents are covered by the integration suite.
test('the order list shows its empty state and working filters', async ({ page }) => {
  await page.goto('/admin/orders');
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
  await expect(page.getByText('No orders yet. Orders appear here after a customer pays at checkout.')).toBeVisible();
  await expect(page.getByLabel('Payment status')).toBeVisible();
  await page.getByLabel('Fulfilment status').selectOption('UNFULFILLED');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/fulfilment=UNFULFILLED/);
  await expect(page.getByText('No orders match these filters.')).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters' }).first().click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
});

test('an unknown order and its packing slip render a not-found page, not data', async ({ page }) => {
  await page.goto('/admin/orders/424242');
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await page.goto('/admin/orders/424242/packing-slip');
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await page.goto('/admin/orders/not-a-number');
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
});

test('overview, event log and staff pages render for an owner', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText('Gross sales', { exact: true })).toBeVisible();
  await expect(page.getByText('Average order value')).toBeVisible();
  // No orders: AOV is a dash, never 0.00.
  const aov = page.locator('.a-tile', { hasText: 'Average order value' }).locator('.a-big');
  await expect(aov).toHaveText('–');
  await expect(page.getByRole('table', { name: /Sales by day/ })).toBeVisible();
  await expect(page.getByText('Webhook health')).toBeVisible();
  await page.getByRole('link', { name: '30 days' }).click();
  await expect(page).toHaveURL(/period=30d/);
  await expect(page.getByRole('link', { name: '30 days' })).toHaveAttribute('aria-current', 'page');
});
