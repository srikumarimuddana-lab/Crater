import type { Pool, PoolClient } from 'pg';
import { pgPoolOf, toOrderRecord, toProductRecord } from '@/lib/commerce/postgres-repository';
import type { CommerceRepository, MovementRecord, ProductRecord, WebhookEventRecord } from '@/lib/commerce/records';
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

/**
 * Postgres admin repository. Same rules as the commerce one: every statement is parameterised and unnamed,
 * no session state, only transaction-scoped row locks (safe behind a transaction pooler), schema-qualified
 * names. Mutations write their audit row in the same transaction as the change.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));
const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const json = (v: unknown): string => JSON.stringify(v);

const toStaff = (r: Row): StaffRecord => ({
  id: num(r.id),
  email: String(r.email),
  name: String(r.name),
  role: r.role as StaffRecord['role'],
  status: r.status as StaffRecord['status'],
  passwordHash: (r.password_hash as string | null) ?? null,
  totpSecretEnc: (r.totp_secret_enc as string | null) ?? null,
  mfaEnrolledAt: isoOrNull(r.mfa_enrolled_at),
  lastTotpStep: numOrNull(r.last_totp_step),
  authSubject: (r.auth_subject as string | null) ?? null,
  createdAt: iso(r.created_at),
  lastSignInAt: isoOrNull(r.last_sign_in_at),
});

const toSession = (r: Row): SessionRecord => ({
  id: num(r.id),
  staffId: num(r.staff_id),
  tokenHash: String(r.token_hash),
  createdAt: iso(r.created_at),
  lastSeenAt: iso(r.last_seen_at),
  absoluteExpiresAt: iso(r.absolute_expires_at),
  steppedUpAt: isoOrNull(r.stepped_up_at),
});

const toPending = (r: Row): PendingSignInRecord => ({
  tokenHash: String(r.token_hash),
  staffId: num(r.staff_id),
  kind: r.kind as PendingSignInRecord['kind'],
  enrolSecretEnc: (r.enrol_secret_enc as string | null) ?? null,
  attempts: num(r.attempts),
  createdAt: iso(r.created_at),
  expiresAt: iso(r.expires_at),
});

const toAttempt = (r: Row): AttemptRecord => ({
  kind: r.kind as AttemptRecord['kind'],
  keyHash: String(r.key_hash),
  failures: num(r.failures),
  lastFailureAt: isoOrNull(r.last_failure_at),
  lockedUntil: isoOrNull(r.locked_until),
});

const toAudit = (r: Row): AuditRecord => ({
  id: num(r.id),
  at: iso(r.at),
  actorId: numOrNull(r.actor_id),
  actorEmail: (r.actor_email as string | null) ?? null,
  action: String(r.action),
  targetType: (r.target_type as string | null) ?? null,
  targetId: (r.target_id as string | null) ?? null,
  changes: (r.changes as AuditRecord['changes']) ?? {},
  ipTrunc: (r.ip_trunc as string | null) ?? null,
});

const toMovement = (r: Row): MovementWithActor => ({
  id: num(r.id),
  at: iso(r.at),
  variantId: `gid://crater/ProductVariant/${r.variant_id}`,
  sku: String(r.sku),
  delta: num(r.delta),
  reason: r.reason as MovementRecord['reason'],
  note: (r.note as string | null) ?? null,
  staffId: numOrNull(r.staff_id),
  orderId: numOrNull(r.order_id),
  availableAfter: num(r.available_after),
  actorEmail: (r.actor_email as string | null) ?? null,
});

async function insertAudit(client: Pick<PoolClient, 'query'>, e: AuditInput): Promise<void> {
  await client.query(
    `insert into admin.audit_log (at, actor_id, actor_email, action, target_type, target_id, changes, ip_trunc)
     values (coalesce($1::timestamptz, now()), $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [e.at ?? null, e.actorId, e.actorEmail, e.action, e.targetType, e.targetId, json(e.changes), e.ipTrunc],
  );
}

export function createPostgresAdminRepository(commerce: CommerceRepository): AdminRepository {
  const pool: Pool = pgPoolOf(commerce);

  async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      try {
        await client.query('rollback');
      } catch {
        // connection already broken; the original error matters more
      }
      throw error;
    } finally {
      client.release();
    }
  }
  const q = async (text: string, params: unknown[] = []): Promise<Row[]> => (await pool.query(text, params)).rows as Row[];

  /** Loads orders (with lines and fulfilment) by id, preserving the given order. */
  async function loadOrders(client: Pick<Pool, 'query'>, orderRows: Row[]): Promise<OrderWithFulfilment[]> {
    if (!orderRows.length) return [];
    const ids = orderRows.map((o) => num(o.id));
    const [lines, fulfilments] = await Promise.all([
      client.query('select * from commerce.order_lines where order_id = any($1::int[]) order by order_id, position', [ids]),
      client.query(
        `select f.*, s.name as by_name from commerce.order_fulfilments f
           left join admin.staff_users s on s.id = f.staff_id where f.order_id = any($1::int[])`,
        [ids],
      ),
    ]);
    return orderRows.map((o) => {
      const f = (fulfilments.rows as Row[]).find((x) => num(x.order_id) === num(o.id));
      return {
        ...toOrderRecord(o, (lines.rows as Row[]).filter((l) => num(l.order_id) === num(o.id))),
        fulfilment: f
          ? {
              orderId: num(f.order_id),
              carrier: String(f.carrier),
              trackingNumber: String(f.tracking_number),
              fulfilledAt: iso(f.fulfilled_at),
              staffId: numOrNull(f.staff_id),
              byName: (f.by_name as string | null) ?? null,
            }
          : null,
      };
    });
  }

  async function loadProduct(client: PoolClient, id: number): Promise<ProductRecord | null> {
    const p = (await client.query('select * from commerce.products where id = $1 for update', [id])).rows as Row[];
    if (!p[0]) return null;
    const vs = (await client.query('select * from commerce.variants where product_id = $1 order by position for update', [id])).rows as Row[];
    return toProductRecord(p[0], vs);
  }

  async function writeProduct(client: PoolClient, before: ProductRecord, after: ProductRecord): Promise<void> {
    await client.query('update commerce.products set title = $2, description = $3, details = $4::jsonb, updated_at = $5 where id = $1', [
      gidTail(after.id, 'Product'),
      after.title,
      after.description,
      json(after.details),
      after.updatedAt,
    ]);
    for (const v of after.variants) {
      const old = before.variants.find((x) => x.id === v.id);
      if (old && old.priceMinor === v.priceMinor && old.costMinor === v.costMinor && old.lowStockThreshold === v.lowStockThreshold) continue;
      await client.query('update commerce.variants set price_minor = $2, cost_minor = $3, low_stock_threshold = $4 where id = $1', [
        gidTail(v.id, 'ProductVariant'),
        v.priceMinor,
        v.costMinor,
        v.lowStockThreshold,
      ]);
    }
  }

  return {
    kind: 'postgres',

    async findStaffByEmail(email) {
      const r = await q('select * from admin.staff_users where email = $1', [email]);
      return r[0] ? toStaff(r[0]) : null;
    },
    async getStaff(id) {
      const r = await q('select * from admin.staff_users where id = $1', [id]);
      return r[0] ? toStaff(r[0]) : null;
    },
    async listStaff() {
      return (await q('select * from admin.staff_users order by id')).map(toStaff);
    },
    async createStaff(input, options) {
      try {
        return await tx(async (c) => {
          if (options?.onlyIfNoOwner) {
            // Transaction-scoped lock: two concurrent create-owner runs cannot both pass the check.
            await c.query("select pg_advisory_xact_lock(hashtext('crater.admin.create_owner'))");
            const owners = await c.query("select 1 from admin.staff_users where role = 'OWNER' limit 1");
            if ((owners.rowCount ?? 0) > 0) return { kind: 'owner_exists' as const };
          }
          const r = (
            await c.query(
              `insert into admin.staff_users (email, name, role, password_hash, totp_secret_enc, mfa_enrolled_at, created_at)
               values ($1,$2,$3,$4,$5,$6,$7) returning *`,
              [input.email, input.name, input.role, input.passwordHash, input.totpSecretEnc ?? null, input.mfaEnrolledAt ?? null, input.createdAt],
            )
          ).rows as Row[];
          return { kind: 'created' as const, staff: toStaff(r[0]) };
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return { kind: 'exists' };
        throw error;
      }
    },
    async setMfa(staffId, totpSecretEnc, at) {
      await pool.query('update admin.staff_users set totp_secret_enc = $2, mfa_enrolled_at = $3 where id = $1', [staffId, totpSecretEnc, at]);
    },
    async consumeTotpStep(staffId, step) {
      // Atomic compare-and-set: of two concurrent submissions of one code, exactly one wins.
      const res = await pool.query(
        'update admin.staff_users set last_totp_step = $2 where id = $1 and (last_totp_step is null or last_totp_step < $2)',
        [staffId, step],
      );
      return (res.rowCount ?? 0) > 0;
    },
    async recordSignIn(staffId, at) {
      await pool.query('update admin.staff_users set last_sign_in_at = $2 where id = $1', [staffId, at]);
    },

    async createPending(row) {
      await pool.query(
        `insert into admin.pending_sign_ins (token_hash, staff_id, kind, enrol_secret_enc, attempts, created_at, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [row.tokenHash, row.staffId, row.kind, row.enrolSecretEnc, row.attempts, row.createdAt, row.expiresAt],
      );
    },
    async getPending(tokenHash) {
      const r = await q('select * from admin.pending_sign_ins where token_hash = $1', [tokenHash]);
      return r[0] ? toPending(r[0]) : null;
    },
    async updatePending(tokenHash, patch) {
      await pool.query(
        `update admin.pending_sign_ins
            set attempts = case when $2::boolean then $3::int else attempts end,
                enrol_secret_enc = case when $4::boolean then $5 else enrol_secret_enc end
          where token_hash = $1`,
        [tokenHash, patch.attempts !== undefined, patch.attempts ?? 0, patch.enrolSecretEnc !== undefined, patch.enrolSecretEnc ?? null],
      );
    },
    async deletePending(tokenHash) {
      await pool.query('delete from admin.pending_sign_ins where token_hash = $1', [tokenHash]);
    },
    async createSession(row) {
      await pool.query(
        `insert into admin.staff_sessions (staff_id, token_hash, created_at, last_seen_at, absolute_expires_at, stepped_up_at)
         values ($1,$2,$3,$4,$5,$6)`,
        [row.staffId, row.tokenHash, row.createdAt, row.lastSeenAt, row.absoluteExpiresAt, row.steppedUpAt],
      );
    },
    async getSession(tokenHash) {
      const r = await q('select * from admin.staff_sessions where token_hash = $1', [tokenHash]);
      return r[0] ? toSession(r[0]) : null;
    },
    async touchSession(tokenHash, at) {
      await pool.query('update admin.staff_sessions set last_seen_at = $2 where token_hash = $1', [tokenHash, at]);
    },
    async markSteppedUp(tokenHash, at) {
      await pool.query('update admin.staff_sessions set stepped_up_at = $2 where token_hash = $1', [tokenHash, at]);
    },
    async deleteSession(tokenHash) {
      await pool.query('delete from admin.staff_sessions where token_hash = $1', [tokenHash]);
    },
    async deleteSessionsForStaff(staffId) {
      await pool.query('delete from admin.staff_sessions where staff_id = $1', [staffId]);
    },
    async purgeExpired(now) {
      await pool.query('delete from admin.pending_sign_ins where expires_at <= $1', [now.toISOString()]);
      await pool.query('delete from admin.staff_sessions where absolute_expires_at <= $1', [now.toISOString()]);
    },

    async getAttempt(kind, keyHash) {
      const r = await q('select * from admin.login_attempts where kind = $1 and key_hash = $2', [kind, keyHash]);
      return r[0] ? toAttempt(r[0]) : null;
    },
    async mutateAttempt(kind, keyHash, fn) {
      await tx(async (c) => {
        await c.query('insert into admin.login_attempts (kind, key_hash) values ($1,$2) on conflict do nothing', [kind, keyHash]);
        const row = (await c.query('select * from admin.login_attempts where kind = $1 and key_hash = $2 for update', [kind, keyHash])).rows as Row[];
        const current = row[0] ? toAttempt(row[0]) : null;
        const next = fn(current && (current.failures > 0 || current.lockedUntil) ? current : null);
        if (!next) {
          await c.query('delete from admin.login_attempts where kind = $1 and key_hash = $2', [kind, keyHash]);
          return;
        }
        await c.query('update admin.login_attempts set failures = $3, last_failure_at = $4, locked_until = $5 where kind = $1 and key_hash = $2', [
          kind, keyHash, next.failures, next.lastFailureAt, next.lockedUntil,
        ]);
      });
    },

    async appendAudit(entry) {
      await insertAudit(pool, entry);
    },
    async listAudit({ first, beforeId, actionPrefixes }) {
      const rows = await q(
        `select * from admin.audit_log
          where ($1::bigint is null or id < $1)
            and ($2::text[] is null or exists (select 1 from unnest($2::text[]) p where starts_with(action, p)))
          order by id desc limit $3`,
        [beforeId, actionPrefixes ?? null, first + 1],
      );
      return rows.map(toAudit);
    },

    async listOrders(f) {
      const rows = await q(
        `select * from commerce.orders o
          where ($1::text is null or o.financial_status = $1)
            and ($2::text is null or o.fulfilment_status = $2)
            and ($3::int is null or o.order_number = $3)
            and ($4::text is null or strpos(lower(coalesce(o.email, '')), $4) > 0)
            and ($5::timestamptz is null or (o.processed_at, o.id) < ($5::timestamptz, $6::int))
          order by o.processed_at desc, o.id desc
          limit $7`,
        [f.financialStatus ?? null, f.fulfilmentStatus ?? null, f.orderNumber ?? null, f.emailContains ?? null, f.after?.processedAt ?? null, f.after?.id ?? 0, f.first + 1],
      );
      return loadOrders(pool, rows);
    },
    async getOrder(id) {
      return (await loadOrders(pool, await q('select * from commerce.orders where id = $1', [id])))[0] ?? null;
    },
    async markFulfilled({ orderId, carrier, trackingNumber, staffId, at, audit }): Promise<FulfilOutcome> {
      return tx(async (c): Promise<FulfilOutcome> => {
        const rows = (await c.query('select * from commerce.orders where id = $1 for update', [orderId])).rows as Row[];
        if (!rows[0]) return { kind: 'not_found' };
        const existing = (await c.query('select * from commerce.order_fulfilments where order_id = $1', [orderId])).rows as Row[];
        if (existing[0]) {
          const same = existing[0].carrier === carrier && existing[0].tracking_number === trackingNumber;
          return { kind: same ? 'replay' : 'conflict', order: (await loadOrders(c, rows))[0] };
        }
        const status = rows[0].financial_status as 'PAID' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'VOIDED';
        if (status !== 'PAID' && status !== 'PARTIALLY_REFUNDED') return { kind: 'not_fulfillable', financialStatus: status };
        await c.query('insert into commerce.order_fulfilments (order_id, carrier, tracking_number, fulfilled_at, staff_id) values ($1,$2,$3,$4,$5)', [
          orderId, carrier, trackingNumber, at, staffId,
        ]);
        await c.query("update commerce.orders set fulfilment_status = 'FULFILLED' where id = $1", [orderId]);
        await insertAudit(c, { ...audit, at });
        const fresh = (await c.query('select * from commerce.orders where id = $1', [orderId])).rows as Row[];
        return { kind: 'ok', order: (await loadOrders(c, fresh))[0] };
      });
    },
    async updateOrderNotes({ orderId, packingInstructions, internalNotes, audit }) {
      return tx(async (c) => {
        const rows = (await c.query('select * from commerce.orders where id = $1 for update', [orderId])).rows as Row[];
        if (!rows[0]) return null;
        const before = toOrderRecord(rows[0], []);
        await c.query(
          `update commerce.orders
              set packing_instructions = case when $2::boolean then $3 else packing_instructions end,
                  internal_notes = case when $4::boolean then $5 else internal_notes end
            where id = $1`,
          [orderId, packingInstructions !== undefined, packingInstructions ?? null, internalNotes !== undefined, internalNotes ?? null],
        );
        await insertAudit(c, audit(before));
        const fresh = (await c.query('select * from commerce.orders where id = $1', [orderId])).rows as Row[];
        return (await loadOrders(c, fresh))[0];
      });
    },
    async listOrderNoteEvents(orderId) {
      const rows = await q(
        `select a.at, s.name from admin.audit_log a left join admin.staff_users s on s.id = a.actor_id
          where a.action = 'order.notes_updated' and a.target_id = $1 order by a.id`,
        [`gid://crater/Order/${orderId}`],
      );
      return rows.map((r) => ({ at: iso(r.at), actorName: (r.name as string | null) ?? null }));
    },

    async committedByVariant() {
      const rows = await q(
        `select ol.variant_id, sum(ol.quantity)::int as n
           from commerce.order_lines ol join commerce.orders o on o.id = ol.order_id
          where o.fulfilment_status = 'UNFULFILLED' and o.financial_status in ('PAID', 'PARTIALLY_REFUNDED')
          group by ol.variant_id`,
      );
      return new Map<ID, number>(rows.map((r) => [String(r.variant_id), num(r.n)]));
    },
    async updateProduct({ productId, expectedUpdatedAt, patch, now, audit }) {
      return tx(async (c) => {
        const before = await loadProduct(c, productId);
        if (!before) return { kind: 'not_found' as const };
        if (!sameInstant(before.updatedAt, expectedUpdatedAt)) return { kind: 'conflict' as const, currentUpdatedAt: before.updatedAt };
        const result = applyProductPatch(before, patch, now);
        if ('invalidVariant' in result) return { kind: 'invalid_variant' as const, variantId: result.invalidVariant };
        const entries = audit(before, result.after);
        await writeProduct(c, before, result.after);
        for (const e of entries) await insertAudit(c, { ...e, at: now });
        return { kind: 'ok' as const, before, after: result.after };
      });
    },
    async setProductStatus({ productId, status, expectedUpdatedAt, now, gate, audit }): Promise<StatusOutcome> {
      return tx(async (c): Promise<StatusOutcome> => {
        const before = await loadProduct(c, productId);
        if (!before) return { kind: 'not_found' };
        if (expectedUpdatedAt !== null && !sameInstant(before.updatedAt, expectedUpdatedAt)) return { kind: 'conflict', currentUpdatedAt: before.updatedAt };
        if (before.status === status) return { kind: 'unchanged', before, after: before };
        if (status === 'ACTIVE') {
          const checks = gate(before);
          if (checks.some((x) => !x.passed)) return { kind: 'blocked', checks };
        }
        const updatedAt = new Date(Math.max(new Date(now).getTime(), new Date(before.updatedAt).getTime() + 1)).toISOString();
        const after: ProductRecord = { ...before, status, updatedAt };
        // status and archived_at move together (CHECK constraint products_status_archived_at_check).
        await c.query(
          "update commerce.products set status = $2, archived_at = case when $2 = 'ARCHIVED' then $3::timestamptz else null end, updated_at = $3 where id = $1",
          [productId, status, updatedAt],
        );
        await insertAudit(c, { ...audit(before, after), at: now });
        return { kind: 'ok', before, after };
      });
    },
    async adjustStock({ variantId, delta, reason, note, staffId, at, audit }): Promise<AdjustOutcome> {
      return tx(async (c): Promise<AdjustOutcome> => {
        // Row lock: concurrent adjustments and paid-order decrements queue here, so the floor holds.
        const rows = (await c.query('select id, sku, inventory_quantity from commerce.variants where id = $1 for update', [variantId])).rows as Row[];
        if (!rows[0]) return { kind: 'not_found' };
        if (rows[0].inventory_quantity === null) return { kind: 'untracked' };
        const have = num(rows[0].inventory_quantity);
        const next = have + delta;
        if (next < 0) return { kind: 'below_zero', available: have };
        await c.query('update commerce.variants set inventory_quantity = $2 where id = $1', [variantId, next]);
        const m = (
          await c.query(
            `insert into commerce.inventory_movements (at, variant_id, sku, delta, reason, note, staff_id, available_after)
             values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
            [at, variantId, rows[0].sku, delta, reason, note, staffId, next],
          )
        ).rows as Row[];
        const movement = toMovement({ ...m[0], actor_email: null });
        await insertAudit(c, { ...audit(movement), at });
        const email = (await c.query('select email from admin.staff_users where id = $1', [staffId])).rows as Row[];
        return { kind: 'ok', movement: { ...movement, actorEmail: (email[0]?.email as string | undefined) ?? null } };
      });
    },
    async listMovements({ first, beforeId, variantId }) {
      const rows = await q(
        `select m.*, s.email as actor_email from commerce.inventory_movements m
           left join admin.staff_users s on s.id = m.staff_id
          where ($1::bigint is null or m.id < $1) and ($2::int is null or m.variant_id = $2)
          order by m.id desc limit $3`,
        [beforeId, variantId ?? null, first + 1],
      );
      return rows.map(toMovement);
    },

    async paidOrderTotals(from, to) {
      const rows = await q(
        `select processed_at, subtotal_minor from commerce.orders
          where financial_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') and processed_at >= $1 and processed_at <= $2`,
        [from.toISOString(), to.toISOString()],
      );
      return rows.map((r) => ({ processedAt: iso(r.processed_at), subtotalMinor: num(r.subtotal_minor) }));
    },
    async listWebhookEvents(first) {
      const rows = await q('select * from commerce.webhook_events order by id desc limit $1', [first]);
      return rows.map((r): WebhookEventRecord => ({
        id: num(r.id),
        eventId: String(r.event_id),
        eventType: String(r.event_type),
        outcome: r.outcome as WebhookEventRecord['outcome'],
        receivedAt: iso(r.received_at),
      }));
    },
    async webhookHealth(since) {
      const [last, failed] = await Promise.all([
        q("select max(received_at) as at from commerce.webhook_events where outcome = 'PROCESSED'"),
        q("select count(*)::int as n from commerce.webhook_events where outcome in ('FAILED', 'REJECTED') and received_at >= $1", [since.toISOString()]),
      ]);
      return { lastProcessedAt: isoOrNull(last[0]?.at), failedSince: num(failed[0].n) };
    },
  };
}
