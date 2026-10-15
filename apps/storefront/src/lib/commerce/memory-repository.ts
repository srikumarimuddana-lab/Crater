import { quantitiesByVariant, snapshotMatchesCart } from './reservations';
import { catalogSeed } from './catalog-seed';
import type {
  CartRecord,
  FulfilmentRecord,
  MovementRecord,
  WebhookEventRecord,
  CatalogSeed,
  CheckoutRecord,
  CollectionRecord,
  CommerceRepository,
  CompleteCheckoutInput,
  CompleteCheckoutOutcome,
  OrderRecord,
  ProductRecord,
  RecordStatusInput,
  StockReservationRecord,
} from './records';
import type { ID } from './types';

export type MemoryState = {
  products: ProductRecord[];
  collections: CollectionRecord[];
  carts: Map<ID, CartRecord>;
  checkouts: Map<string, CheckoutRecord>;
  reservations: StockReservationRecord[];
  orders: OrderRecord[];
  events: Set<string>;
  orderCounter: number;
  /** Admin additions (migration 0004 equivalents). Mutated by the admin memory repository. */
  movements: MovementRecord[];
  fulfilments: Map<number, FulfilmentRecord>;
  webhookEvents: WebhookEventRecord[];
  /** Extension slots owned by other modules (e.g. the admin repository keeps its staff and audit state here). */
  ext: Map<string, unknown>;
};

const WEBHOOK_LOG_CAP = 500;

