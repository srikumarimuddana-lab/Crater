import 'server-only';
import { cache } from 'react';
import { getStorefront } from '@/lib/commerce';
import { getCartId } from '@/lib/commerce/cart-cookie';
import type { Cart } from '@/lib/commerce/types';
import { MAX_LINE_QUANTITY, type CartView } from '@/components/commerce/cart-types';

export function toCartView(cart: Cart): CartView {
  return {
    totalQuantity: cart.totalQuantity,
    subtotal: cart.cost.subtotalAmount,
    hasPriceChanges: cart.hasPriceChanges,
    lines: cart.lines.nodes.map((line) => {
      const m = line.merchandise;
      const stock = m.quantityAvailable;
      return {
        id: line.id,
        quantity: line.quantity,
        maxQuantity: stock === null ? MAX_LINE_QUANTITY : Math.max(1, Math.min(MAX_LINE_QUANTITY, stock)),
        handle: m.product.handle,
        title: m.product.title,
        variantTitle: m.title,
        optionLabel: m.selectedOptions.map((o) => `${o.name}: ${o.value}`).join(', '),
        imageUrl: m.image?.url ?? null,
        unitPrice: line.cost.amountPerQuantity,
        previousUnitPrice: line.priceAtAdd.amount !== line.cost.amountPerQuantity.amount ? line.priceAtAdd : null,
        lineTotal: line.cost.totalAmount,
        available: m.availableForSale,
      };
    }),
  };
}

export type LoadedCart = { cart: CartView | null; expired: boolean };

/** Reads the cart named by the private cookie. Deduplicated per request; never cached across requests. */
export const loadCart = cache(async (): Promise<LoadedCart> => {
  const id = await getCartId();
  if (!id) return { cart: null, expired: false };
  try {
    const cart = await getStorefront().cart({ id });
    return cart ? { cart: toCartView(cart), expired: false } : { cart: null, expired: true };
  } catch {
    // A backend failure must not break every page header. No ids are logged.
    return { cart: null, expired: false };
  }
});
