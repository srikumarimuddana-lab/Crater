import { memoryStateOf, type MemoryState } from '@/lib/commerce/memory-repository';
import type { CommerceRepository, MovementRecord, OrderRecord, ProductRecord } from '@/lib/commerce/records';
import type { ID } from '@/lib/commerce/types';
import { gidTail } from './ids';
import { applyProductPatch, sameInstant } from './product-logic';
import type { AttemptRecord } from './auth/rate-limit';
import type {
  AdjustOutcome,
  AdminRepository,
  AuditInput,
  AuditRecord,
  FulfilOutcome,
  MovementWithActor,
  OrderWithFulfilment,
  PendingSignInRecord,
  SessionRecord,
  StaffRecord,
  StatusOutcome,
} from './records';

type AdminMemory = {
  staff: StaffRecord[];
  sessions: Map<string, SessionRecord>;
  pending: Map<string, PendingSignInRecord>;
  attempts: Map<string, AttemptRecord>;
  audit: AuditRecord[];
  seq: { staff: number; session: number; audit: number };
};

const clone = <T>(v: T): T => structuredClone(v);

function adminState(state: MemoryState): AdminMemory {
  let s = state.ext.get('admin') as AdminMemory | undefined;
  if (!s) {
    s = { staff: [], sessions: new Map(), pending: new Map(), attempts: new Map(), audit: [], seq: { staff: 0, session: 0, audit: 0 } };
    state.ext.set('admin', s);
  }
  return s;
}

/**
 * In-memory admin repository over the same state as the in-memory commerce repository. Every method body is
 * synchronous after its first await point, so each is atomic on the single JS thread (the equivalent of the
 * Postgres transactions).
 */
