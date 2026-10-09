import { PROJECT_KEYS, PASSWORD, uiOwner } from './staff';
import { expect, openNav, signInUi, test } from './helpers';

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  // No storefront chrome and no canvas inside the console.
  await expect(page.getByRole('link', { name: /bag/i })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.goto('/admin/orders');
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('a wrong password shows one generic message that does not reveal accounts', async ({ page }, info) => {
  const key = PROJECT_KEYS[info.project.name];
  for (const email of [uiOwner(info.project.name).email, `nobody.${key}@example.test`]) {
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(`${PASSWORD}-wrong`);
    await page.getByRole('button', { name: 'Continue' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('The email or password is not right, or this account cannot sign in');
    await expect(alert).not.toContainText(/no account|not found|does not exist/i);
    await expect(page).toHaveURL(/\/admin\/login/);
  }
});

test('the login form validates empty fields inline', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter your email address.').first()).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
});

test('an owner signs in with a TOTP code, lands on the overview, and signs out', async ({ page }, info) => {
  await signInUi(page, uiOwner(info.project.name));
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  // Environment badges: test mode, sample data in fixture mode.
  await expect(page.getByText('Test mode', { exact: true })).toBeVisible();
  await expect(page.getByText('Sample data', { exact: true })).toBeVisible();

  const nav = await openNav(page);
  for (const name of ['Overview', 'Orders', 'Products', 'Inventory', 'Event log', 'Staff']) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  }
  // Close the mobile menu so it does not cover the top bar.
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();

  await page.getByText(uiOwner(info.project.name).name).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('admin pages are noindex and private', async ({ page, request }) => {
  const res = await request.get('/admin/login');
  expect(res.headers()['cache-control']).toMatch(/no-store/);
  await page.goto('/admin/login');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
