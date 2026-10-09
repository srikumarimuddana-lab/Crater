import { catalogSeed } from './catalog-seed';
import type {
  CartRecord,
  CatalogSeed,
  CheckoutRecord,
  CollectionRecord,
  CommerceRepository,
  CompleteCheckoutInput,
  CompleteCheckoutOutcome,
  OrderRecord,
  ProductRecord,
  RecordStatusInput,
} from './records';
import type { ID } from './types';

type MemoryState = {
  products: ProductRecord[];
  collections: CollectionRecord[];
  carts: Map<ID, CartRecord>;
  checkouts: Map<string, CheckoutRecord>;
  orders: OrderRecord[];
  events: Set<string>;
  orderCounter: number;
};

function freshState(seed: CatalogSeed): MemoryState {
  return {
    products: structuredClone(seed.products),
    collections: structuredClone(seed.collections),
    carts: new Map(),
    checkouts: new Map(),
    orders: [],
    events: new Set(),
    orderCounter: 1000,
  };
}

const GLOBAL_KEY = Symbol.for('crater.commerce.memory-state');

/**
 * Process-wide state, parked on globalThis so it survives dev HMR module reloads.
 * (It does not survive restarts or span serverless instances: memory mode is for
 * development and fixtures only.)
 */
function globalState(): MemoryState {
  const g = globalThis as unknown as Record<symbol, MemoryState | undefined>;
  return (g[GLOBAL_KEY] ??= freshState(catalogSeed));
}

/**
 * In-memory repository. Every method body that reads then writes is fully
 * synchronous, so each is atomic on the single JS thread (the equivalent of the
 * Postgres transactions). Reads and writes copy records so callers cannot mutate state.
 */
export function createMemoryRepository(options: { seed?: CatalogSeed; shared?: boolean } = {}): CommerceRepository {
  const state = options.shared ? globalState() : freshState(options.seed ?? catalogSeed);
  const clone = <T>(v: T): T => structuredClone(v);

  const findVariant = (id: ID) => {
    for (const p of state.products) {
      const v = p.variants.find((x) => x.id === id);
      if (v) return v;
    }
    return undefined;
  };

  return {
    kind: 'memory',

    async listProducts() {
      return clone(state.products);
    },
    async listCollections() {
      return clone(state.collections);
    },
    async updateVariant(variantId, patch) {
      const v = findVariant(variantId);
      if (!v) return false;
      if (patch.priceMinor !== undefined) v.priceMinor = patch.priceMinor;
      if (patch.quantity !== undefined) v.quantity = patch.quantity;
      return true;
    },

    async createCart(cart) {
      state.carts.set(cart.id, clone(cart));
    },
    async getCart(id) {
      const c = state.carts.get(id);
      return c ? clone(c) : null;
    },
    async updateCart(id, fn) {
      const current = state.carts.get(id);
      if (!current) return null;
      const { cart, value } = fn(clone(current));
      if (cart) state.carts.set(id, clone(cart));
      return { value };
    },
    async deleteExpiredCarts(cutoff) {
      let n = 0;
      for (const [id, c] of state.carts) {
        if (new Date(c.updatedAt) < cutoff) {
          state.carts.delete(id);
          n++;
        }
      }
      return n;
    },

    async findReusableCheckout(cartId, fingerprint, notBefore) {
      let best: CheckoutRecord | null = null;
      for (const c of state.checkouts.values()) {
        if (c.cartId !== cartId || c.fingerprint !== fingerprint) continue;
        if (c.status !== 'created' && c.status !== 'session_created') continue;
        if (new Date(c.createdAt) < notBefore) continue;
        if (!best || c.createdAt > best.createdAt) best = c;
      }
      return best ? clone(best) : null;
    },
    async createCheckout(checkout) {
      state.checkouts.set(checkout.id, clone(checkout));
    },
    async getCheckout(id) {
      const c = state.checkouts.get(id);
      return c ? clone(c) : null;
    },
    async getCheckoutBySessionId(sessionId) {
      for (const c of state.checkouts.values()) if (c.stripeSessionId === sessionId) return clone(c);
      return null;
    },
    async attachSession(checkoutId, sessionId, now) {
      const c = state.checkouts.get(checkoutId);
      if (!c) return false;
      if (c.stripeSessionId && c.stripeSessionId !== sessionId) return false;
      for (const other of state.checkouts.values()) {
        if (other !== c && other.stripeSessionId === sessionId) throw new Error('session already attached');
      }
      c.stripeSessionId = sessionId;
      if (c.status === 'created') c.status = 'session_created';
      c.updatedAt = now;
      return true;
    },

    async completeCheckout(input: CompleteCheckoutInput): Promise<CompleteCheckoutOutcome> {
      if (state.events.has(input.eventId)) return { kind: 'duplicate_event' };
      const checkout = state.checkouts.get(input.checkoutId);
      if (!checkout) return { kind: 'unknown_checkout' };
      if (checkout.stripeSessionId && checkout.stripeSessionId !== input.sessionId) return { kind: 'session_mismatch' };
      const existing = state.orders.find((o) => o.stripeSessionId === input.sessionId);
      if (existing) {
        state.events.add(input.eventId);
        return { kind: 'duplicate_session', order: clone(existing) };
      }

      // All validation passed: from here on nothing can fail, so the mutation is atomic.
      const flags = [...input.flags];
      for (const line of checkout.lines) {
        const v = findVariant(line.variantId);
        if (!v || v.quantity === null) continue;
        if (v.quantity < line.quantity) flags.push('INVENTORY_SHORT');
        v.quantity = Math.max(v.quantity - line.quantity, 0);
      }
      const number = ++state.orderCounter;
      const order: OrderRecord = {
        id: state.orders.length + 1,
        number,
        checkoutId: checkout.id,
        stripeSessionId: input.sessionId,
        email: input.email,
        financialStatus: input.financialStatus,
        subtotalMinor: checkout.subtotalMinor,
        shippingMinor: input.shippingMinor,
        taxMinor: input.taxMinor,
        totalMinor: input.totalMinor,
        reviewFlags: [...new Set(flags)],
        processedAt: input.now,
        lines: clone(checkout.lines),
      };
      state.orders.push(order);
      state.events.add(input.eventId);
      checkout.stripeSessionId = input.sessionId;
      checkout.status = 'completed';
      checkout.updatedAt = input.now;
      const cart = state.carts.get(checkout.cartId);
      if (cart) cart.completedAt = input.now;
      return { kind: 'created', order: clone(order) };
    },

    async recordCheckoutStatus(input: RecordStatusInput) {
      if (state.events.has(input.eventId)) return 'duplicate_event';
      state.events.add(input.eventId);
      const c = state.checkouts.get(input.checkoutId);
      if (!c || !['created', 'session_created', 'awaiting_payment'].includes(c.status)) return 'ignored';
      c.status = input.status;
      c.updatedAt = input.now;
      return 'updated';
    },

    async getOrderBySessionId(sessionId) {
      const o = state.orders.find((x) => x.stripeSessionId === sessionId);
      return o ? clone(o) : null;
    },
    async countOrders() {
      return state.orders.length;
    },
    async close() {},
  };
}