export function createMemoryAdminRepository(commerce: CommerceRepository): AdminRepository {
  const state = memoryStateOf(commerce);
  const a = adminState(state);

  const staffName = (id: number | null) => (id === null ? null : (a.staff.find((s) => s.id === id)?.name ?? null));
  const staffEmail = (id: number | null) => (id === null ? null : (a.staff.find((s) => s.id === id)?.email ?? null));
  const withFulfilment = (o: OrderRecord): OrderWithFulfilment => {
    const f = state.fulfilments.get(o.id);
    return clone({ ...o, fulfilment: f ? { ...f, byName: staffName(f.staffId) } : null });
  };
  const findOrder = (id: number) => state.orders.find((o) => o.id === id);
  const findProduct = (id: number) => state.products.find((p) => gidTail(p.id, 'Product') === id);
  const push = (entry: AuditInput) => {
    const { at, ...rest } = entry;
    a.audit.push({ id: ++a.seq.audit, at: at ?? new Date().toISOString(), ...clone(rest) });
  };
  const withActor = (m: MovementRecord): MovementWithActor => ({ ...clone(m), actorEmail: staffEmail(m.staffId) });

  return {
    kind: 'memory',

    async findStaffByEmail(email) {
      const s = a.staff.find((x) => x.email === email);
      return s ? clone(s) : null;
    },
    async getStaff(id) {
      const s = a.staff.find((x) => x.id === id);
      return s ? clone(s) : null;
    },
    async listStaff() {
      return clone(a.staff);
    },
    async createStaff(input, options) {
      if (options?.onlyIfNoOwner && a.staff.some((s) => s.role === 'OWNER')) return { kind: 'owner_exists' };
      if (a.staff.some((s) => s.email === input.email)) return { kind: 'exists' };
      const staff: StaffRecord = {
        id: ++a.seq.staff,
        email: input.email,
        name: input.name,
        role: input.role,
        status: 'ACTIVE',
        passwordHash: input.passwordHash,
        totpSecretEnc: input.totpSecretEnc ?? null,
        mfaEnrolledAt: input.mfaEnrolledAt ?? null,
        lastTotpStep: null,
        authSubject: null,
        createdAt: input.createdAt,
        lastSignInAt: null,
      };
      a.staff.push(staff);
      return { kind: 'created', staff: clone(staff) };
    },
    async setMfa(staffId, totpSecretEnc, at) {
      const s = a.staff.find((x) => x.id === staffId);
      if (s) {
        s.totpSecretEnc = totpSecretEnc;
        s.mfaEnrolledAt = at;
      }
    },
    async consumeTotpStep(staffId, step) {
      const s = a.staff.find((x) => x.id === staffId);
      if (!s || (s.lastTotpStep !== null && s.lastTotpStep >= step)) return false;
      s.lastTotpStep = step;
      return true;
    },
    async recordSignIn(staffId, at) {
      const s = a.staff.find((x) => x.id === staffId);
      if (s) s.lastSignInAt = at;
    },

    async createPending(row) {
      a.pending.set(row.tokenHash, clone(row));
    },
    async getPending(tokenHash) {
      const p = a.pending.get(tokenHash);
      return p ? clone(p) : null;
    },
    async updatePending(tokenHash, patch) {
      const p = a.pending.get(tokenHash);
      if (!p) return;
      if (patch.attempts !== undefined) p.attempts = patch.attempts;
      if (patch.enrolSecretEnc !== undefined) p.enrolSecretEnc = patch.enrolSecretEnc;
    },
    async deletePending(tokenHash) {
      a.pending.delete(tokenHash);
    },
    async createSession(row) {
      a.sessions.set(row.tokenHash, { id: ++a.seq.session, ...clone(row) });
    },
    async getSession(tokenHash) {
      const s = a.sessions.get(tokenHash);
      return s ? clone(s) : null;
    },
    async touchSession(tokenHash, at) {
      const s = a.sessions.get(tokenHash);
      if (s) s.lastSeenAt = at;
    },
    async markSteppedUp(tokenHash, at) {
      const s = a.sessions.get(tokenHash);
      if (s) s.steppedUpAt = at;
    },
    async deleteSession(tokenHash) {
      a.sessions.delete(tokenHash);
    },
    async deleteSessionsForStaff(staffId) {
      for (const [k, s] of a.sessions) if (s.staffId === staffId) a.sessions.delete(k);
    },
    async purgeExpired(now) {
      for (const [k, p] of a.pending) if (new Date(p.expiresAt) <= now) a.pending.delete(k);
      for (const [k, s] of a.sessions) if (new Date(s.absoluteExpiresAt) <= now) a.sessions.delete(k);
    },

    async getAttempt(kind, keyHash) {
      const r = a.attempts.get(`${kind}:${keyHash}`);
      return r ? clone(r) : null;
    },
    async mutateAttempt(kind, keyHash, fn) {
      const key = `${kind}:${keyHash}`;
      const next = fn(a.attempts.has(key) ? clone(a.attempts.get(key) as AttemptRecord) : null);
      if (next) a.attempts.set(key, clone(next));
      else a.attempts.delete(key);
    },

    async appendAudit(entry) {
      push(entry);
    },
    async listAudit({ first, beforeId, actionPrefixes }) {
      return clone(
        [...a.audit]
          .reverse()
          .filter((e) => (beforeId === null || e.id < beforeId) && (!actionPrefixes || actionPrefixes.some((p) => e.action.startsWith(p))))
          .slice(0, first + 1),
      );
    },

    async listOrders(q) {
      const rows = [...state.orders]
        .sort((x, y) => (x.processedAt === y.processedAt ? y.id - x.id : x.processedAt < y.processedAt ? 1 : -1))
        .filter((o) => {
          if (q.after && !(o.processedAt < q.after.processedAt || (o.processedAt === q.after.processedAt && o.id < q.after.id))) return false;
          if (q.financialStatus && o.financialStatus !== q.financialStatus) return false;
          if (q.fulfilmentStatus && o.fulfilmentStatus !== q.fulfilmentStatus) return false;
          if (q.orderNumber !== undefined && o.number !== q.orderNumber) return false;
          if (q.emailContains !== undefined && !(o.email ?? '').toLowerCase().includes(q.emailContains)) return false;
          return true;
        });
      return rows.slice(0, q.first + 1).map(withFulfilment);
    },
    async getOrder(id) {
      const o = findOrder(id);
      return o ? withFulfilment(o) : null;
    },
    async markFulfilled({ orderId, carrier, trackingNumber, staffId, at, audit }): Promise<FulfilOutcome> {
      const o = findOrder(orderId);
      if (!o) return { kind: 'not_found' };
      const existing = state.fulfilments.get(orderId);
      if (existing) {
        const same = existing.carrier === carrier && existing.trackingNumber === trackingNumber;
        return { kind: same ? 'replay' : 'conflict', order: withFulfilment(o) };
      }
      if (o.financialStatus !== 'PAID' && o.financialStatus !== 'PARTIALLY_REFUNDED') return { kind: 'not_fulfillable', financialStatus: o.financialStatus };
      state.fulfilments.set(orderId, { orderId, carrier, trackingNumber, fulfilledAt: at, staffId });
      o.fulfilmentStatus = 'FULFILLED';
      push({ ...audit, at });
      return { kind: 'ok', order: withFulfilment(o) };
    },
    async updateOrderNotes({ orderId, packingInstructions, internalNotes, audit }) {
      const o = findOrder(orderId);
      if (!o) return null;
      const entry = audit(clone(o));
      if (packingInstructions !== undefined) o.packingInstructions = packingInstructions;
      if (internalNotes !== undefined) o.internalNotes = internalNotes;
      push(entry);
      return withFulfilment(o);
    },
    async listOrderNoteEvents(orderId) {
      return a.audit
        .filter((e) => e.action === 'order.notes_updated' && e.targetId === `gid://crater/Order/${orderId}`)
        .map((e) => ({ at: e.at, actorName: staffName(e.actorId) }));
    },

    async committedByVariant() {
      const out = new Map<ID, number>();
      for (const o of state.orders) {
        if (o.fulfilmentStatus !== 'UNFULFILLED' || (o.financialStatus !== 'PAID' && o.financialStatus !== 'PARTIALLY_REFUNDED')) continue;
        for (const l of o.lines) out.set(l.variantId, (out.get(l.variantId) ?? 0) + l.quantity);
      }
      return out;
    },
    async updateProduct({ productId, expectedUpdatedAt, patch, now, audit }) {
      const current = findProduct(productId);
      if (!current) return { kind: 'not_found' };
      if (!sameInstant(current.updatedAt, expectedUpdatedAt)) return { kind: 'conflict', currentUpdatedAt: current.updatedAt };
      const result = applyProductPatch(clone(current), patch, now);
      if ('invalidVariant' in result) return { kind: 'invalid_variant', variantId: result.invalidVariant };
      const before = clone(current);
      const entries = audit(before, clone(result.after));
      Object.assign(current, result.after);
      for (const e of entries) push({ ...e, at: now });
      return { kind: 'ok', before, after: clone(current) };
    },
    async setProductStatus({ productId, status, expectedUpdatedAt, now, gate, audit }): Promise<StatusOutcome> {
      const current = findProduct(productId);
      if (!current) return { kind: 'not_found' };
      if (expectedUpdatedAt !== null && !sameInstant(current.updatedAt, expectedUpdatedAt)) return { kind: 'conflict', currentUpdatedAt: current.updatedAt };
      const before = clone(current);
      if (current.status === status) return { kind: 'unchanged', before, after: clone(current) };
      if (status === 'ACTIVE') {
        const checks = gate(before);
        if (checks.some((c) => !c.passed)) return { kind: 'blocked', checks };
      }
      const after: ProductRecord = { ...clone(current), status, updatedAt: new Date(Math.max(new Date(now).getTime(), new Date(current.updatedAt).getTime() + 1)).toISOString() };
      push({ ...audit(before, after), at: now });
      Object.assign(current, after);
      return { kind: 'ok', before, after: clone(current) };
    },
    async adjustStock({ variantId, delta, reason, note, staffId, at, audit }): Promise<AdjustOutcome> {
      const gidv = `gid://crater/ProductVariant/${variantId}`;
      let variant;
      for (const p of state.products) {
        variant = p.variants.find((v) => v.id === gidv);
        if (variant) break;
      }
      if (!variant) return { kind: 'not_found' };
      if (variant.quantity === null) return { kind: 'untracked' };
      const next = variant.quantity + delta;
      if (next < 0) return { kind: 'below_zero', available: variant.quantity };
      variant.quantity = next;
      const movement: MovementRecord = {
        id: (state.movements.at(-1)?.id ?? 0) + 1,
        at,
        variantId: gidv,
        sku: variant.sku,
        delta,
        reason,
        note,
        staffId,
        orderId: null,
        availableAfter: next,
      };
      state.movements.push(movement);
      push({ ...audit(clone(movement)), at });
      return { kind: 'ok', movement: withActor(movement) };
    },
    async listMovements({ first, beforeId, variantId }) {
      const gidv = variantId === undefined ? null : `gid://crater/ProductVariant/${variantId}`;
      return [...state.movements]
        .reverse()
        .filter((m) => (beforeId === null || m.id < beforeId) && (gidv === null || m.variantId === gidv))
        .slice(0, first + 1)
        .map(withActor);
    },

    async paidOrderTotals(from, to) {
      return state.orders
        .filter((o) => ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(o.financialStatus) && new Date(o.processedAt) >= from && new Date(o.processedAt) <= to)
        .map((o) => ({ processedAt: o.processedAt, subtotalMinor: o.subtotalMinor }));
    },
    async listWebhookEvents(first) {
      return clone([...state.webhookEvents].reverse().slice(0, first));
    },
    async webhookHealth(since) {
      const last = [...state.webhookEvents].reverse().find((e) => e.outcome === 'PROCESSED');
      return {
        lastProcessedAt: last?.receivedAt ?? null,
        failedSince: state.webhookEvents.filter((e) => (e.outcome === 'FAILED' || e.outcome === 'REJECTED') && new Date(e.receivedAt) >= since).length,
      };
    },
  };
}
