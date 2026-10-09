import { createCheckoutService, type CheckoutService } from './checkout';
import { getRepository } from './repository-factory';
import type { CommerceRepository } from './records';
import { createStorefront } from './storefront';
import { defaultStripeFactory, type StripeFactory } from './stripe-client';
import type { Storefront } from './types';

export type Services = { repo: CommerceRepository; storefront: Storefront; checkout: CheckoutService };

const KEY = Symbol.for('crater.commerce.services');
type Holder = { services?: Services; stripe?: StripeFactory };
const holder = (): Holder => {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  return (g[KEY] ??= {});
};

export async function getServices(): Promise<Services> {
  const h = holder();
  if (h.services) return h.services;
  const repo = await getRepository();
  const storefront = createStorefront({ repo });
  const checkout = createCheckoutService({ repo, stripe: (key) => (h.stripe ?? defaultStripeFactory)(key) });
  h.services = { repo, storefront, checkout };
  return h.services;
}

/** Test seam: swap the Stripe client factory (and rebuild services). Never used in app code. */
export function overrideStripeFactoryForTests(factory: StripeFactory | undefined): void {
  const h = holder();
  h.stripe = factory;
  delete h.services;
}

export function resetServicesForTests(): void {
  const h = holder();
  delete h.services;
  delete h.stripe;
}
