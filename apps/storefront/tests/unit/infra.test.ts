import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commerceMode, formatMoney } from '@/lib/commerce';
import { commerceModeFrom, readConfig, siteOrigin, stripeUsable } from '@/lib/commerce/config';
import { isCartId, isStripeSessionId, newCartId, numericId } from '@/lib/commerce/ids';
import { redactSession, ref, scrub } from '@/lib/commerce/log';
import { poolConfigFromEnv } from '@/lib/commerce/postgres-repository';
import { getRepository, resetRepositoryForTests } from '@/lib/commerce/repository-factory';

afterEach(() => {
  vi.unstubAllEnvs();
  resetRepositoryForTests();
});

describe('commerce mode', () => {
  it('defaults to fixture and derives test/live from the key prefix', () => {
    expect(commerceModeFrom({})).toBe('fixture');
    expect(commerceModeFrom({ COMMERCE_PROVIDER: 'fixture', STRIPE_SECRET_KEY: 'sk_test_abc' })).toBe('fixture');
    expect(commerceModeFrom({ COMMERCE_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_abc123' })).toBe('stripe-test');
    expect(commerceModeFrom({ COMMERCE_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'rk_test_abc123' })).toBe('stripe-test');
    expect(commerceModeFrom({ COMMERCE_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_live_abc123' })).toBe('stripe-live');
    for (const key of [undefined, '', 'pk_test_abc', 'sk_test_', 'whsec_abc', 'sk_test_abc def']) {
      expect(commerceModeFrom({ COMMERCE_PROVIDER: 'stripe', STRIPE_SECRET_KEY: key }), String(key)).toBe('fixture');
    }
    expect(commerceModeFrom({ COMMERCE_PROVIDER: 'STRIPE', STRIPE_SECRET_KEY: 'sk_test_abc' })).toBe('fixture');
  });

  it('commerceMode() reads process.env', () => {
    expect(commerceMode()).toBe('fixture');
    vi.stubEnv('COMMERCE_PROVIDER', 'stripe');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_abc123');
    expect(commerceMode()).toBe('stripe-test');
  });

  it('live keys are unusable without the explicit opt-in', () => {
    const live = { COMMERCE_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_live_abc123' };
    expect(stripeUsable(readConfig(live))).toBe(false);
    expect(stripeUsable(readConfig({ ...live, STRIPE_ALLOW_LIVE: 'true' }))).toBe(true);
    expect(stripeUsable(readConfig({}))).toBe(false);
  });

  it('only accepts https (or localhost http) site origins', () => {
    expect(siteOrigin('https://shop.example/')).toBe('https://shop.example');
    expect(siteOrigin('http://localhost:3000/some/path')).toBe('http://localhost:3000');
    for (const bad of [undefined, '', 'shop.example', 'http://shop.example', 'ftp://x', 'https://a:b@shop.example']) expect(siteOrigin(bad), String(bad)).toBeNull();
  });
});

describe('ids', () => {
  it('cart ids carry at least 128 bits and are unique', () => {
    const ids = new Set(Array.from({ length: 500 }, newCartId));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(isCartId(id)).toBe(true);
      expect(Buffer.from(id.slice('gid://crater/Cart/'.length), 'base64url').length).toBeGreaterThanOrEqual(16);
    }
    expect(isCartId('gid://crater/Cart/' + 'a'.repeat(31))).toBe(false);
    expect(isCartId('gid://crater/Cart/' + 'a'.repeat(31) + '!')).toBe(false);
  });

  it('numeric gids and Stripe session ids are strictly validated', () => {
    expect(numericId('gid://crater/ProductVariant/12', 'ProductVariant')).toBe(12);
    for (const bad of ['gid://crater/ProductVariant/0', 'gid://crater/ProductVariant/01', 'gid://crater/ProductVariant/1e3', 'gid://crater/Product/12', 12, null, 'gid://crater/ProductVariant/12/x']) {
      expect(numericId(bad, 'ProductVariant'), String(bad)).toBeNull();
    }
    expect(isStripeSessionId('cs_test_a1B2c3D4e5F6g7')).toBe(true);
    expect(isStripeSessionId('cs_test_short')).toBe(false);
  });
});

describe('redaction', () => {
  it('scrubs keys, connection strings, and cart ids from text', () => {
    const text = `failed with sk_test_abc123 and whsec_zzz999 at postgresql://user:pw@host:5432/db for gid://crater/Cart/${'a'.repeat(32)}`;
    const out = scrub(text);
    expect(out).not.toMatch(/sk_test_abc123|whsec_zzz999|user:pw|aaaaaaaa/);
    expect(out).toContain('[redacted]');
  });
  it('references and truncated ids do not expose the full value', () => {
    const cart = newCartId();
    expect(ref(cart)).toHaveLength(10);
    expect(cart).not.toContain(ref(cart));
    expect(redactSession('cs_test_a1B2c3D4e5F6g7H8i9J0')).toBe('cs_test_…i9J0');
  });
});

describe('formatMoney facade', () => {
  it('formats display strings', () => {
    expect(formatMoney({ amount: '68.00', currencyCode: 'CAD' })).toBe('$68.00 CAD');
  });
});

describe('postgres connection settings (Supabase-ready)', () => {
  const url = 'postgresql://u:p@db.example:6543/postgres';
  it('requires DATABASE_URL, defaults the pool to 3, and bounds DATABASE_POOL_MAX', () => {
    expect(() => poolConfigFromEnv({})).toThrow(/DATABASE_URL/);
    expect(poolConfigFromEnv({ DATABASE_URL: url }).max).toBe(3);
    expect(poolConfigFromEnv({ DATABASE_URL: url, DATABASE_POOL_MAX: '5' }).max).toBe(5);
    for (const bad of ['0', '-1', '99', 'x', '2.5']) expect(poolConfigFromEnv({ DATABASE_URL: url, DATABASE_POOL_MAX: bad }).max, bad).toBe(3);
  });
  it('DATABASE_SSL=require enables verified TLS; nothing ever disables verification', () => {
    expect(poolConfigFromEnv({ DATABASE_URL: url }).ssl).toBeUndefined();
    expect(poolConfigFromEnv({ DATABASE_URL: url, DATABASE_SSL: 'require' }).ssl).toEqual({ rejectUnauthorized: true });
    expect(poolConfigFromEnv({ DATABASE_URL: url, DATABASE_SSL: 'no-verify' }).ssl).toBeUndefined();
    for (const f of ['src/lib/commerce/postgres-repository.ts', 'src/lib/commerce/repository-factory.ts', 'db/migrate.mjs', 'db/seed.mjs']) {
      expect(read(f), f).not.toMatch(/rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/);
    }
  });
  it('the pg Pool is a globalThis singleton', async () => {
    vi.stubEnv('COMMERCE_DB', 'postgres');
    vi.stubEnv('DATABASE_URL', url);
    const a = await getRepository();
    const b = await getRepository();
    expect(a).toBe(b);
    expect(a.kind).toBe('postgres');
    await a.close(); // no connection was ever opened (pg is lazy)
    resetRepositoryForTests();
    vi.stubEnv('COMMERCE_DB', 'mysql');
    await expect(getRepository()).rejects.toThrow(/COMMERCE_DB/);
  });
  it('the memory repository is the default and survives module reloads via globalThis', async () => {
    const a = await getRepository({});
    resetRepositoryForTests();
    const b = await getRepository({});
    expect(a.kind).toBe('memory');
    expect(await b.listProducts()).toHaveLength(9);
  });
});

const root = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('pooler safety (static)', () => {
  const sources = ['src/lib/commerce/postgres-repository.ts', 'db/migrate.mjs', 'db/seed.mjs', 'db/migrations/0001_init.sql'];
  it('uses no session state: SET, session advisory locks, LISTEN, temp tables, or named statements', () => {
    for (const file of sources) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\bset\s+(session|search_path|role|local)\b/i);
      expect(code, file).not.toMatch(/\bpg_advisory_lock\b|\bpg_try_advisory_lock\b/i);
      expect(code, file).not.toMatch(/\blisten\b|\bnotify\b|create\s+temp/i);
      expect(code, file).not.toMatch(/\bprepare\b/i);
      expect(code, file).not.toMatch(/\bname:\s*['"`]/); // a `name` on a pg query = server-side prepared statement
    }
  });
  it('only parameterized queries: no template-interpolated values reach SQL text', () => {
    const code = read('src/lib/commerce/postgres-repository.ts');
    const interpolated = [...code.matchAll(/`[^`]*\$\{[^}]+\}[^`]*`/g)].map((m) => m[0]).filter((s) => /\b(select|insert|update|delete)\b/i.test(s));
    // The only dynamic fragments are column assignments built from fixed literals (updateVariant) and a fixed where clause.
    for (const s of interpolated) expect(s).toMatch(/\$\{(sets\.join\(', '\)|where)\}/);
  });
  it('every commerce table is schema-qualified and in the commerce schema', () => {
    const code = read('src/lib/commerce/postgres-repository.ts');
    expect(code).not.toMatch(/\b(from|join|into|update)\s+(?!commerce\.)(products|variants|carts|cart_lines|checkouts|orders|order_lines|collections|counters)\b/i);
    const created = [...read('db/migrations/0001_init.sql').matchAll(/create table (?:if not exists )?([\w.]+)/gi)].map((m) => m[1]);
    expect(created.length).toBeGreaterThan(10);
    expect(created.filter((t) => !t.startsWith('commerce.'))).toEqual([]);
  });
});
