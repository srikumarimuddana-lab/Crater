import { clearCartId, getCartId, setCartId } from '@/lib/commerce/cart-cookie';
import { BadRequest, badRequest, isCrossSite, parseCartInput, privateJson, readJsonBody } from '@/lib/commerce/http';
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
