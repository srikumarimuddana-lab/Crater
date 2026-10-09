import { clearCartId, getCartId, setCartId } from '@/lib/commerce/cart-cookie';
import {
  BadRequest,
  badRequest,
  isCrossSite,
  parseAddBody,
  parseRemoveBody,
  parseUpdateBody,
  privateJson,
  readJsonBody,
} from '@/lib/commerce/http';
import { getStorefront } from '@/lib/commerce';
import type { CartMutationPayload } from '@/lib/commerce/types';

const guard = async (request: Request, run: (body: unknown) => Promise<CartMutationPayload>) => {
  if (isCrossSite(request)) return privateJson({ error: 'Forbidden' }, 403);
  try {
    return privateJson(await run(await readJsonBody(request)));
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error.message);
    throw error;
  }
};

/** Missing/expired carts for update and remove: report MISSING_CART and drop the dead cookie. */
async function withCart(op: (cartId: string) => Promise<CartMutationPayload>): Promise<CartMutationPayload> {
  const id = await getCartId();
  if (!id) {
    return { cart: null, userErrors: [{ code: 'MISSING_CART', field: ['cartId'], message: 'There is no cart.' }], warnings: [] };
  }
  const payload = await op(id);
  if (!payload.cart && payload.userErrors.some((e) => e.code === 'MISSING_CART')) await clearCartId();
  return payload;
}

/**
 * cartLinesAdd. Creates the cart when none exists (or the cookie's cart expired). That
 * is safe because an add against a missing cart changed nothing. NOTE: adding is not
 * idempotent; clients must GET the cart before retrying an add that timed out.
 */
export const POST = (request: Request) =>
  guard(request, async (raw) => {
    const { lines } = parseAddBody(raw);
    const store = getStorefront();
    const id = await getCartId();
    if (id) {
      const payload = await store.cartLinesAdd({ cartId: id, lines });
      if (payload.cart || !payload.userErrors.some((e) => e.code === 'MISSING_CART')) return payload;
    }
    const created = await store.cartCreate({ input: { lines } });
    if (created.cart) await setCartId(created.cart.id);
    return created;
  });

/** cartLinesUpdate: absolute quantities, so a retry is naturally idempotent. */
export const PATCH = (request: Request) =>
  guard(request, async (raw) => {
    const { lines } = parseUpdateBody(raw);
    return withCart((cartId) => getStorefront().cartLinesUpdate({ cartId, lines }));
  });

export const DELETE = (request: Request) =>
  guard(request, async (raw) => {
    const { lineIds } = parseRemoveBody(raw);
    return withCart((cartId) => getStorefront().cartLinesRemove({ cartId, lineIds }));
  });
