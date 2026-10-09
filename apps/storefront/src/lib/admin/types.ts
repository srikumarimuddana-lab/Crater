/**
 * Crater admin contract (Slice 1: sign-in, staff, overview, orders, products,
 * inventory, event log). See docs/admin/plan.md.
 *
 * Vocabulary follows Shopify Admin concepts where it fits. Money uses the
 * storefront's `MoneyV2` (decimal strings); internal maths stays in minor units.
 *
 * Coordinator-owned shared file. Change it only through the coordinator.
 */

import type { DateTime, ID, MoneyV2 } from '@/lib/commerce/types';

// ---------------------------------------------------------------------------
// Staff, roles, sessions

export type StaffRole = 'OWNER' | 'ADMIN' | 'FULFILMENT' | 'BOOKKEEPER' | 'SUPPORT';

/** Deny by default: a role has a capability only if `permissions.ts` grants it. */
export type Capability =
  | 'overview:read'
  | 'orders:read'
  | 'orders:read_prices'
  | 'orders:fulfil'
  | 'orders:internal_notes'
  | 'products:read'
  | 'products:write'
  | 'products:publish'
  | 'inventory:read'
  | 'inventory:adjust'
  | 'events:read'
  | 'audit:read'
  | 'staff:read'
  | 'staff:manage';

export type StaffUser = {
  id: ID; // gid://crater/StaffUser/<n>
  email: string;
  name: string;
  role: StaffRole;
  status: 'ACTIVE' | 'DISABLED';
  mfaEnrolled: boolean;
  /** Supabase migration: maps to auth.users.id once that provider is enabled. */
  authSubject: string | null;
  createdAt: DateTime;
  lastSignInAt: DateTime | null;
};

export type AdminSession = {
  staff: StaffUser;
  capabilities: Capability[];
  /** True when a fresh second factor was verified within the step-up window. */
  steppedUp: boolean;
  expiresAt: DateTime;
};

export type SignInResult =
  | { ok: true; next: 'MFA_REQUIRED' | 'MFA_ENROL' }
  | { ok: false; code: 'INVALID_CREDENTIALS' | 'RATE_LIMITED' | 'DISABLED' };

export type SecondFactorResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_CODE' | 'RATE_LIMITED' | 'NO_PENDING_SIGN_IN' };

/**
 * Pluggable sign-in. `builtin` stores credentials in Postgres (scrypt + TOTP);
 * a Supabase Auth implementation can replace it later without touching screens.
 * Implementations read and write the session cookie themselves (server-only).
 */
