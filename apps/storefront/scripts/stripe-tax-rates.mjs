#!/usr/bin/env node
// `npm run stripe:tax-rates`: makes sure Stripe holds exactly one active, exclusive Tax Rate per key in
// src/lib/commerce/tax.ts (GST, HST by province, Saskatchewan PST), tagged metadata.crater_tax_key.
//
//   STRIPE_SECRET_KEY=sk_test_... npm run stripe:tax-rates
//
// Idempotent: a matching rate is kept, a mismatched or duplicate old one is ARCHIVED (Stripe rates are
// immutable, so they are never edited), a missing one is created. Re-running changes nothing.
// Refuses live keys (sk_live_ / rk_live_) unless STRIPE_ALLOW_LIVE=true. Prints ids, never the key.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { TAX_RATES } from '../src/lib/commerce/tax.ts';
import { ensureTaxRates } from '../src/lib/commerce/tax-rates.ts';

const TEST_KEY = /^(sk|rk)_test_[A-Za-z0-9_]+$/;
const LIVE_KEY = /^(sk|rk)_live_[A-Za-z0-9_]+$/;

/** Which environment the key targets, or throws. Never echoes the key. */
export function checkKey(env) {
  const key = env.STRIPE_SECRET_KEY ?? '';
  if (TEST_KEY.test(key)) return { key, mode: 'test' };
  if (LIVE_KEY.test(key)) {
    if (env.STRIPE_ALLOW_LIVE !== 'true') {
      throw new Error('Refusing to use a live Stripe key. Set STRIPE_ALLOW_LIVE=true only when you intend to change the live account.');
    }
    return { key, mode: 'live' };
  }
  throw new Error('STRIPE_SECRET_KEY is missing or not a Stripe secret/restricted key (sk_test_..., rk_test_...).');
}

/** @param {{ env?: Record<string,string|undefined>, api?: import('../src/lib/commerce/tax-rates.ts').TaxRateApi, log?: (s: string) => void }} options */
export async function run({ env = process.env, api, log = console.log } = {}) {
  const { key, mode } = checkKey(env);
  const client = api ?? new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'crater-storefront' } });
  log(`[stripe:tax-rates] ${mode} mode`);
  const report = await ensureTaxRates(client, TAX_RATES, (line) => log(`[stripe:tax-rates] ${line}`));
  for (const r of report) log(`[stripe:tax-rates] ${r.key.padEnd(10)} ${r.action.padEnd(8)} ${r.id}`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await run();
  } catch (error) {
    console.error('[stripe:tax-rates] failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  }
}
