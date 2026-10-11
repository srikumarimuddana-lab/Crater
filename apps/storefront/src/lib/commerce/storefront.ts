import {
  buildIndex,
  findVariantBySelectedOptions,
  queryProducts,
  toProduct,
  type CatalogIndex,
} from './catalog';
import {
  applyBuyerIdentity,
  applyLinesAdd,
  applyLinesRemove,
  applyLinesUpdate,
  applyNote,
  applyPriceAcknowledge,
  buildCart,
  buildNewCart,
  isCartDead,
  type Outcome,
} from './cart-logic';
import { isCartId, newCartId } from './ids';
import type { CartRecord, CommerceRepository } from './records';
import type { Cart, CartMutationPayload, ID, Storefront } from './types';

export type StorefrontDeps = {
  repo: CommerceRepository;
  now?: () => Date;
  newCartId?: () => ID;
};

const MISSING_CART: CartMutationPayload = {
  cart: null,
  userErrors: [{ code: 'MISSING_CART', field: ['cartId'], message: 'The cart does not exist or has expired.' }],
  warnings: [],
};
const missing = (): CartMutationPayload => structuredClone(MISSING_CART);

export async function loadIndex(repo: CommerceRepository): Promise<CatalogIndex> {
  const [products, collections] = await Promise.all([repo.listProducts(), repo.listCollections()]);
  return buildIndex(products, collections);
}

/** Live (unexpired, not completed) cart record, or null. Does not extend the cart's life. */
export async function loadLiveCart(repo: CommerceRepository, id: unknown, now: Date): Promise<CartRecord | null> {
  if (!isCartId(id)) return null;
  const record = await repo.getCart(id);
  return record && !isCartDead(record, now) ? record : null;
}

export function createStorefront(deps: StorefrontDeps): Storefront {
  const { repo } = deps;
  const now = deps.now ?? (() => new Date());
  const mintCartId = deps.newCartId ?? newCartId;

  async function mutate(cartId: ID, run: (cart: CartRecord, index: CatalogIndex, at: Date) => Outcome): Promise<CartMutationPayload> {
    if (!isCartId(cartId)) return missing();
    const index = await loadIndex(repo);
    const at = now();
    const result = await repo.updateCart(cartId, (cart) => {
      if (isCartDead(cart, at)) return { cart: null, value: null };
      const outcome = run(cart, index, at);
      return { cart: outcome.next, value: { outcome, view: outcome.next ?? cart } };
    });
    if (!result || !result.value) return missing();
    const { outcome, view } = result.value;
    return { cart: buildCart(view, index), userErrors: outcome.userErrors, warnings: outcome.warnings };
  }

  return {
    async products(args) {
      return queryProducts(await loadIndex(repo), args);
    },
    async product({ handle }) {
      const p = (await repo.listProducts()).find((x) => x.handle === handle);
      return p ? toProduct(p) : null;
    },
    async variantBySelectedOptions({ handle, selectedOptions }) {
      return findVariantBySelectedOptions(await loadIndex(repo), handle, selectedOptions);
    },
    async collections() {
      return (await repo.listCollections()).map(({ id, handle, title, description }) => ({ id, handle, title, description }));
    },

    async cart({ id }): Promise<Cart | null> {
      const record = await loadLiveCart(repo, id, now());
      if (!record) return null;
      return buildCart(record, await loadIndex(repo));
    },
    async cartCreate({ input }) {
      const index = await loadIndex(repo);
      const built = buildNewCart(mintCartId(), input, index, now());
      if (!built.cart) return { cart: null, userErrors: built.userErrors, warnings: built.warnings };
      await repo.createCart(built.cart);
      return { cart: buildCart(built.cart, index), userErrors: [], warnings: built.warnings };
    },
    cartLinesAdd: ({ cartId, lines }) => mutate(cartId, (c, i, at) => applyLinesAdd(c, lines, i, at)),
    cartLinesUpdate: ({ cartId, lines }) => mutate(cartId, (c, i, at) => applyLinesUpdate(c, lines, i, at)),
    cartLinesRemove: ({ cartId, lineIds }) => mutate(cartId, (c, _i, at) => applyLinesRemove(c, lineIds, at)),
    cartBuyerIdentityUpdate: ({ cartId, buyerIdentity }) => mutate(cartId, (c, _i, at) => applyBuyerIdentity(c, buyerIdentity, at)),
    cartNoteUpdate: ({ cartId, note }) => mutate(cartId, (c, _i, at) => applyNote(c, note, at)),
    cartPriceChangesAcknowledge: ({ cartId }) => mutate(cartId, (c, i, at) => applyPriceAcknowledge(c, i, at)),
  };
}
