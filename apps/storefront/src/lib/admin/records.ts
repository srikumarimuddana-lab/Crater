import type {
  FulfilmentRecord,
  FulfilmentStatusRecord,
  MovementReason,
  MovementRecord,
  OrderRecord,
  OrderStatus,
  ProductRecord,
  ProductStatus,
  WebhookEventRecord,
} from '@/lib/commerce/records';
import type { ID } from '@/lib/commerce/types';
import type { AttemptKind, AttemptRecord } from './auth/rate-limit';
import type { PublishCheck, StaffRole } from './types';

/** Storage-level admin records shared by the memory and Postgres admin repositories. */

export type StaffRecord = {
  id: number;
  email: string;
  name: string;
  role: StaffRole;
  status: 'ACTIVE' | 'DISABLED';
  passwordHash: string | null;
  totpSecretEnc: string | null;
  mfaEnrolledAt: string | null;
  lastTotpStep: number | null;
  authSubject: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

export type SessionRecord = {
  id: number;
  staffId: number;
  /** SHA-256 hex of the cookie token. The token itself is never stored. */
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
  steppedUpAt: string | null;
};

export type PendingSignInRecord = {
  tokenHash: string;
  staffId: number;
  kind: 'MFA_REQUIRED' | 'MFA_ENROL';
  enrolSecretEnc: string | null;
  attempts: number;
  createdAt: string;
  expiresAt: string;
};

export type AuditRecord = {
  id: number;
  at: string;
  actorId: number | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  ipTrunc: string | null;
};
export type AuditInput = Omit<AuditRecord, 'id' | 'at'> & { at?: string };

export type NewStaff = {
  email: string;
  name: string;
  role: StaffRole;
  passwordHash: string | null;
  totpSecretEnc?: string | null;
  mfaEnrolledAt?: string | null;
  createdAt: string;
};

export type OrderWithFulfilment = OrderRecord & { fulfilment: (FulfilmentRecord & { byName: string | null }) | null };

export type OrderListQuery = {
  /** Page size. Implementations return up to first + 1 rows so the caller can compute hasNextPage. */
  first: number;
  after: { processedAt: string; id: number } | null;
  financialStatus?: OrderStatus;
  fulfilmentStatus?: FulfilmentStatusRecord;
  orderNumber?: number;
  emailContains?: string;
};

export type FulfilOutcome =
  | { kind: 'ok' | 'replay'; order: OrderWithFulfilment }
  | { kind: 'conflict'; order: OrderWithFulfilment }
  | { kind: 'not_found' }
  | { kind: 'not_fulfillable'; financialStatus: OrderStatus };

export type MovementWithActor = MovementRecord & { actorEmail: string | null };

export type AdjustOutcome =
  | { kind: 'ok'; movement: MovementWithActor }
  | { kind: 'not_found' }
  | { kind: 'untracked' }
  | { kind: 'below_zero'; available: number };

export type ProductPatch = {
  title?: string;
  description?: string;
  details?: Partial<ProductRecord['details']>;
  variants?: { id: ID; priceMinor?: number; costMinor?: number | null; lowStockThreshold?: number }[];
};

export type ProductUpdateOutcome =
  | { kind: 'ok'; before: ProductRecord; after: ProductRecord }
  | { kind: 'not_found' }
  | { kind: 'conflict'; currentUpdatedAt: string }
  | { kind: 'invalid_variant'; variantId: ID };

export type StatusOutcome =
  | { kind: 'ok' | 'unchanged'; before: ProductRecord; after: ProductRecord }
  | { kind: 'not_found' }
  | { kind: 'conflict'; currentUpdatedAt: string }
  | { kind: 'blocked'; checks: PublishCheck[] };

/**
 * Admin persistence. Mutating methods that change commerce state take the audit row (or a function that builds
 * it from the locked before/after state) and write it in the same transaction, so a change and its audit entry
 * are all-or-nothing. Implementations: memory (tests, fixtures) and Postgres.
 */
export interface AdminRepository {
  readonly kind: 'memory' | 'postgres';

  // Staff and credentials.
  findStaffByEmail(email: string): Promise<StaffRecord | null>;
  getStaff(id: number): Promise<StaffRecord | null>;
  listStaff(): Promise<StaffRecord[]>;
  createStaff(input: NewStaff, options?: { onlyIfNoOwner?: boolean }): Promise<{ kind: 'created'; staff: StaffRecord } | { kind: 'exists' } | { kind: 'owner_exists' }>;
  setMfa(staffId: number, totpSecretEnc: string, at: string): Promise<void>;
  /** Atomically records `step` as used. False when it is not greater than the last accepted step (replay). */
  consumeTotpStep(staffId: number, step: number): Promise<boolean>;
  recordSignIn(staffId: number, at: string): Promise<void>;

  // Pending sign-ins and sessions.
  createPending(row: PendingSignInRecord): Promise<void>;
  getPending(tokenHash: string): Promise<PendingSignInRecord | null>;
  updatePending(tokenHash: string, patch: { attempts?: number; enrolSecretEnc?: string | null }): Promise<void>;
  deletePending(tokenHash: string): Promise<void>;
  createSession(row: Omit<SessionRecord, 'id'>): Promise<void>;
  getSession(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(tokenHash: string, at: string): Promise<void>;
  markSteppedUp(tokenHash: string, at: string): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsForStaff(staffId: number): Promise<void>;
  /** Removes expired pending sign-ins and sessions (housekeeping). */
  purgeExpired(now: Date): Promise<void>;

  // Rate limiting.
  getAttempt(kind: AttemptKind, keyHash: string): Promise<AttemptRecord | null>;
  /** Read-modify-write under a lock. Returning null deletes the record. */
  mutateAttempt(kind: AttemptKind, keyHash: string, fn: (current: AttemptRecord | null) => AttemptRecord | null): Promise<void>;

  // Audit.
  appendAudit(entry: AuditInput): Promise<void>;
  /** Newest first. Returns up to `first + 1` rows. `actionPrefixes` limits to matching actions. */
  listAudit(q: { first: number; beforeId: number | null; actionPrefixes?: string[] }): Promise<AuditRecord[]>;

  // Orders.
  listOrders(q: OrderListQuery): Promise<OrderWithFulfilment[]>;
  getOrder(id: number): Promise<OrderWithFulfilment | null>;
  markFulfilled(input: { orderId: number; carrier: string; trackingNumber: string; staffId: number; at: string; audit: AuditInput }): Promise<FulfilOutcome>;
  updateOrderNotes(input: {
    orderId: number;
    packingInstructions?: string | null;
    internalNotes?: string | null;
    audit: (before: OrderRecord) => AuditInput;
  }): Promise<OrderWithFulfilment | null>;
  /** Order audit entries (notes updates) for the timeline. */
  listOrderNoteEvents(orderId: number): Promise<{ at: string; actorName: string | null }[]>;

  // Products and stock.
  /** Units on paid, unfulfilled order lines (financial PAID or PARTIALLY_REFUNDED), by variant id. */
  committedByVariant(): Promise<Map<ID, number>>;
  updateProduct(input: {
    productId: number;
    expectedUpdatedAt: string;
    patch: ProductPatch;
    now: string;
    audit: (before: ProductRecord, after: ProductRecord) => AuditInput[];
  }): Promise<ProductUpdateOutcome>;
  setProductStatus(input: {
    productId: number;
    status: ProductStatus;
    expectedUpdatedAt: string | null;
    now: string;
    /** Evaluated on the locked product; any failed check blocks activation. */
    gate: (product: ProductRecord) => PublishCheck[];
    audit: (before: ProductRecord, after: ProductRecord) => AuditInput;
  }): Promise<StatusOutcome>;
  adjustStock(input: {
    variantId: number;
    delta: number;
    reason: Exclude<MovementReason, 'ORDER_PAID'>;
    note: string | null;
    staffId: number;
    at: string;
    audit: (movement: MovementRecord) => AuditInput;
  }): Promise<AdjustOutcome>;
  listMovements(q: { first: number; beforeId: number | null; variantId?: number }): Promise<MovementWithActor[]>;

  // Overview and events.
  paidOrderTotals(from: Date, to: Date): Promise<{ processedAt: string; subtotalMinor: number }[]>;
  listWebhookEvents(first: number): Promise<WebhookEventRecord[]>;
  webhookHealth(since: Date): Promise<{ lastProcessedAt: string | null; failedSince: number }>;
}
