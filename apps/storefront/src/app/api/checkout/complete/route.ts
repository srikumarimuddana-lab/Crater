import { clearCartId, getCartId } from '@/lib/commerce/cart-cookie';
import { checkoutSessionBelongsToCart } from '@/lib/commerce';
import { isStripeSessionId } from '@/lib/commerce/ids';
import { logger } from '@/lib/commerce/log';

function redirect(location: string) {
  // Relative Location, never built from anything but our own constants and a validated session id.
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

/**
 * Stripe's success_url. After a paid Checkout the bag cookie still names a cart the webhook has closed,
 * which the bag page would present as expired. So: retrieve the session, compare its metadata cart digest
 * with the digest of the cookie cart, and clear the cookie only when they match. A mismatch (the shopper
 * has a newer cart), a malformed session id, or any error keeps the cookie. Either way the shopper then
 * lands on the confirmation page, which shows only what the webhook recorded. Nothing here is logged with
 * a session or cart id.
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!isStripeSessionId(sessionId)) return redirect('/checkout/success');
  try {
    const cartId = await getCartId();
    if (cartId && (await checkoutSessionBelongsToCart(sessionId, cartId))) await clearCartId();
  } catch (error) {
    logger.error('checkout completion could not reconcile the cart cookie', error);
  }
  return redirect(`/checkout/success?session_id=${encodeURIComponent(sessionId)}`);
}
