import { getCartId } from '@/lib/commerce/cart-cookie';
import { methodNotAllowed } from '@/lib/commerce/http';
import { createCheckoutSession } from '@/lib/commerce';
import { isStripeCheckoutUrl } from '@/lib/commerce/stripe-client';
import { cookies } from 'next/headers';
import { attachCheckoutAttribution } from '@/lib/analytics/repository';
import { CONSENT_COOKIE, SESSION_COOKIE } from '@/lib/analytics/schema';
import { logger } from '@/lib/commerce/log';

const NO_STORE = 'no-store';

function redirect(location: string) {
  // 303 turns the POST into a GET on the destination. Location may be relative.
  return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': NO_STORE } });
}

const failure = (code: string) => redirect(`/cart?checkout_error=${encodeURIComponent(code)}`);

/**
 * Starts hosted Stripe Checkout for the cart in the HTTP-only cookie. Prices and the
 * cart are read on the server; nothing from the request body is trusted (it is ignored).
 */
export async function POST(request: Request) {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return failure('FORBIDDEN');

  const cartId = await getCartId();
  if (!cartId) return failure('EMPTY_CART');

  let discountCode = '';
  if (Number(request.headers.get('content-length') || 0) > 4096) return failure('CART_INVALID');
  try { const form = await request.formData(); discountCode = String(form.get('discountCode') ?? '').trim().toUpperCase(); } catch { /* Old no-body callers use no discount. */ }
  if (discountCode.length > 40) return failure('CART_INVALID');
  const result = await createCheckoutSession(cartId, { discountCode });
  if (!result.ok) return failure(result.code);
  // Defence in depth: the service already checked, but never redirect anywhere else.
  if (!isStripeCheckoutUrl(result.redirectUrl)) return failure('PAYMENT_PROVIDER_UNAVAILABLE');
  try { const jar = await cookies(); const session = jar.get(SESSION_COOKIE)?.value; if (jar.get(CONSENT_COOKIE)?.value === 'granted' && session) await attachCheckoutAttribution(result.checkoutId, session); } catch(e) { logger.error('checkout attribution unavailable', e); }
  return redirect(result.redirectUrl);
}

export const GET = () => methodNotAllowed('POST');
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
