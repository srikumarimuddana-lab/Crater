import { defineConfig, devices } from '@playwright/test';
import {
  FAKE_STRIPE_ORIGIN,
  FAKE_STRIPE_PORT,
  INTEGRATION_DIST_DIR,
  INTEGRATION_ORIGIN,
  INTEGRATION_PORT,
  integrationServerEnv,
  requireTestDatabaseUrl,
} from './tests/integration/env.mjs';

/**
 * Integration suite: real browser + real Postgres (TEST_DATABASE_URL) + a fake Stripe on
 * 127.0.0.1:12111 + a production build in .next-integration served on 127.0.0.1:3300.
 * Run it with `npm run test:integration` (build first, with the same env) or
 * `npm run test:integration:pg` (also starts and removes a throwaway Postgres 16).
 * It never uses `.next`, port 3100, or the default Playwright config.
 */
const databaseUrl = requireTestDatabaseUrl();
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: './tests/integration',
  // Not under test-results/: the default e2e config cleans that directory concurrently.
  outputDir: './.next-integration/test-results',
  // The specs share one database and one fake Stripe, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: INTEGRATION_ORIGIN,
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: [
    {
      command: 'node tests/integration/fake-stripe.mjs',
      url: `${FAKE_STRIPE_ORIGIN}/__test/health`,
      env: { FAKE_STRIPE_PORT: String(FAKE_STRIPE_PORT) },
      reuseExistingServer: false,
      timeout: 15_000,
    },
    {
      command: `npx next start -p ${INTEGRATION_PORT} -H 127.0.0.1`,
      url: INTEGRATION_ORIGIN,
      env: { ...(process.env as Record<string, string>), ...integrationServerEnv(databaseUrl), NEXT_DIST_DIR: INTEGRATION_DIST_DIR },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
