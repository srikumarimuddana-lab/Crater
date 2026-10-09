import { expect, projectKey, test } from './helpers';

// Inventory adjustments per project use distinct variants only for saving; these tests only open the dialog.
const SKU: Record<string, { product: string; variant: string }> = {
  m: { product: 'Nettle Leaf Extract', variant: '30 mL' },
  t: { product: 'Nettle Leaf Extract', variant: '60 mL' },
  d: { product: 'Peppermint & Ginger Extract', variant: '60 mL' },
};

test.describe('settings page', () => {
  test.use({ role: 'OWNER' });

  test('shows the time zone, registrations, the SK row and the not-tax-advice notice', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.getByText('America/Regina').first()).toBeVisible();
    await expect(page.getByText('CAD').first()).toBeVisible();
    await expect(page.getByText('GST (federal), Saskatchewan PST')).toBeVisible();
    const table = page.getByRole('table', { name: /Tax charged for each ship-to province/ });
    await expect(table.getByRole('row')).toHaveCount(14); // header + 13 provinces
    const sk = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Saskatchewan' }) });
    await expect(sk).toContainText('GST 5%');
    await expect(sk).toContainText('PST (Saskatchewan) 6%');
    await expect(table.getByRole('row').filter({ hasText: 'Ontario' })).toContainText('HST');
    await expect(page.getByText('Not tax advice.')).toBeVisible();
    await expect(page.getByText(/^Source:/)).toBeVisible();
    // Sidebar entry under System, current page marked.
    const nav = page.getByRole('navigation', { name: 'Main' });
    if (await nav.isVisible()) await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  test('the overview shows the store time zone', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByText('Store time zone: America/Regina')).toBeVisible();
  });
});

test.describe('settings access', () => {
  test.use({ role: 'FULFILMENT' });
  test('a role without the overview capability gets the 403 view', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { level: 1, name: /not allowed|access|permission|403|forbidden/i })).toBeVisible();
  });
});

async function openAdjust(page: import('@playwright/test').Page, info: import('@playwright/test').TestInfo) {
  const v = SKU[projectKey(info.project.name)];
  await page.goto('/admin/inventory');
  await page.getByRole('link', { name: `Adjust stock for ${v.product}, ${v.variant}` }).click();
  const dialog = page.getByRole('dialog', { name: /Adjust stock/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('stock reasons: Fulfilment', () => {
  test.use({ role: 'FULFILMENT' });

  test('can use Expired but not Lost or stolen, and sees the sign rules', async ({ page }, info) => {
    const dialog = await openAdjust(page, info);
    for (const name of ['Received', 'Count correction', 'Damaged', 'Expired']) {
      await expect(dialog.getByRole('option', { name: new RegExp(`^${name}`) })).toHaveCount(1);
    }
    await expect(dialog.getByRole('option', { name: /^Expired \(removes stock\)$/ })).toHaveCount(1);
    for (const name of ['Lost or stolen', 'Samples and gifts', 'Return restock', 'Other']) {
      await expect(dialog.getByRole('option', { name: new RegExp(`^${name}`) })).toHaveCount(0);
    }
    await expect(dialog.getByText(/Expired.*enter a negative change/)).toBeVisible();

    // The sign rule is enforced inline: expired stock cannot be added.
    await dialog.getByLabel('Change by').fill('2');
    await dialog.getByLabel('Reason').selectOption('EXPIRED');
    await dialog.getByRole('button', { name: 'Save adjustment' }).click();
    await expect(dialog.locator('.a-error')).toContainText('Expired stock must be a negative change');
  });
});

test.describe('stock reasons: Owner', () => {
  test.use({ role: 'OWNER' });

  test('can also use Lost or stolen, Samples and gifts and Return restock', async ({ page }, info) => {
    const dialog = await openAdjust(page, info);
    for (const name of ['Received', 'Count correction', 'Damaged', 'Expired', 'Return restock', 'Samples and gifts', 'Lost or stolen', 'Other']) {
      await expect(dialog.getByRole('option', { name: new RegExp(`^${name}`) })).toHaveCount(1);
    }
    await dialog.getByLabel('Change by').fill('5');
    await dialog.getByLabel('Reason').selectOption('LOST_STOLEN');
    await dialog.getByRole('button', { name: 'Save adjustment' }).click();
    await expect(dialog.locator('.a-error')).toContainText('Lost or stolen stock must be a negative change');
  });
});

test.describe('product editor cost', () => {
  test.use({ role: 'ADMIN' });

  test('the checklist lists the cost check and the cost field says it is needed to publish', async ({ page }) => {
    await page.goto('/admin/products');
    await page.getByRole('link', { name: 'Dandelion Root Extract' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Dandelion Root Extract' })).toBeVisible();
    const checklist = page.getByRole('region', { name: 'Publish checklist' });
    await expect(checklist.getByText('Cost price entered for every variant')).toBeVisible();
    await expect(page.getByLabel('Cost, CAD').first()).toBeVisible();
    await expect(page.getByText(/Required to publish/).first()).toBeVisible();
  });
});
