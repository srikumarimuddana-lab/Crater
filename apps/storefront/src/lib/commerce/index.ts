import 'server-only';
import { commerceModeFrom, type CommerceMode } from './config';
import { formatMoney as formatMoneyImpl } from './money';
import { getServices } from './services';
import type { CheckoutSessionResult, ID, MoneyV2, Order, Storefront } from './types';

/**
 * Public server-side entry point for storefront code (Server Components, Server
 * Actions, route handlers). Client components must not import this module; for
 * display-only money formatting in client code use `./money`.
 */

// A thin facade that defers repository construction to first use, so importing this
// module never opens a connection. Each call resolves the singleton services.
const lazy = <K extends keyof Storefront>(name: K) =>
  (async (args: never) => {
    const { storefront } = await getServices();
    return (storefront[name] as (a: never) => unknown)(args);
  }) as Storefront[K];

export function getStorefront(): Storefront {
  return {
    products: lazy('products'),
    product: lazy('product'),
    variantBySelectedOptions: lazy('variantBySelectedOptions'),
    collections: (async () => (await getServices()).storefront.collections()) as Storefront['collections'],
    cart: lazy('cart'),
    cartCreate: lazy('cartCreate'),
    cartLinesAdd: lazy('cartLinesAdd'),
    cartLinesUpdate: lazy('cartLinesUpdate'),
    cartLinesRemove: lazy('cartLinesRemove'),
    cartBuyerIdentityUpdate: lazy('cartBuyerIdentityUpdate'),
    cartNoteUpdate: lazy('cartNoteUpdate'),
    cartPriceChangesAcknowledge: lazy('cartPriceChangesAcknowledge'),
  };
}

/** 'fixture' (default) | 'stripe-test' | 'stripe-live', from COMMERCE_PROVIDER and the key prefix. */
export function commerceMode(): CommerceMode {
  return commerceModeFrom(process.env);
}

export async function createCheckoutSession(cartId: ID): Promise<CheckoutSessionResult> {
  return (await getServices()).checkout.createCheckoutSession(cartId);
}

/** For the success page. Validates the session id; only ever returns the order tied to that session. */
export async function getCheckoutResult(
  sessionId: string,
): Promise<{ status: 'paid' | 'processing' | 'unpaid' | 'not_found'; order: Order | null }> {
  return (await getServices()).checkout.getCheckoutResult(sessionId);
}

/**
 * For GET /api/checkout/complete: does this finished Stripe session belong to the cart with this id
 * (compared by one-way digest)? False on any mismatch, malformed id, unfinished session or error.
 */
export async function checkoutSessionBelongsToCart(sessionId: string, cartId: ID): Promise<boolean> {
  return (await getServices()).checkout.sessionBelongsToCart(sessionId, cartId);
}

/** Housekeeping for a scheduled job: deletes carts idle for more than 14 days. */
export async function purgeExpiredCarts(): Promise<number> {
  return (await getServices()).repo.deleteExpiredCarts(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));
}

/** Display only, e.g. "$68.00 CAD". */
export function formatMoney(money: MoneyV2, locale?: string): string {
  return formatMoneyImpl(money, locale);
}

export type { CommerceMode } from './config';
