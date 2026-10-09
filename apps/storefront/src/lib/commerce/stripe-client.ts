import Stripe from 'stripe';

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
      retrieve(id: string): Promise<{ id: string; payment_status: string; status: string | null }>;
    };
  };
  webhooks: {
    constructEvent(payload: string, header: string, secret: string): Stripe.Event;
  };
}

export type StripeFactory = (secretKey: string) => StripeClient;

/**
 * Production factory. The SDK's pinned API version is used. Automatic network retries
 * are off: a retry of a timed-out create must be an explicit, idempotency-keyed call
 * made by our own code path, not a hidden replay.
 */
export const defaultStripeFactory: StripeFactory = (secretKey) =>
  new Stripe(secretKey, {
    maxNetworkRetries: 0,
    timeout: 20_000,
    appInfo: { name: 'crater-storefront' },
  }) as unknown as StripeClient;

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
