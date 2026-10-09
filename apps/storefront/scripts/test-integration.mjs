#!/usr/bin/env node
// `npm run test:integration`: migrate + seed the throwaway database, build into
// .next-integration with the integration environment, then run the integration Playwright config.
// Fails fast, before doing anything, if TEST_DATABASE_URL is missing or not a "test" database.
import { spawnSync } from 'node:child_process';
import { integrationServerEnv, requireTestDatabaseUrl } from '../tests/integration/env.mjs';

let databaseUrl;
try {
  databaseUrl = requireTestDatabaseUrl();
} catch (error) {
  console.error(`[test:integration] ${error.message}`);
  process.exit(2);
}

const env = { ...process.env, ...integrationServerEnv(databaseUrl) };
function step(title, command, args) {
  console.log(`\n[test:integration] ${title}`);
  const r = spawnSync(command, args, { stdio: 'inherit', env });
  if (r.status !== 0) {
    console.error(`[test:integration] "${title}" failed (exit ${r.status ?? r.signal})`);
    process.exit(r.status || 1);
  }
}

step('db:migrate', 'node', ['db/migrate.mjs']);
step('db:seed', 'node', ['db/seed.mjs']);
step('next build (NEXT_DIST_DIR=.next-integration)', 'npx', ['next', 'build']);
step('playwright (integration config)', 'npx', ['playwright', 'test', '-c', 'playwright.integration.config.ts', ...process.argv.slice(2)]);
