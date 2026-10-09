import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Ship-to province and sales tax in the bag (docs/tax.md). Each test's fresh context is its own shopper. */

const bagButton = (page: Page) => page.getByRole('button', { name: /^bag\b/i });
const drawer = (page: Page) => page.getByRole('dialog', { name: /your bag/i });

async function addLemonBalm(page: Page) {
  await page.goto('/products/lemon-balm-oat-extract');
  await page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i }).click();
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press('Escape');
}

const provinceSelect = (page: Page) => page.locator('main').getByLabel('Ship to province');

async function chooseProvince(page: Page, root: ReturnType<Page['locator']>, code: string) {
  await expect(root.locator('form[data-province-form][data-enhanced]')).toBeVisible();
  await root.getByLabel('Ship to province').selectOption(code);
}

test('SK: GST and PST lines and the total appear under the subtotal on /cart', async ({ page }) => {
  await addLemonBalm(page);
  await page.goto('/cart');
  const main = page.locator('main');

  // No province yet: taxes are pending and there is no Total row.
  await expect(main.getByText('Choose a province to see taxes.')).toBeVisible();
  await expect(main.getByTestId('bag-total')).toHaveCount(0);
  await expect(provinceSelect(page)).toHaveValue('');
  await expect(main.getByText('Taxes are calculated for the province you are shipping to.')).toBeVisible();

  await chooseProvince(page, main, 'SK');
  await expect(main.locator('[data-tax-line]').filter({ hasText: 'GST 5%' })).toContainText('$1.20');
  await expect(main.locator('[data-tax-line]').filter({ hasText: 'PST (Saskatchewan) 6%' })).toContainText('$1.44');
  await expect(main.getByTestId('bag-total')).toContainText('$26.64');
  await expect(main.getByText('Shipping is confirmed at checkout.')).toBeVisible();
  await expect(main.getByText('Taxes and shipping are confirmed at checkout.')).toHaveCount(0);
  await expect(provinceSelect(page)).toHaveValue('SK');
  await expect(main.getByText(/we will contact you before shipping/i)).toBeVisible();

  // The choice survives a reload (stored on the cart, not in the page).
  await page.reload();
  await expect(provinceSelect(page)).toHaveValue('SK');
  await expect(main.getByTestId('bag-total')).toContainText('$26.64');

  // Ontario: one HST line at 13%.
  await chooseProvince(page, main, 'ON');
  await expect(main.locator('[data-tax-line]')).toHaveCount(1);
  await expect(main.locator('[data-tax-line]')).toContainText(/HST.*13%/);
  await expect(main.locator('[data-tax-line]')).toContainText('$3.12');
  await expect(main.getByTestId('bag-total')).toContainText('$27.12');
});

test('the drawer has the same province control and tax lines', async ({ page }) => {
  await addLemonBalm(page);
  await bagButton(page).click();
  const dlg = drawer(page);
  await expect(dlg).toBeVisible();
  await expect(dlg.getByText('Choose a province to see taxes.')).toBeVisible();
  await chooseProvince(page, dlg, 'SK');
  await expect(dlg.getByTestId('bag-total')).toContainText('$26.64');
  await expect(dlg.locator('[data-tax-line]')).toHaveCount(2);
  // The dialog stays open and the control keeps focus.
  await expect(dlg).toBeVisible();
  await expect(dlg.getByLabel('Ship to province')).toBeFocused();
  await expect(dlg.getByLabel('Ship to province')).toHaveValue('SK');
});

test('/cart with the province error shows the message and focuses the select', async ({ page }) => {
  // The checkout route sends the shopper here when no province is set (covered by the backend integration
  // tests; the default e2e server runs in fixture mode, which refuses checkout before it looks at the province).
  await addLemonBalm(page);
  await page.goto('/cart?checkout_error=PROVINCE_REQUIRED');
  const alert = page.locator('main [role=alert]');
  await expect(alert).toContainText('Choose the province you are shipping to');
  await expect(provinceSelect(page)).toBeFocused();
  await expect(provinceSelect(page)).toHaveAttribute('aria-describedby', /bag-error/);
  await expect(provinceSelect(page)).toHaveAttribute('aria-invalid', 'true');

  // Once a province is chosen the error is resolved and removed.
  await chooseProvince(page, page.locator('main'), 'SK');
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await expect(page.locator('main').getByTestId('bag-total')).toContainText('$26.64');
});

test('fixture-mode checkout still refuses with the demo message after a province is chosen', async ({ page }) => {
  await addLemonBalm(page);
  await page.goto('/cart');
  await chooseProvince(page, page.locator('main'), 'SK');
  await expect(page.locator('main').getByTestId('bag-total')).toBeVisible();
  await page.getByRole('button', { name: /^checkout$/i }).click();
  await expect(page).toHaveURL(/\/cart\?checkout_error=FIXTURE_MODE$/);
  await expect(page.locator('main [role=alert]')).toContainText('Checkout is switched off in preview');
});

test('an unknown province code is refused with a message and leaves the bag unchanged', async ({ page }) => {
  await addLemonBalm(page);
  await page.goto('/cart');
  await expect(page.locator('form[data-province-form][data-enhanced]').first()).toBeAttached();
  // Force a value the list does not offer, then submit through the real action.
  await page.evaluate(() => {
    const sel = document.querySelector<HTMLSelectElement>('main select[name=province]');
    if (!sel) return;
    const o = document.createElement('option');
    o.value = 'ZZ';
    o.textContent = 'Nowhere';
    sel.append(o);
    sel.value = 'ZZ';
  });
  await page.locator('main').getByRole('button', { name: 'Update' }).click();
  await expect(page.locator('main').getByText('Choose one of the provinces in the list')).toBeVisible();
  await expect(page.locator('main').getByTestId('bag-total')).toHaveCount(0);
});

test('the province control and tax block have no serious accessibility violations', async ({ page }) => {
  await addLemonBalm(page);
  await page.goto('/cart');
  await chooseProvince(page, page.locator('main'), 'SK');
  await expect(page.locator('main').getByTestId('bag-total')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the Update button saves the province and shows the taxes', async ({ page }) => {
    await page.goto('/products/lemon-balm-oat-extract');
    await page.locator('#add-to-bag-form').getByRole('button', { name: /^add to bag/i }).click();
    await expect(page.getByText(/added to your bag/i)).toBeVisible();

    await page.goto('/cart');
    const main = page.locator('main');
    await expect(main.getByText('Choose a province to see taxes.')).toBeVisible();
    await provinceSelect(page).selectOption('SK');
    await main.getByRole('button', { name: 'Update' }).click();
    await expect(main.getByTestId('bag-total')).toContainText('$26.64');
    await expect(main.locator('[data-tax-line]').filter({ hasText: 'GST 5%' })).toContainText('$1.20');
    await expect(provinceSelect(page)).toHaveValue('SK');

    // Submitting the empty placeholder is refused and keeps the earlier choice.
    await provinceSelect(page).selectOption('');
    await main.getByRole('button', { name: 'Update' }).click();
    await expect(main.getByTestId('bag-total')).toContainText('$26.64');
  });
});