function freshState(seed: CatalogSeed): MemoryState {
  return {
    products: structuredClone(seed.products),
    collections: structuredClone(seed.collections),
    carts: new Map(),
    checkouts: new Map(),
    reservations: [],
    orders: [],
    events: new Set(),
    orderCounter: 1000,
    movements: [],
    fulfilments: new Map(),
    webhookEvents: [],
    ext: new Map(),
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
// Repository singletons survive development module reloads; their backing registry must too.
const registryKey = Symbol.for('crater.commerce.memory-state-registry');
const registryHost = globalThis as unknown as Record<symbol, WeakMap<object, MemoryState> | undefined>;
const STATE_OF = registryHost[registryKey] ??= new WeakMap<object, MemoryState>();

/** The backing state of a memory repository (admin memory repository only). Throws for any other repository. */
export function memoryStateOf(repo: CommerceRepository): MemoryState {
  const state = STATE_OF.get(repo);
  if (!state) throw new Error('not a memory commerce repository');
  return state;
}

export function createMemoryRepository(options: { seed?: CatalogSeed; shared?: boolean } = {}): CommerceRepository {
  const state = options.shared ? globalState() : freshState(options.seed ?? catalogSeed);
  state.reservations ??= []; // Hot reload of an existing development state.
  const clone = <T>(v: T): T => structuredClone(v);

  const findVariant = (id: ID) => {
    for (const p of state.products) {
      const v = p.variants.find((x) => x.id === id);
      if (v) return v;
    }
    return undefined;
  };

  const repo: CommerceRepository = {
    kind: 'memory',

    async listProducts(options) {
      return clone(options?.includeInactive ? state.products : state.products.filter((p) => p.status === 'ACTIVE'));
    },
    async listCollections() {
      const active = new Set(state.products.filter((p) => p.status === 'ACTIVE').map((p) => p.handle));
      return clone(state.collections).map((c) => ({ ...c, productHandles: c.productHandles.filter((h) => active.has(h)) }));
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
    async reserveCheckout(checkout, expectedCartUpdatedAt, now) {
      const cart = state.carts.get(checkout.cartId);
      if (!cart || !snapshotMatchesCart(checkout, cart, expectedCartUpdatedAt)) return { kind: 'cart_changed' };
      const reusable = [...state.checkouts.values()].find(row => row.cartId === checkout.cartId && row.fingerprint === checkout.fingerprint && ['created', 'session_created'].includes(row.status) && row.reservationExpiresAt && new Date(row.reservationExpiresAt) > now);
      if (reusable) return { kind: 'reused', checkout: clone(reusable) };
      if (!checkout.reservationExpiresAt || new Date(checkout.reservationExpiresAt) <= now) throw new Error('Reservation expiry is required.');
      const requested = quantitiesByVariant(checkout.lines);
      for (const [variantId, quantity] of requested) {
        const product = state.products.find(product => product.status === 'ACTIVE' && product.variants.some(variant => variant.id === variantId));
        const variant = product?.variants.find(variant => variant.id === variantId);
        if (!variant || checkout.lines.some(line => line.variantId === variantId && (line.originalUnitMinor ?? line.unitMinor) !== variant.priceMinor)) return { kind: 'cart_changed' };
        const reserved = state.reservations.filter(row => row.variantId === variantId && row.status === 'active' && new Date(row.expiresAt) > now).reduce((sum, row) => sum + row.quantity, 0);
        if (variant.quantity !== null && variant.quantity - reserved < quantity) return { kind: 'stock_unavailable' };
      }
      state.checkouts.set(checkout.id, clone(checkout));
      for (const [variantId, quantity] of requested) {
        if (findVariant(variantId)?.quantity !== null) state.reservations.push({ checkoutId: checkout.id, variantId, quantity, expiresAt: checkout.reservationExpiresAt, status: 'active' });
      }
      return { kind: 'reserved', checkout: clone(checkout) };
    },
    async reservedQuantities(now) {
      const quantities = new Map<ID, number>();
      for (const row of state.reservations) if (row.status === 'active' && new Date(row.expiresAt) > now) quantities.set(row.variantId, (quantities.get(row.variantId) ?? 0) + row.quantity);
      return quantities;
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
      const before = new Map<ID, { sku: string; quantity: number }>();
      const timely = !checkout.reservationExpiresAt || (new Date(checkout.reservationExpiresAt) > new Date(input.now) && !['expired', 'payment_failed'].includes(checkout.status));
      if (!timely) flags.push('RESERVATION_EXPIRED');
      for (const [variantId, requested] of quantitiesByVariant(checkout.lines)) {
        const variant = findVariant(variantId);
        if (!variant) { flags.push('INVENTORY_SHORT'); continue; }
        if (variant.quantity === null) continue;
        const otherHolds = state.reservations.filter(row => row.checkoutId !== checkout.id && row.variantId === variantId && row.status === 'active' && new Date(row.expiresAt) > new Date(input.now)).reduce((sum, row) => sum + row.quantity, 0);
        const available = Math.max(0, variant.quantity - otherHolds);
        const consumed = Math.min(requested, available);
        if (consumed < requested) flags.push('INVENTORY_SHORT');
        before.set(variant.id, { sku: variant.sku, quantity: variant.quantity });
        variant.quantity -= consumed;
      }
      for (const row of state.reservations) if (row.checkoutId === checkout.id) row.status = 'consumed';
      const number = ++state.orderCounter;
      const order: OrderRecord = {
        id: state.orders.length + 1,
        number,
        checkoutId: checkout.id,
        stripeSessionId: input.sessionId,
        email: input.email,
        financialStatus: input.financialStatus,
        subtotalMinor: checkout.subtotalMinor,
        discountMinor: checkout.discountMinor ?? 0,
        discountCode: checkout.discountCode ?? null,
        shippingMinor: input.shippingMinor,
        taxMinor: input.taxMinor,
        totalMinor: input.totalMinor,
        reviewFlags: [...new Set(flags)],
        processedAt: input.now,
        lines: clone(checkout.lines),
        taxLines: clone(input.taxLines),
        taxProvince: checkout.province ?? null,
        shippingProvince: input.shippingAddress?.province || null,
        fulfilmentStatus: 'UNFULFILLED',
        shippingAddress: input.shippingAddress ? clone(input.shippingAddress) : null,
        packingInstructions: null,
        internalNotes: null,
      };
      state.orders.push(order);
      // One ORDER_PAID movement per tracked variant (same step as the stock change, so they cannot drift apart).
      for (const [variantId, was] of before) {
        const after = findVariant(variantId)?.quantity ?? 0;
        if (after === was.quantity) continue;
        state.movements.push({
          id: state.movements.length + 1,
          at: input.now,
          variantId,
          sku: was.sku,
          delta: after - was.quantity,
          reason: 'ORDER_PAID',
          note: null,
          staffId: null,
          orderId: order.id,
          availableAfter: after,
        });
      }
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
      if (!c || (c.stripeSessionId && c.stripeSessionId !== input.sessionId) || !['created', 'session_created', 'awaiting_payment'].includes(c.status)) return 'ignored';
      c.stripeSessionId ??= input.sessionId;
      c.status = input.status;
      if (input.status === 'expired' || input.status === 'payment_failed') for (const row of state.reservations) if (row.checkoutId === c.id && row.status === 'active') row.status = 'released';
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

    async openCartCounts(notBefore) {
      const counts = new Map<ID, number>();
      for (const cart of state.carts.values()) {
        if (cart.completedAt || new Date(cart.updatedAt) < notBefore) continue;
        for (const variantId of new Set(cart.lines.map((l) => l.variantId))) counts.set(variantId, (counts.get(variantId) ?? 0) + 1);
      }
      return counts;
    },
    async recordWebhookEvent({ eventId, eventType, outcome, at }) {
      state.webhookEvents.push({ id: state.webhookEvents.length ? state.webhookEvents[state.webhookEvents.length - 1].id + 1 : 1, eventId, eventType, outcome, receivedAt: at });
      if (state.webhookEvents.length > WEBHOOK_LOG_CAP) state.webhookEvents.splice(0, state.webhookEvents.length - WEBHOOK_LOG_CAP);
    },
    async close() {},
  };
  STATE_OF.set(repo, state);
  return repo;
}

