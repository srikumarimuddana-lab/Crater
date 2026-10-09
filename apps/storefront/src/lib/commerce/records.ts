import type { Attribute, ID, Image, ProductDetails, ProductOption, SelectedOption } from './types';

/**
 * Storage-level records. Prices are integer cents; carts hold no prices (they are
 * recomputed from the catalog on every read). These shapes are shared by the memory
 * and Postgres repositories and by the catalog seed.
 */

export type VariantRecord = {
  id: ID;
  sku: string;
  title: string;
  priceMinor: number;
  compareAtMinor: number | null;
  selectedOptions: SelectedOption[];
  image: Image | null;
  /** Null = inventory not tracked. */
  quantity: number | null;
};

export type ProductRecord = {
  id: ID;
  handle: string;
  title: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  options: ProductOption[];
  featuredImage: Image | null;
  images: Image[];
  details: ProductDetails;
  sample: boolean;
  createdAt: string;
  updatedAt: string;
  /** Position 0 is the default variant. */
  variants: VariantRecord[];
};

export type CollectionRecord = {
  id: ID;
  handle: string;
  title: string;
  description: string;
  productHandles: string[];
};

export type CatalogSeed = { products: ProductRecord[]; collections: CollectionRecord[] };

export type CartLineRecord = {
  /** Per-cart line number; the public id is gid://crater/CartLine/<n>. */
  n: number;
  variantId: ID;
  quantity: number;
  attributes: Attribute[];
  /** Unit price (minor units) the shopper was last shown; compared with the catalog price on every read. */
  priceAtAddMinor: number;
};

export type CartRecord = {
  id: ID;
  createdAt: string;
  /** Last mutation; carts expire 14 days after it. */
  updatedAt: string;
  completedAt: string | null;
  note: string | null;
  buyerEmail: string | null;
  buyerCountry: string | null;
  attributes: Attribute[];
  lineSeq: number;
  lines: CartLineRecord[];
};

export type CheckoutStatus = 'created' | 'session_created' | 'awaiting_payment' | 'completed' | 'expired' | 'payment_failed';

export type CheckoutLineSnapshot = {
  variantId: ID;
  title: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  unitMinor: number;
};

export type CheckoutRecord = {
  id: string;
  cartId: ID;
  /** One-way digest of the cart id; this (not the bearer id) is what Stripe metadata carries. */
  cartRef: string;
  status: CheckoutStatus;
  stripeSessionId: string | null;
  fingerprint: string;
  subtotalMinor: number;
  buyerEmail: string | null;
  lines: CheckoutLineSnapshot[];
  createdAt: string;
  updatedAt: string;
};

export type OrderStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'VOIDED';

export type OrderRecord = {
  id: number;
  number: number;
  checkoutId: string;
  stripeSessionId: string;
  email: string | null;
  financialStatus: OrderStatus;
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** Non-empty means a human must review (e.g. AMOUNT_MISMATCH, INVENTORY_SHORT). */
  reviewFlags: string[];
  processedAt: string;
  lines: CheckoutLineSnapshot[];
};

export type CompleteCheckoutInput = {
  eventId: string;
  eventType: string;
  checkoutId: string;
  sessionId: string;
  email: string | null;
  financialStatus: OrderStatus;
  flags: string[];
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  now: string;
};

export type CompleteCheckoutOutcome =
  | { kind: 'created'; order: OrderRecord }
  | { kind: 'duplicate_event' }
  | { kind: 'duplicate_session'; order: OrderRecord }
  | { kind: 'unknown_checkout' }
  | { kind: 'session_mismatch' };

export type RecordStatusInput = {
  eventId: string;
  eventType: string;
  checkoutId: string;
  status: Extract<CheckoutStatus, 'awaiting_payment' | 'expired' | 'payment_failed'>;
  now: string;
};

export interface CommerceRepository {
  readonly kind: 'memory' | 'postgres';

  // Catalog (read model + administrative price/stock change used by tests and future admin).
  listProducts(): Promise<ProductRecord[]>;
  listCollections(): Promise<CollectionRecord[]>;
  updateVariant(variantId: ID, patch: { priceMinor?: number; quantity?: number | null }): Promise<boolean>;

  // Carts. updateCart runs `fn` under an exclusive lock on the cart (row lock / single-threaded).
  createCart(cart: CartRecord): Promise<void>;
  getCart(id: ID): Promise<CartRecord | null>;
  updateCart<T>(id: ID, fn: (cart: CartRecord) => { cart: CartRecord | null; value: T }): Promise<{ value: T } | null>;
  deleteExpiredCarts(cutoff: Date): Promise<number>;

  // Checkouts and orders.
  findReusableCheckout(cartId: ID, fingerprint: string, notBefore: Date): Promise<CheckoutRecord | null>;
  createCheckout(checkout: CheckoutRecord): Promise<void>;
  getCheckout(id: string): Promise<CheckoutRecord | null>;
  getCheckoutBySessionId(sessionId: string): Promise<CheckoutRecord | null>;
  attachSession(checkoutId: string, sessionId: string, now: string): Promise<boolean>;
  /** One transaction: dedupe event+session, create order, decrement stock, complete checkout and cart. */
  completeCheckout(input: CompleteCheckoutInput): Promise<CompleteCheckoutOutcome>;
  recordCheckoutStatus(input: RecordStatusInput): Promise<'updated' | 'duplicate_event' | 'ignored'>;
  getOrderBySessionId(sessionId: string): Promise<OrderRecord | null>;
  countOrders(): Promise<number>;

  close(): Promise<void>;
}
