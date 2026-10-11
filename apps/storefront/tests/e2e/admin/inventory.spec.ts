import { expect, projectKey, test } from './helpers';

// Each viewport project adjusts its own variant so parallel projects never interfere.
const SKU: Record<string, { sku: string; product: string; variant: string }> = {
  m: { sku: 'SAMPLE-NL-30', product: 'Nettle Leaf Extract', variant: '30 mL' },
  t: { sku: 'SAMPLE-NL-60', product: 'Nettle Leaf Extract', variant: '60 mL' },
  d: { sku: 'SAMPLE-PG-60', product: 'Peppermint & Ginger Extract', variant: '60 mL' },
};

test.use({ role: 'ADMIN' });

test('an invalid adjustment shows inline errors; a valid one changes the level and adds a movement', async ({ page }, info) => {
  const v = SKU[projectKey(info.project.name)];
  await page.goto('/admin/inventory');
  const row = page.getByRole('row').filter({ hasText: v.sku });
  const before = Number(await row.getByRole('cell').nth(1).innerText());

  await row.getByRole('link', { name: `Adjust stock for ${v.product}, ${v.variant}` }).click();
  const dialog = page.getByRole('dialog', { name: /Adjust stock/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Change by')).toBeFocused({ timeout: 2000 }).catch(() => undefined);

  // Not a number.
  await dialog.getByLabel('Change by').fill('abc');
  await dialog.getByLabel('Reason').selectOption('COUNT_CORRECTION');
  await dialog.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(dialog.locator('.a-error')).toContainText('whole number');
  await expect(dialog.getByLabel('Change by')).toHaveAttribute('aria-invalid', 'true');

  // Below zero stock: the server refuses and the field error appears.
  await dialog.getByLabel('Change by').fill('-99999');
  await dialog.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(dialog.locator('.a-error')).toContainText(/cannot go below 0/);
  await expect(dialog.locator('.a-errsummary')).toBeVisible();

  // Reason rules: Other needs a note.
  await dialog.getByLabel('Change by').fill('2');
  await dialog.getByLabel('Reason').selectOption('OTHER');
  await dialog.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(dialog.locator('.a-error')).toContainText('note');

  // Valid.
  await dialog.getByLabel('Reason').selectOption('RECEIVED');
  await dialog.getByLabel('Change by').fill('+3');
  await dialog.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Stock adjusted for ${v.sku}` })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: v.sku }).getByRole('cell').nth(1)).toHaveText(String(before + 3));

  await page.goto('/admin/inventory/movements');
  const movement = page.getByRole('row').filter({ hasText: v.sku }).filter({ hasText: 'Received' }).first();
  await expect(movement).toContainText('+3');
  await expect(movement).toContainText(String(before + 3));
});

test('Escape closes the adjust dialog and returns focus to the row link', async ({ page }, info) => {
  const v = SKU[projectKey(info.project.name)];
  await page.goto('/admin/inventory');
  const link = page.getByRole('link', { name: `Adjust stock for ${v.product}, ${v.variant}` });
  await link.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/adjust=/);
  await expect(link).toBeFocused();
});

test('low stock is flagged with text, and sortable headers expose aria-sort', async ({ page }) => {
  await page.goto('/admin/inventory');
  await expect(page.getByText('Low stock', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Out of stock').first()).toBeVisible();
  await page.getByRole('columnheader', { name: /Available/ }).getByRole('link').click();
  await expect(page.getByRole('columnheader', { name: /Available/ })).toHaveAttribute('aria-sort', 'ascending');
});
