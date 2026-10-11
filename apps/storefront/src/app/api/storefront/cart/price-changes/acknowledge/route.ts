import { clearCartId, getCartId } from '@/lib/commerce/cart-cookie';
import { BadRequest, badRequest, isCrossSite, methodNotAllowed, privateJson, readJsonBody } from '@/lib/commerce/http';
import { getStorefront } from '@/lib/commerce';

/**
 * cartPriceChangesAcknowledge: the shopper has seen the current prices. Takes no input
 * (an empty body or `{}`); the cart is the one in the HTTP-only cookie. Setting every
 * line to its current price is idempotent, so a retry is safe.
 */
export async function POST(request: Request) {
  if (isCrossSite(request)) return privateJson({ error: 'Forbidden' }, 403);
  try {
    const body = await readJsonBody(request);
    if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length > 0)) {
      throw new BadRequest('Body must be empty');
    }
    const cartId = await getCartId();
    if (!cartId) {
      return privateJson({
        cart: null,
        userErrors: [{ code: 'MISSING_CART', field: ['cartId'], message: 'There is no cart.' }],
        warnings: [],
      });
    }
    const payload = await getStorefront().cartPriceChangesAcknowledge({ cartId });
    if (!payload.cart && payload.userErrors.some((e) => e.code === 'MISSING_CART')) await clearCartId();
    return privateJson(payload);
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error.message);
    throw error;
  }
}

export const GET = () => methodNotAllowed('POST');
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
