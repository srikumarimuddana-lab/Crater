import Stripe from 'stripe';
import { logger } from './log';

/**
 * The narrow slice of the Stripe SDK this app uses. Injecting a factory lets tests
 * substitute a mock so no test ever reaches the network.
 */
export interface StripeClient {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options: { idempotencyKey: string },
      ): Promise<{ id: string; url: string | null }>;
      retrieve(id: string): Promise<{ id: string; payment_status: string; status: string | null; metadata?: Record<string, string> | null }>;
    };
  };
  webhooks: {
    constructEvent(payload: string, header: string, secret: string): Stripe.Event;
  };
}

export type StripeFactory = (secretKey: string) => StripeClient;

export type StripeEndpoint = { protocol: 'http' | 'https'; host: string; port: number };

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * TEST-ONLY endpoint override (STRIPE_API_BASE), used by the integration suite to point
 * the SDK at a fake Stripe on this machine. It is honoured only when the secret key starts
 * with `sk_test_` AND the URL's host is loopback. Anything else is ignored with a warning
 * that never contains the URL, the key, or any credential, so a stray variable can never
 * redirect real (or live-key) traffic to another host.
 */
export function resolveStripeEndpoint(
  secretKey: string,
  raw: string | undefined,
  warn: (reason: string) => void = (reason) => logger.warn('STRIPE_API_BASE ignored', { reason }),
): StripeEndpoint | null {
  if (!raw) return null;
  if (!secretKey.startsWith('sk_test_')) {
    warn('override is only allowed with an sk_test_ key');
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    warn('value is not a valid URL');
    return null;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    warn('host is not loopback (127.0.0.1, localhost or ::1)');
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    warn('URL must be plain http(s) without credentials');
    return null;
  }
  const protocol = url.protocol === 'https:' ? 'https' : 'http';
  const port = url.port ? Number(url.port) : protocol === 'https' ? 443 : 80;
  return { protocol, host: url.hostname.replace(/^\[|\]$/g, ''), port };
}

/**
 * Production factory. The SDK's pinned API version is used. Automatic network retries
 * are off: a retry of a timed-out create must be an explicit, idempotency-keyed call
 * made by our own code path, not a hidden replay.
 */
export const defaultStripeFactory: StripeFactory = (secretKey) => {
  const endpoint = resolveStripeEndpoint(secretKey, process.env.STRIPE_API_BASE);
  return new Stripe(secretKey, {
    maxNetworkRetries: 0,
    timeout: 20_000,
    appInfo: { name: 'crater-storefront' },
    ...(endpoint ?? {}),
  }) as unknown as StripeClient;
};

/** Only the Stripe-hosted Checkout origin is an acceptable redirect target. */
export function isStripeCheckoutUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === 'checkout.stripe.com' && u.port === '' && !u.username && !u.password;
  } catch {
    return false;
  }
}
