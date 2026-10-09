import { randomBytes } from 'node:crypto';
import type { ID } from './types';

export type GidType = 'Product' | 'ProductVariant' | 'ProductOption' | 'ProductOptionValue' | 'Collection' | 'Cart' | 'CartLine' | 'Order';

export function gid(type: GidType, tail: string | number): ID {
  return `gid://crater/${type}/${tail}`;
}

const NUMERIC_TAIL = /^[1-9]\d{0,8}$/;
const CART_TAIL = /^[A-Za-z0-9_-]{32}$/;

/** Returns the positive integer tail of a numeric gid of the given type, else null. */
export function numericId(id: unknown, type: Exclude<GidType, 'Cart'>): number | null {
  if (typeof id !== 'string') return null;
  const prefix = `gid://crater/${type}/`;
  if (!id.startsWith(prefix)) return null;
  const tail = id.slice(prefix.length);
  return NUMERIC_TAIL.test(tail) ? Number(tail) : null;
}

/** 24 random bytes = 192 bits of entropy, base64url (32 chars). The ID is a bearer secret. */
export function newCartId(): ID {
  return gid('Cart', randomBytes(24).toString('base64url'));
}

export function isCartId(id: unknown): id is ID {
  return typeof id === 'string' && id.startsWith('gid://crater/Cart/') && CART_TAIL.test(id.slice('gid://crater/Cart/'.length));
}

export function newCheckoutId(): string {
  return `chk_${randomBytes(16).toString('hex')}`;
}

export function isCheckoutId(id: unknown): id is string {
  return typeof id === 'string' && /^chk_[a-f0-9]{32}$/.test(id);
}

/** Stripe Checkout Session ids: cs_test_/cs_live_ plus an alphanumeric body. */
export function isStripeSessionId(id: unknown): id is string {
  return typeof id === 'string' && /^cs_(test|live)_[A-Za-z0-9]{10,240}$/.test(id);
}
