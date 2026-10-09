export type CommerceMode = 'fixture' | 'stripe-test' | 'stripe-live';

export type CommerceConfig = {
  mode: CommerceMode;
  stripeSecretKey: string | null;
  webhookSecret: string | null;
  allowLive: boolean;
  siteUrl: string | null;
};

type Env = Record<string, string | undefined>;

/** Restricted keys (rk_) work like secret keys for Checkout Sessions. */
const TEST_KEY = /^(sk|rk)_test_[A-Za-z0-9]+$/;
const LIVE_KEY = /^(sk|rk)_live_[A-Za-z0-9]+$/;

export function commerceModeFrom(env: Env): CommerceMode {
  if (env.COMMERCE_PROVIDER !== 'stripe') return 'fixture';
  const key = env.STRIPE_SECRET_KEY ?? '';
  if (TEST_KEY.test(key)) return 'stripe-test';
  if (LIVE_KEY.test(key)) return 'stripe-live';
  return 'fixture'; // stripe requested but no usable key: stay safe, charge nothing
}

/** Validated site origin: https anywhere, http only for localhost. No path, no credentials. */
export function siteOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    if (u.username || u.password) return null;
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function readConfig(env: Env = process.env): CommerceConfig {
  const mode = commerceModeFrom(env);
  return {
    mode,
    stripeSecretKey: mode === 'fixture' ? null : (env.STRIPE_SECRET_KEY ?? null),
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || null,
    allowLive: env.STRIPE_ALLOW_LIVE === 'true',
    siteUrl: siteOrigin(env.NEXT_PUBLIC_SITE_URL),
  };
}

/** True when the process may talk to Stripe at all. Live keys need the explicit opt-in. */
export function stripeUsable(config: CommerceConfig): boolean {
  if (config.mode === 'fixture' || !config.stripeSecretKey) return false;
  if (config.mode === 'stripe-live' && !config.allowLive) return false;
  return true;
}
