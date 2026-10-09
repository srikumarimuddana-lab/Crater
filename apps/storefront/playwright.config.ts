import { defineConfig, devices } from '@playwright/test';
import { TEST_ADMIN_SECRET_KEY, allTestStaff } from './tests/e2e/admin/staff';

const port = Number(process.env.PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
// Use a preinstalled Chromium when the environment provides one (e.g. CI images).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'tablet-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // Production server: tests run against `next build` output, not the dev overlay.
    command: `npm run start -- -p ${port} -H 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Test-only admin environment: in-memory database, a throwaway key, and MFA-enrolled staff per role.
    // ADMIN_DEV_STAFF is refused by the app unless COMMERCE_DB=memory.
    env: {
      COMMERCE_DB: 'memory',
      ADMIN_SECRET_KEY: TEST_ADMIN_SECRET_KEY,
      ADMIN_COOKIE_SECURE: 'false',
      ADMIN_DEV_STAFF: JSON.stringify(allTestStaff()),
    },
  },
});
