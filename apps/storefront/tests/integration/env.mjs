// Single source of truth for the integration suite's server environment, used by the
// build step (scripts/test-integration.mjs) and by playwright.integration.config.ts.
//
// SITE_URL is a SERVER-ONLY variable read at runtime. NEXT_PUBLIC_SITE_URL is inlined at BUILD
// time, so it is set to the same value for the build as well; either way Stripe's success and
// cancel URLs resolve to the integration origin (http://127.0.0.1:3300) and never to a dev default.

export const INTEGRATION_PORT = 3300;
export const FAKE_STRIPE_PORT = 12111;
export const INTEGRATION_ORIGIN = `http://127.0.0.1:${INTEGRATION_PORT}`;
export const FAKE_STRIPE_ORIGIN = `http://127.0.0.1:${FAKE_STRIPE_PORT}`;
export const INTEGRATION_STRIPE_KEY = 'sk_test_integration_only';
export const INTEGRATION_WEBHOOK_SECRET = 'whsec_integration_only';
export const INTEGRATION_DIST_DIR = '.next-integration';

/** The database must be an obviously throwaway one: its name has to contain "test". */
export function requireTestDatabaseUrl(env = process.env) {
  const url = env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. The integration suite needs a THROWAWAY Postgres database whose name contains "test", e.g.\n' +
        '  TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/crater_test npm run test:integration\n' +
        'or run `npm run test:integration:pg` to start and remove a local throwaway cluster for you.',
    );
  }
  let name = '';
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid connection URL.');
  }
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to run: the TEST_DATABASE_URL database name must contain "test" (got "${name}").`);
  }
  return url;
}

/** Environment for `next build` and `next start`. */
export function integrationServerEnv(databaseUrl) {
  return {
    NEXT_DIST_DIR: INTEGRATION_DIST_DIR,
    COMMERCE_PROVIDER: 'stripe',
    COMMERCE_DB: 'postgres',
    DATABASE_URL: databaseUrl,
    STRIPE_SECRET_KEY: INTEGRATION_STRIPE_KEY,
    STRIPE_WEBHOOK_SECRET: INTEGRATION_WEBHOOK_SECRET,
    STRIPE_API_BASE: FAKE_STRIPE_ORIGIN,
    SITE_URL: INTEGRATION_ORIGIN,
    NEXT_PUBLIC_SITE_URL: INTEGRATION_ORIGIN,
    STRIPE_ALLOW_LIVE: 'false',
    // Never inherit a developer's direct/pooler URL or TLS setting into the throwaway run.
    DIRECT_DATABASE_URL: databaseUrl,
    DATABASE_SSL: '',
  };
}
