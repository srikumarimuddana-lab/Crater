import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sessionStaff } from './admin/staff';
import { signInUi } from './admin/helpers';
// Run serially: configuration is merchant-wide. Never use real business contacts here.
test.describe.configure({ mode: 'serial' });
test('admin publishes guided chat, receives a handoff and supports native booking management', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const key = info.project.name.replace(/[^a-z0-9]/g, ''),
    serviceId = `service-${key}`,
    resourceId = `resource-${key}`;
  await signInUi(page, sessionStaff('OWNER', info.project.name));
  await page.goto('/admin/chat');
  await page.getByLabel('Chat title', { exact: true }).fill('Fixture help');
  await page
    .getByLabel('Visible page paths', { exact: false })
    .fill('/ /chat /book');
  await page.getByLabel('Enable chat when this draft is published').check();
  await page
    .getByLabel('Question 1 label', { exact: true })
    .fill('Fixture question');
  await page
    .locator('textarea[name="answer0"]')
    .fill('Fixture answer from published content');
  await page
    .getByRole('button', { name: 'Save chat draft', exact: true })
    .click();
  await expect(
    page.getByText('Draft saved. Preview it below, then publish when ready.'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Publish chat settings', exact: true })
    .click();
  await expect(
    page.getByText('Chat settings published.', { exact: true }),
  ).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Fixture help', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: `test-results/chat-${info.project.name}.png` });
  await dialog
    .getByRole('button', { name: 'Fixture question', exact: true })
    .click();
  await expect(
    dialog.getByText('Fixture answer from published content', { exact: true }),
  ).toBeVisible();
  await dialog.getByText('Request an email reply', { exact: true }).click();
  await dialog.getByLabel('Your name', { exact: true }).fill('Fixture visitor');
  await dialog
    .getByLabel('Email', { exact: true })
    .fill(`chat.${key}@example.test`);
  await dialog
    .getByLabel('Message', { exact: true })
    .fill(`Fixture handoff ${key}`);
  await dialog
    .getByRole('button', { name: 'Request email follow-up', exact: true })
    .click();
  await expect(dialog.getByRole('status')).toContainText(
    'Your message was saved',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Fixture help', exact: true }),
  ).toBeFocused();
  await page.goto('/admin/inbox');
  await expect(page.getByText('Website chat follow-up').first()).toBeVisible();
  await page.goto('/admin/appointments/settings');
  const resource = page
    .locator('details')
    .filter({ has: page.getByText('Add a resource', { exact: true }) });
  await resource
    .getByLabel('Unique resource ID', { exact: true })
    .fill(resourceId);
  await resource
    .getByLabel('Resource name', { exact: true })
    .fill(`Fixture resource ${key}`);
  for (const d of [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ])
    await resource
      .getByRole('group', { name: d, exact: true })
      .getByLabel('Available', { exact: true })
      .check();
  await resource
    .getByRole('button', { name: 'Save resource', exact: true })
    .click();
  await expect(resource.getByRole('status')).toBeVisible();
  const service = page
    .locator('details')
    .filter({ has: page.getByText('Add a service', { exact: true }) });
  await service
    .getByLabel('Unique service ID', { exact: true })
    .fill(serviceId);
  await service
    .getByLabel('Service name', { exact: true })
    .fill(`Fixture service ${key}`);
  await service
    .getByLabel('Service description', { exact: true })
    .fill('Fixture service for automated UI testing only.');
  await service.getByLabel(`Fixture resource ${key}`, { exact: true }).check();
  await service
    .getByRole('button', { name: 'Save service', exact: true })
    .click();
  await expect(service.getByRole('status')).toBeVisible();
  await page.getByLabel('Business timezone', { exact: false }).fill('Etc/UTC');
  await page.getByLabel('Minimum notice (minutes)', { exact: true }).fill('0');
  await page
    .getByLabel('Cancellation / reschedule cutoff', { exact: false })
    .fill('0');
  await page.getByLabel('Enable public booking', { exact: true }).check();
  await page
    .getByRole('button', { name: 'Save booking settings', exact: true })
    .click();
  await expect(
    page.getByText('Appointment changes saved.').first(),
  ).toBeVisible();
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: info.project.use.viewport,
  });
  const customer = await context.newPage();
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await customer.goto(
    `/book?serviceId=${serviceId}&resourceId=${resourceId}&date=${date}`,
  );
  await expect(
    customer.getByRole('heading', { name: 'Appointments', exact: true }),
  ).toBeVisible();
  await customer.locator('.interaction-slots a').first().click();
  await customer
    .locator('#reserve')
    .getByLabel('Your name', { exact: true })
    .fill('Fixture booking');
  await customer
    .getByLabel('Email for appointment updates', { exact: true })
    .fill(`booking.${key}@example.test`);
  await customer
    .getByRole('button', { name: 'Confirm appointment', exact: true })
    .click();
  await expect(customer).toHaveURL(/\/book\/manage$/);
  await expect(
    customer.getByText('confirmed', { exact: false }).first(),
  ).toBeVisible();
  await customer.getByText('Reschedule appointment', { exact: true }).click();
  await customer
    .getByRole('button', { name: 'Confirm new time', exact: true })
    .click();
  await expect(
    customer.getByRole('heading', { name: 'Manage your booking', exact: true }),
  ).toBeVisible();
  await customer.getByText('Cancel appointment', { exact: true }).click();
  await customer
    .getByRole('button', { name: 'Confirm cancellation', exact: true })
    .click();
  await expect(customer.getByText(/APT-.*cancelled/)).toBeVisible();
  await context.close();
  await page.goto('/book');
  await page.screenshot({
    path: `test-results/booking-${info.project.name}.png`,
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([]);
});
