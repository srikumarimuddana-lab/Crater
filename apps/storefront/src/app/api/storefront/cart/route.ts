import { clearCartId, getCartId, setCartId } from '@/lib/commerce/cart-cookie';
import { BadRequest, badRequest, isCrossSite, parseBuyerIdentityBody, parseCartInput, privateJson, readJsonBody } from '@/lib/commerce/http';
import { getStorefront } from '@/lib/commerce';

/** cartCreate-style read of the cart in the HTTP-only cookie. Never cached. */
export async function GET() {
  const id = await getCartId();
  const cart = id ? await getStorefront().cart({ id }) : null;
  if (id && !cart) await clearCartId(); // expired or completed: drop the dead cookie
  return privateJson({ cart });
}

/** cartCreate. Body is a CartInput; the new cart id is delivered only via the cookie. */
export async function POST(request: Request) {
  if (isCrossSite(request)) return privateJson({ error: 'Forbidden' }, 403);
  try {
    const input = parseCartInput(await readJsonBody(request));
    const payload = await getStorefront().cartCreate({ input });
    if (payload.cart) await setCartId(payload.cart.id);
    return privateJson(payload);
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error.message);
    throw error;
  }
}

/**
 * cartBuyerIdentityUpdate for the cart in the cookie: `{ "buyerIdentity": { "provinceCode": "SK" } }` sets the ship-to
 * province (tax); `null` clears it. Absolute values, so a retry is naturally idempotent. A bad value is a userError
 * (INVALID, field ["buyerIdentity","provinceCode"]), not an HTTP error. Never cached; the cart id never leaves the cookie.
 */
export async function PATCH(request: Request) {
  if (isCrossSite(request)) return privateJson({ error: 'Forbidden' }, 403);
  try {
    const { buyerIdentity } = parseBuyerIdentityBody(await readJsonBody(request));
    const id = await getCartId();
    if (!id) {
      return privateJson({ cart: null, userErrors: [{ code: 'MISSING_CART', field: ['cartId'], message: 'There is no cart.' }], warnings: [] });
    }
    const payload = await getStorefront().cartBuyerIdentityUpdate({ cartId: id, buyerIdentity });
    if (!payload.cart && payload.userErrors.some((e) => e.code === 'MISSING_CART')) await clearCartId();
    return privateJson(payload);
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error.message);
    throw error;
  }
}