export interface AdminAuthProvider {
  signIn(args: { email: string; password: string; ip: string }): Promise<SignInResult>;
  /** Completes a pending sign-in, or performs step-up for an existing session. */
  verifySecondFactor(args: { code: string; ip: string }): Promise<SecondFactorResult>;
  /** First sign-in: returns the otpauth URI and secret to show once, then verify a code. */
  beginMfaEnrolment(): Promise<{ otpauthUri: string; secret: string } | null>;
  confirmMfaEnrolment(args: { code: string }): Promise<SecondFactorResult>;
  getSession(): Promise<AdminSession | null>;
  signOut(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Audit and events

export type AuditEntry = {
  id: ID;
  at: DateTime;
  actor: { id: ID; email: string } | null; // null = system (webhook, script)
  action: string; // e.g. "order.fulfilled", "product.price_changed", "inventory.adjusted"
  target: { type: string; id: ID } | null;
  /** Field-level before/after values. Never contains PII or secrets. */
  changes: Record<string, { from: unknown; to: unknown }>;
};

export type WebhookEventSummary = {
  id: string; // provider event id
  type: string;
  receivedAt: DateTime;
  outcome: 'PROCESSED' | 'DUPLICATE' | 'REJECTED' | 'FAILED';
};

// ---------------------------------------------------------------------------
// Overview

export type OverviewPeriod = 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS';

export type OverviewMetrics = {
  period: OverviewPeriod;
  timezone: string; // IANA, e.g. America/Toronto
  grossSales: MoneyV2; // paid orders' subtotals by order date, before refunds; excludes tax and shipping
  netSales: MoneyV2; // gross sales minus refunds by refund date (may be negative)
  orders: number; // paid orders by order date
  averageOrderValue: MoneyV2 | null; // gross sales / orders; null when orders = 0 (shown "–")
  lowStockVariants: number; // active variants with available <= threshold
  webhookHealth: { lastEventAt: DateTime | null; failedLast24h: number };
  salesByDay: { date: string; orders: number; grossSales: MoneyV2 }[];
};

// ---------------------------------------------------------------------------
// Orders and fulfilment

export type FulfilmentStatus = 'UNFULFILLED' | 'FULFILLED';

export type PostalAddress = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

export type AdminOrderLine = {
  variantId: ID;
  title: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  /** Null when the viewer lacks `orders:read_prices` (e.g. Fulfilment). */
  unitPrice: MoneyV2 | null;
  total: MoneyV2 | null;
};

export type OrderTimelineEvent = {
  at: DateTime;
  kind: 'PLACED' | 'PAID' | 'FLAGGED' | 'FULFILLED' | 'NOTE';
  message: string;
  actor: string | null;
};

export type AdminOrder = {
  id: ID;
  name: string; // "#1001"
  processedAt: DateTime;
  financialStatus: 'PENDING' | 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'VOIDED';
  fulfilmentStatus: FulfilmentStatus;
  reviewFlags: string[];
  email: string | null; // hidden from roles without orders:read_prices? No: Fulfilment sees email for shipping only if address missing; UI decides via capabilities
  shippingAddress: PostalAddress | null;
  lines: AdminOrderLine[];
  /** Null when the viewer lacks `orders:read_prices`. */
  totals: { subtotal: MoneyV2; shipping: MoneyV2; tax: MoneyV2; total: MoneyV2 } | null;
  packingInstructions: string | null;
  /** Null when the viewer lacks `orders:internal_notes`. */
  internalNotes: string | null;
  fulfilment: { carrier: string; trackingNumber: string; fulfilledAt: DateTime; by: string } | null;
  timeline: OrderTimelineEvent[];
};

export type AdminOrderSummary = Pick<
  AdminOrder,
  'id' | 'name' | 'processedAt' | 'financialStatus' | 'fulfilmentStatus' | 'reviewFlags'
> & { itemCount: number; total: MoneyV2 | null };

export type OrdersQuery = {
  first?: number;
  after?: string | null;
  financialStatus?: AdminOrder['financialStatus'];
  fulfilmentStatus?: FulfilmentStatus;
  query?: string; // order name or email
};

// ---------------------------------------------------------------------------
// Products and inventory

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type AdminVariant = {
  id: ID;
  title: string;
  sku: string;
  price: MoneyV2;
  cost: MoneyV2 | null;
  available: number; // sellable now (storefront quantityAvailable)
  committed: number; // in paid, unfulfilled orders
  onHand: number; // available + committed
  lowStockThreshold: number;
  /** Open (not completed, not expired) carts that contain this variant. */
  openCartCount: number;
};

export type PublishCheck = {
  key: 'NOT_SAMPLE' | 'HAS_INGREDIENTS' | 'HAS_PRECAUTIONS' | 'HAS_DIRECTIONS' | 'IMAGES_HAVE_ALT' | 'HAS_ACTIVE_VARIANT';
  passed: boolean;
};

export type AdminProduct = {
  id: ID;
  handle: string;
  title: string;
  description: string;
  productType: string;
  status: ProductStatus;
  sample: boolean;
  details: { benefits: string[]; ingredients: string[]; howToUse: string; precautions: string };
  images: { url: string; altText: string }[];
  variants: AdminVariant[];
  publishChecks: PublishCheck[];
  updatedAt: DateTime; // optimistic concurrency token
};

export type ProductUpdateInput = {
  id: ID;
  expectedUpdatedAt: DateTime; // conflict if stale
  title?: string;
  description?: string;
  details?: Partial<AdminProduct['details']>;
  variants?: { id: ID; price?: string; cost?: string | null; lowStockThreshold?: number }[];
};

export type StockAdjustmentReason = 'RECEIVED' | 'COUNT_CORRECTION' | 'DAMAGED' | 'RETURN_RESTOCK' | 'OTHER';

export type InventoryMovement = {
  id: ID;
  at: DateTime;
  variantId: ID;
  sku: string;
  delta: number; // + adds to available, - removes
  reason: StockAdjustmentReason | 'ORDER_PAID';
  note: string | null;
  actor: string | null; // staff email or null for system
  availableAfter: number;
};

/** Service result shape for admin mutations: field errors like Storefront userErrors. */
export type AdminUserError = {
  code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'PUBLISH_BLOCKED' | 'STEP_UP_REQUIRED';
  field: string[] | null;
  message: string;
};

export type AdminMutationResult<T> = { data: T | null; userErrors: AdminUserError[] };
