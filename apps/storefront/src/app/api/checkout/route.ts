import { getCartId } from '@/lib/commerce/cart-cookie';
import { methodNotAllowed } from '@/lib/commerce/http';
import { createCheckoutSession } from '@/lib/commerce';
import { isStripeCheckoutUrl } from '@/lib/commerce/stripe-client';

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

  const result = await createCheckoutSession(cartId);
  if (!result.ok) return failure(result.code);
  // Defence in depth: the service already checked, but never redirect anywhere else.
  if (!isStripeCheckoutUrl(result.redirectUrl)) return failure('PAYMENT_PROVIDER_UNAVAILABLE');
  return redirect(result.redirectUrl);
}

export const GET = () => methodNotAllowed('POST');
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
