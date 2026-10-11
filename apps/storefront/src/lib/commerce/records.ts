import type { Attribute, ID, Image, ProductDetails, ProductOption, ProvinceCode, SelectedOption, TaxLine } from './types';

/**
 * Storage-level records. Prices are integer cents; carts hold no prices (they are
 * recomputed from the catalog on every read). These shapes are shared by the memory
 * and Postgres repositories and by the catalog seed.
 */

/** Authoritative visibility (migration 0004). The storefront lists and sells ACTIVE products only. */
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type VariantRecord = {
  id: ID;
  sku: string;
  title: string;
  priceMinor: number;
  compareAtMinor: number | null;
  /** Unit cost for staff reports; never shown to shoppers. */
  costMinor: number | null;
  /** Low-stock alert level for the admin; never shown to shoppers. */
  lowStockThreshold: number;
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
  status: ProductStatus;
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
  /** Ship-to province chosen in the bag (migration 0005); drives tax. */
  buyerProvince: ProvinceCode | null;
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
  /** Ship-to province the tax was computed for. Null only for snapshots made before migration 0005. */
  province: ProvinceCode | null;
  /** Tax Crater expected Stripe to charge (frozen with the lines); the webhook compares Stripe's amounts with it. */
  taxLines: TaxLine[];
  createdAt: string;
  updatedAt: string;
};

export type OrderStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'VOIDED';

/** Shipping address Stripe collected, snapshotted on the order. Free text from the buyer: treat as PII. */
export type PostalAddressRecord = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

export type FulfilmentStatusRecord = 'UNFULFILLED' | 'FULFILLED';

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
  /** Tax components Stripe actually charged (authoritative). */
  taxLines: TaxLine[];
  /** Province the shopper chose in the bag (the tax basis) and the province of the address Stripe collected. */
  taxProvince: ProvinceCode | null;
  shippingProvince: string | null;
  fulfilmentStatus: FulfilmentStatusRecord;
  shippingAddress: PostalAddressRecord | null;
  packingInstructions: string | null;
  internalNotes: string | null;
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
  /** Per-rate tax from Stripe (total_details.breakdown.taxes); empty when none was charged. */
  taxLines: TaxLine[];
  totalMinor: number;
  /** Address Stripe collected (API 2026-08-26.dahlia: collected_information.shipping_details); null if none. */
  shippingAddress: PostalAddressRecord | null;
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

export type WebhookOutcome = 'PROCESSED' | 'DUPLICATE' | 'REJECTED' | 'FAILED';

export type MovementReason =
  | 'RECEIVED'
  | 'COUNT_CORRECTION'
  | 'DAMAGED'
  | 'EXPIRED'
  | 'RETURN_RESTOCK'
  | 'SAMPLES_GIFTS'
  | 'LOST_STOLEN'
  | 'OTHER'
  | 'ORDER_PAID';

/** Append-only stock ledger row. `availableAfter` is the variant's sellable quantity after the change. */
export type MovementRecord = {
  id: number;
  at: string;
  variantId: ID;
  sku: string;
  delta: number;
  reason: MovementReason;
  note: string | null;
  staffId: number | null;
  orderId: number | null;
  availableAfter: number;
};

export type FulfilmentRecord = {
  orderId: number;
  carrier: string;
  trackingNumber: string;
  fulfilledAt: string;
  staffId: number | null;
};

export type WebhookEventRecord = { id: number; eventId: string; eventType: string; outcome: WebhookOutcome; receivedAt: string };

export interface CommerceRepository {
  readonly kind: 'memory' | 'postgres';

  // Catalog (read model + administrative price/stock change used by tests and future admin).
  /** ACTIVE products only (what the storefront may list and sell) unless `includeInactive` is set (admin). */
  listProducts(options?: { includeInactive?: boolean }): Promise<ProductRecord[]>;
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

  /** Open carts per variant id: not completed and updated at or after `notBefore` (the cart TTL cutoff). */
  openCartCounts(notBefore: Date): Promise<Map<ID, number>>;
  /** Best-effort outcome log for verified Stripe events (admin event log). Never throws into the webhook. */
  recordWebhookEvent(input: { eventId: string; eventType: string; outcome: WebhookOutcome; at: string }): Promise<void>;

  close(): Promise<void>;
}
