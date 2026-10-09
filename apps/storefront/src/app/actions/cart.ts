'use server';

import { revalidatePath } from 'next/cache';
import { getStorefront } from '@/lib/commerce';
import { clearCartId, getCartId, setCartId } from '@/lib/commerce/cart-cookie';
import type { Cart, CartErrorCode, CartMutationPayload } from '@/lib/commerce/types';
import { MAX_LINE_QUANTITY, type AckState, type CartActionState } from '@/components/commerce/cart-types';

/**
 * Cart Server Actions. They accept only variant/line IDs and quantities (never prices), read the
 * cart id from the HTTP-only cookie, and return codes for the UI to map to shop-copy.
 * They work as plain form posts before hydration.
 */

const GID = /^gid:\/\/crater\/[A-Za-z]+\/[A-Za-z0-9_-]+$/;
const WHOLE = /^\d{1,4}$/;

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

function state(partial: Partial<CartActionState> & Pick<CartActionState, 'status'>): CartActionState {
  return {
    errors: [],
    warnings: [],
    serverError: false,
    totalQuantity: null,
    subtotal: null,
    lineQuantity: null,
    addedQuantity: 0,
    ...partial,
    ts: Date.now() + Math.random(),
  };
}

const failed = (): CartActionState => state({ status: 'error', serverError: true });
const rejected = (...errors: CartErrorCode[]): CartActionState => state({ status: 'error', errors });

/** Whole number 0..MAX, else the matching userError code (same codes the backend uses). */
function parseQuantity(raw: string, min: number): { value: number } | { error: CartErrorCode } {
  if (!WHOLE.test(raw)) return { error: 'INVALID_QUANTITY' };
  const n = Number(raw);
  if (n < min) return { error: 'LESS_THAN' };
  if (n > MAX_LINE_QUANTITY) return { error: 'GREATER_THAN' };
  return { value: n };
}

function warningsFor(payload: CartMutationPayload, fallbackTitle: string): CartActionState['warnings'] {
  return payload.warnings.map((w) => {
    const line = payload.cart?.lines.nodes.find((l) => l.id === w.target || l.merchandise.id === w.target);
    return { code: w.code, title: line?.merchandise.product.title ?? fallbackTitle };
  });
}

function summary(cart: Cart | null, lineId?: string, merchandiseId?: string) {
  const line = cart?.lines.nodes.find((l) => (lineId ? l.id === lineId : l.merchandise.id === merchandiseId));
  return {
    totalQuantity: cart?.totalQuantity ?? 0,
    subtotal: cart?.cost.subtotalAmount ?? null,
    lineQuantity: line?.quantity ?? null,
  };
}

export async function addToCart(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  try {
    const merchandiseId = field(formData, 'merchandiseId');
    const handle = field(formData, 'productHandle');
    if (!GID.test(merchandiseId)) return rejected('MERCHANDISE_NOT_FOUND');
    const q = parseQuantity(field(formData, 'quantity'), 1);
    if ('error' in q) return rejected(q.error);

    const sf = getStorefront();
    const lines = [{ merchandiseId, quantity: q.value }];
    const cartId = await getCartId();

    let before = 0;
    let payload: CartMutationPayload;
    if (cartId) {
      const existing = await sf.cart({ id: cartId });
      before = existing?.lines.nodes.find((l) => l.merchandise.id === merchandiseId)?.quantity ?? 0;
      payload = await sf.cartLinesAdd({ cartId, lines });
      // Expired cart: start a new one with the same lines instead of failing.
      if (payload.userErrors.some((e) => e.code === 'MISSING_CART')) {
        before = 0;
        payload = await sf.cartCreate({ input: { lines } });
      }
    } else {
      payload = await sf.cartCreate({ input: { lines } });
    }

    if (payload.cart) {
      if (payload.cart.id !== cartId) await setCartId(payload.cart.id);
    } else if (cartId) {
      await clearCartId();
    }

    // Out-of-stock warnings name a variant that is not in the cart, so resolve its product title.
    let fallbackTitle = 'This item';
    if (handle && payload.warnings.length > 0) {
      fallbackTitle = (await sf.product({ handle }))?.title ?? fallbackTitle;
    }

    revalidatePath('/', 'layout');
    const s = summary(payload.cart, undefined, merchandiseId);
    const addedQuantity = Math.max(0, (s.lineQuantity ?? 0) - before);
    const errors = payload.userErrors.map((e) => e.code);
    const ok = errors.length === 0 && addedQuantity > 0;
    return state({
      status: ok ? 'added' : 'error',
      errors,
      warnings: warningsFor(payload, fallbackTitle),
      addedQuantity,
      ...s,
    });
  } catch {
    return failed();
  }
}

async function mutateLine(
  formData: FormData,
  run: (cartId: string, lineId: string, formData: FormData) => Promise<CartMutationPayload | CartErrorCode>,
  okStatus: 'updated' | 'removed',
): Promise<CartActionState> {
  try {
    const lineId = field(formData, 'lineId');
    if (!GID.test(lineId)) return rejected('INVALID_MERCHANDISE_LINE');
    const cartId = await getCartId();
    if (!cartId) return rejected('MISSING_CART');

    const result = await run(cartId, lineId, formData);
    if (typeof result === 'string') return rejected(result);

    if (result.userErrors.some((e) => e.code === 'MISSING_CART')) await clearCartId();
    revalidatePath('/', 'layout');
    const errors = result.userErrors.map((e) => e.code);
    return state({
      status: errors.length === 0 ? okStatus : 'error',
      errors,
      warnings: warningsFor(result, 'This item'),
      ...summary(result.cart, lineId),
    });
  } catch {
    return failed();
  }
}

/** Sets a line to an absolute quantity (0 removes it). */
export async function updateLine(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  return mutateLine(
    formData,
    async (cartId, lineId, fd) => {
      const q = parseQuantity(field(fd, 'quantity'), 0);
      if ('error' in q) return q.error;
      return getStorefront().cartLinesUpdate({ cartId, lines: [{ id: lineId, quantity: q.value }] });
    },
    'updated',
  );
}

export async function removeLine(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  return mutateLine(formData, (cartId, lineId) => getStorefront().cartLinesRemove({ cartId, lineIds: [lineId] }), 'removed');
}

/**
 * The shopper has seen the current prices (cartPriceChangesAcknowledge). Takes no input: the cart is
 * the one in the cookie, and prices always come from the server. Works as a plain form post.
 */
export async function acknowledgePrices(): Promise<AckState> {
  const ts = Date.now() + Math.random();
  try {
    const cartId = await getCartId();
    if (!cartId) return { status: 'error', ts };
    const payload = await getStorefront().cartPriceChangesAcknowledge({ cartId });
    if (!payload.cart && payload.userErrors.some((e) => e.code === 'MISSING_CART')) await clearCartId();
    revalidatePath('/', 'layout');
    return { status: payload.cart && payload.userErrors.length === 0 ? 'acknowledged' : 'error', ts };
  } catch {
    return { status: 'error', ts };
  }
}
