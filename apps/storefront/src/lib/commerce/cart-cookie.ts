import 'server-only';
import { cookies } from 'next/headers';
import { isCartId } from './ids';
import type { ID } from './types';

/**
 * The cart id is a bearer secret (anyone holding it can read the cart and start
 * checkout), so it lives only in an HTTP-only cookie, never in JS-readable storage.
 */
export const CART_COOKIE = 'crater_cart';
export const CART_COOKIE_MAX_AGE = 14 * 24 * 60 * 60;

export async function getCartId(): Promise<ID | null> {
  const value = (await cookies()).get(CART_COOKIE)?.value;
  return isCartId(value) ? value : null;
}

export async function setCartId(id: ID): Promise<void> {
  if (!isCartId(id)) throw new Error('Refusing to store a malformed cart id');
  (await cookies()).set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CART_COOKIE_MAX_AGE,
  });
}

export async function clearCartId(): Promise<void> {
  (await cookies()).set(CART_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
