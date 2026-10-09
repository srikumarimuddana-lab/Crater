import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '@/lib/commerce/config';
import { defaultStripeFactory, resolveStripeEndpoint } from '@/lib/commerce/stripe-client';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('STRIPE_API_BASE test-only override guard', () => {
  const resolve = (key: string, raw: string | undefined) => {
    const warnings: string[] = [];
    return { endpoint: resolveStripeEndpoint(key, raw, (r) => warnings.push(r)), warnings };
  };

  it('uses a loopback host with an sk_test_ key', () => {
    expect(resolve('sk_test_integration_only', 'http://127.0.0.1:12111').endpoint).toEqual({ protocol: 'http', host: '127.0.0.1', port: 12111 });
    expect(resolve('sk_test_x', 'http://localhost:12111').endpoint).toEqual({ protocol: 'http', host: 'localhost', port: 12111 });
    expect(resolve('sk_test_x', 'http://[::1]:12111').endpoint).toEqual({ protocol: 'http', host: '::1', port: 12111 });
    expect(resolve('sk_test_x', 'https://localhost').endpoint).toEqual({ protocol: 'https', host: 'localhost', port: 443 });
    expect(resolve('sk_test_x', 'http://127.0.0.1:12111').warnings).toEqual([]);
  });

  it('ignores the override for a live key, even with a loopback host', () => {
    for (const key of ['sk_live_abc123', 'rk_live_abc123', 'rk_test_abc123', '']) {
      const r = resolve(key, 'http://127.0.0.1:12111');
      expect(r.endpoint, key).toBeNull();
      expect(r.warnings).toHaveLength(1);
    }
  });

  it('ignores a remote host with a test key', () => {
    for (const raw of [
      'https://api.evil.example',
      'http://127.0.0.1.evil.example:12111',
      'http://evil.example@127.0.0.1:12111', // credentials
      'http://10.0.0.5:12111',
      'http://0.0.0.0:12111',
      'ftp://127.0.0.1:12111',
      'not a url',
    ]) {
      const r = resolve('sk_test_abc123', raw);
      expect(r.endpoint, raw).toBeNull();
      expect(r.warnings, raw).toHaveLength(1);
    }
  });

  it('does nothing when unset', () => {
    expect(resolve('sk_test_abc', undefined)).toEqual({ endpoint: null, warnings: [] });
    expect(resolve('sk_test_abc', '')).toEqual({ endpoint: null, warnings: [] });
  });

  it('the warning never contains the URL, the key, or credentials', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('STRIPE_API_BASE', 'http://user:hunter2@evil.example:9999');
    defaultStripeFactory('sk_live_SECRETKEY123');
    defaultStripeFactory('sk_test_SECRETKEY123');
    const logged = JSON.stringify(warn.mock.calls);
    expect(warn).toHaveBeenCalledTimes(2);
    for (const secret of ['hunter2', 'evil.example', '9999', 'SECRETKEY123']) expect(logged).not.toContain(secret);
  });

  it('the SDK client really targets the loopback endpoint, and falls back to api.stripe.com when ignored', async () => {
    vi.stubEnv('STRIPE_API_BASE', 'http://127.0.0.1:1');
    const local = defaultStripeFactory('sk_test_abc123') as unknown as { checkout: { sessions: { retrieve(id: string): Promise<unknown> } } };
    // Port 1 refuses connections: a connection error proves the request went to loopback, not api.stripe.com.
    await expect(local.checkout.sessions.retrieve('cs_test_abc')).rejects.toMatchObject({ type: 'StripeConnectionError' });
    const sdk = defaultStripeFactory('sk_live_abc123') as unknown as { _api: { host: string; port: string | number; protocol: string } };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(sdk._api.host).toBe('api.stripe.com');
  });
});

describe('site origin for Stripe return URLs', () => {
  const base = { COMMERCE_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_integration_only' };
  it('accepts underscores in test keys and prefers the runtime SITE_URL over the build-time NEXT_PUBLIC_SITE_URL', () => {
    const cfg = readConfig({ ...base, SITE_URL: 'http://127.0.0.1:3300', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' });
    expect(cfg.mode).toBe('stripe-test');
    expect(cfg.siteUrl).toBe('http://127.0.0.1:3300');
    expect(readConfig({ ...base, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }).siteUrl).toBe('http://localhost:3000');
  });
  it('an invalid SITE_URL does not silently fall back (checkout is refused instead)', () => {
    expect(readConfig({ ...base, SITE_URL: 'http://evil.example', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }).siteUrl).toBeNull();
  });
});
