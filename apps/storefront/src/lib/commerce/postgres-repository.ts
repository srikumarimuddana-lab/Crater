import type { Pool, PoolClient, PoolConfig } from 'pg';
import { numericId } from './ids';
import type {
  CartRecord,
  CheckoutRecord,
  PostalAddressRecord,
  CollectionRecord,
  CommerceRepository,
  CompleteCheckoutInput,
  CompleteCheckoutOutcome,
  OrderRecord,
  ProductRecord,
  RecordStatusInput,
  VariantRecord,
} from './records';

/**
 * Postgres repository, written to run through a transaction-mode pooler (Supabase
 * port 6543): every statement is parameterized and unnamed (no server-side prepared
 * statements), there is no session state (no SET, advisory session locks, LISTEN,
 * temp tables), and every lock is a transaction-scoped row lock (SELECT ... FOR UPDATE).
 * All tables are schema-qualified with `commerce.` rather than relying on search_path.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));
const num = (v: unknown): number => Number(v);
const json = (v: unknown): string => JSON.stringify(v);

const gidOf = (type: 'Product' | 'ProductVariant' | 'Collection', n: unknown) => `gid://crater/${type}/${n}`;

/** Connection settings from the environment. TLS verification is never turned off. */
export function poolConfigFromEnv(env: Record<string, string | undefined> = process.env): PoolConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error('COMMERCE_DB=postgres requires DATABASE_URL');
  const requested = Number(env.DATABASE_POOL_MAX ?? 3);
  const max = Number.isInteger(requested) && requested >= 1 && requested <= 20 ? requested : 3;
  const config: PoolConfig = { connectionString, max, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 };
  // An explicit sslmode in DATABASE_URL takes precedence (pg applies the URL last).
  if (env.DATABASE_SSL === 'require') config.ssl = { rejectUnauthorized: true };
  return config;
}

/** Maps a products row and its variants rows to the storage record (shared with the admin repository). */
export function toProductRecord(p: Row, variants: Row[]): ProductRecord {
  return {
    id: gidOf('Product', p.id),
    handle: String(p.handle),
    title: String(p.title),
    description: String(p.description),
    vendor: String(p.vendor),
    productType: String(p.product_type),
    tags: (p.tags as string[]) ?? [],
    options: p.options as ProductRecord['options'],
    featuredImage: (p.featured_image as ProductRecord['featuredImage']) ?? null,
    images: p.images as ProductRecord['images'],
    details: p.details as ProductRecord['details'],
    sample: Boolean(p.sample),
    status: p.status as ProductRecord['status'],
    createdAt: iso(p.created_at),
    updatedAt: iso(p.updated_at),
    variants: variants.map((v): VariantRecord => ({
      id: gidOf('ProductVariant', v.id),
      sku: String(v.sku),
      title: String(v.title),
      priceMinor: num(v.price_minor),
      compareAtMinor: v.compare_at_minor === null ? null : num(v.compare_at_minor),
      costMinor: v.cost_minor === null ? null : num(v.cost_minor),
      lowStockThreshold: num(v.low_stock_threshold),
      selectedOptions: v.selected_options as VariantRecord['selectedOptions'],
      image: (v.image as VariantRecord['image']) ?? null,
      quantity: v.inventory_quantity === null ? null : num(v.inventory_quantity),
    })),
  };
}

/** Maps an orders row and its order_lines rows to the storage record (shared with the admin repository). */
export const toOrderRecord = (o: Row, lines: Row[]): OrderRecord => ({
  id: num(o.id),
  number: num(o.order_number),
  checkoutId: String(o.checkout_id),
  stripeSessionId: String(o.stripe_session_id),
  email: (o.email as string | null) ?? null,
  financialStatus: o.financial_status as OrderRecord['financialStatus'],
  subtotalMinor: num(o.subtotal_minor),
  shippingMinor: num(o.shipping_minor),
  taxMinor: num(o.tax_minor),
  totalMinor: num(o.total_minor),
  reviewFlags: (o.review_flags as string[]) ?? [],
  taxLines: (o.tax_lines as OrderRecord['taxLines'] | null) ?? [],
  taxProvince: (o.tax_province as OrderRecord['taxProvince'] | null) ?? null,
  shippingProvince: (o.shipping_province as string | null) ?? null,
  processedAt: iso(o.processed_at),
  fulfilmentStatus: o.fulfilment_status as OrderRecord['fulfilmentStatus'],
  shippingAddress: (o.shipping_address as PostalAddressRecord | null) ?? null,
  packingInstructions: (o.packing_instructions as string | null) ?? null,
  internalNotes: (o.internal_notes as string | null) ?? null,
  lines: lines.map((l) => ({
    variantId: String(l.variant_id),
    title: String(l.title),
    variantTitle: String(l.variant_title),
    sku: String(l.sku),
    quantity: num(l.quantity),
    unitMinor: num(l.unit_minor),
  })),
});

const POOL_OF = new WeakMap<object, Pool>();

/** The pool behind a Postgres commerce repository (admin Postgres repository only). */
export function pgPoolOf(repo: CommerceRepository): Pool {
  const pool = POOL_OF.get(repo);
  if (!pool) throw new Error('not a postgres commerce repository');
  return pool;
}

export function createPostgresRepository(pool: Pool): CommerceRepository {
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

  const toCart = (c: Row, lines: Row[]): CartRecord => ({
    id: String(c.id),
    createdAt: iso(c.created_at),
    updatedAt: iso(c.updated_at),
    completedAt: isoOrNull(c.completed_at),
    note: (c.note as string | null) ?? null,
    buyerEmail: (c.buyer_email as string | null) ?? null,
    buyerCountry: c.buyer_country ? String(c.buyer_country).trim() : null,
    buyerProvince: (c.buyer_province as CartRecord['buyerProvince'] | null) ?? null,
    attributes: (c.attributes as CartRecord['attributes']) ?? [],
    lineSeq: num(c.line_seq),
    lines: lines.map((l) => ({
      n: num(l.line_number),
      variantId: gidOf('ProductVariant', l.variant_id),
      quantity: num(l.quantity),
      attributes: (l.attributes as CartRecord['attributes']) ?? [],
      priceAtAddMinor: num(l.price_at_add_minor),
    })),
  });

  const toCheckout = (r: Row): CheckoutRecord => ({
    id: String(r.id),
    cartId: String(r.cart_id),
    cartRef: String(r.cart_ref),
    status: r.status as CheckoutRecord['status'],
    stripeSessionId: (r.stripe_session_id as string | null) ?? null,
    fingerprint: String(r.fingerprint),
    subtotalMinor: num(r.subtotal_minor),
    buyerEmail: (r.buyer_email as string | null) ?? null,
    lines: r.lines as CheckoutRecord['lines'],
    province: (r.tax_province as CheckoutRecord['province'] | null) ?? null,
    taxLines: (r.tax_lines as CheckoutRecord['taxLines'] | null) ?? [],
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  });

  async function loadOrder(client: Pick<Pool, 'query'>, where: string, param: unknown): Promise<OrderRecord | null> {
    const orders = (await client.query(`select * from commerce.orders where ${where}`, [param])).rows as Row[];
    if (!orders[0]) return null;
    const lines = (await client.query('select * from commerce.order_lines where order_id = $1 order by position', [orders[0].id])).rows as Row[];
    return toOrderRecord(orders[0], lines);
  }

  async function writeLines(client: PoolClient, cart: CartRecord) {
    await client.query('delete from commerce.cart_lines where cart_id = $1', [cart.id]);
    for (const [position, l] of cart.lines.entries()) {
      await client.query(
        'insert into commerce.cart_lines (cart_id, line_number, variant_id, quantity, attributes, position, price_at_add_minor) values ($1,$2,$3,$4,$5::jsonb,$6,$7)',
        [cart.id, l.n, numericId(l.variantId, 'ProductVariant'), l.quantity, json(l.attributes), position, l.priceAtAddMinor],
      );
    }
  }

  const repo: CommerceRepository = {
    kind: 'postgres',

    async listProducts(options) {
      // products.status is the single source of truth for visibility (migration 0004).
      const all = Boolean(options?.includeInactive);
      const [products, variants] = await Promise.all([
        q("select * from commerce.products where ($1::boolean or status = 'ACTIVE') order by id", [all]),
        q(`select v.* from commerce.variants v join commerce.products p on p.id = v.product_id
           where ($1::boolean or p.status = 'ACTIVE') order by v.product_id, v.position`, [all]),
      ]);
      return products.map((p) => toProductRecord(p, variants.filter((v) => v.product_id === p.id)));
    },

    async listCollections() {
      const [cols, members] = await Promise.all([
        q('select * from commerce.collections order by id'),
        q(`select cp.collection_id, p.handle from commerce.collection_products cp
           join commerce.products p on p.id = cp.product_id where p.status = 'ACTIVE'
           order by cp.collection_id, cp.position`),
      ]);
      return cols.map((c): CollectionRecord => ({
        id: gidOf('Collection', c.id),
        handle: String(c.handle),
        title: String(c.title),
        description: String(c.description),
        productHandles: members.filter((m) => m.collection_id === c.id).map((m) => String(m.handle)),
      }));
    },

    async updateVariant(variantId, patch) {
      const n = numericId(variantId, 'ProductVariant');
      if (n === null) return false;
      const sets: string[] = [];
      const params: unknown[] = [n];
      if (patch.priceMinor !== undefined) { params.push(patch.priceMinor); sets.push(`price_minor = $${params.length}`); }
      if (patch.quantity !== undefined) { params.push(patch.quantity); sets.push(`inventory_quantity = $${params.length}`); }
      if (!sets.length) return true;
      const res = await pool.query(`update commerce.variants set ${sets.join(', ')} where id = $1`, params);
      return (res.rowCount ?? 0) > 0;
    },

    async createCart(cart) {
      await tx(async (c) => {
        await c.query(
          `insert into commerce.carts (id, created_at, updated_at, completed_at, note, buyer_email, buyer_country, attributes, line_seq, buyer_province)
           values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
          [cart.id, cart.createdAt, cart.updatedAt, cart.completedAt, cart.note, cart.buyerEmail, cart.buyerCountry, json(cart.attributes), cart.lineSeq, cart.buyerProvince],
        );
        await writeLines(c, cart);
      });
    },

    async getCart(id) {
      const carts = await q('select * from commerce.carts where id = $1', [id]);
      if (!carts[0]) return null;
      return toCart(carts[0], await q('select * from commerce.cart_lines where cart_id = $1 order by position', [id]));
    },

    async updateCart(id, fn) {
      return tx(async (c) => {
        // Transaction-scoped row lock: concurrent mutations of one cart queue up here.
        const carts = (await c.query('select * from commerce.carts where id = $1 for update', [id])).rows as Row[];
        if (!carts[0]) return null;
        const lines = (await c.query('select * from commerce.cart_lines where cart_id = $1 order by position', [id])).rows as Row[];
        const { cart, value } = fn(toCart(carts[0], lines));
        if (cart) {
          await c.query(
            `update commerce.carts set updated_at=$2, completed_at=$3, note=$4, buyer_email=$5, buyer_country=$6, attributes=$7::jsonb, line_seq=$8, buyer_province=$9 where id=$1`,
            [id, cart.updatedAt, cart.completedAt, cart.note, cart.buyerEmail, cart.buyerCountry, json(cart.attributes), cart.lineSeq, cart.buyerProvince],
          );
          await writeLines(c, cart);
        }
        return { value };
      });
    },

    async deleteExpiredCarts(cutoff) {
      const res = await pool.query('delete from commerce.carts where updated_at < $1', [cutoff.toISOString()]);
      return res.rowCount ?? 0;
    },

    async findReusableCheckout(cartId, fingerprint, notBefore) {
      const rows = await q(
        `select * from commerce.checkouts where cart_id = $1 and fingerprint = $2
           and status in ('created','session_created') and created_at >= $3
         order by created_at desc limit 1`,
        [cartId, fingerprint, notBefore.toISOString()],
      );
      return rows[0] ? toCheckout(rows[0]) : null;
    },
    async createCheckout(c) {
      await pool.query(
        `insert into commerce.checkouts (id, cart_id, cart_ref, status, stripe_session_id, fingerprint, subtotal_minor, buyer_email, lines, created_at, updated_at, tax_province, tax_lines)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13::jsonb)`,
        [c.id, c.cartId, c.cartRef, c.status, c.stripeSessionId, c.fingerprint, c.subtotalMinor, c.buyerEmail, json(c.lines), c.createdAt, c.updatedAt, c.province, json(c.taxLines)],
      );
    },
    async getCheckout(id) {
      const rows = await q('select * from commerce.checkouts where id = $1', [id]);
      return rows[0] ? toCheckout(rows[0]) : null;
    },
    async getCheckoutBySessionId(sessionId) {
      const rows = await q('select * from commerce.checkouts where stripe_session_id = $1', [sessionId]);
      return rows[0] ? toCheckout(rows[0]) : null;
    },
    async attachSession(checkoutId, sessionId, now) {
      const res = await pool.query(
        `update commerce.checkouts
            set stripe_session_id = $2,
                status = case when status = 'created' then 'session_created' else status end,
                updated_at = $3
          where id = $1 and (stripe_session_id is null or stripe_session_id = $2)`,
        [checkoutId, sessionId, now],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async completeCheckout(input: CompleteCheckoutInput): Promise<CompleteCheckoutOutcome> {
      return tx(async (c): Promise<CompleteCheckoutOutcome> => {
        // 1. Event dedupe. A concurrent duplicate blocks on the unique index until we commit,
        //    then sees the conflict and reports a duplicate.
        const ins = await c.query(
          'insert into commerce.processed_webhook_events (event_id, event_type) values ($1,$2) on conflict (event_id) do nothing',
          [input.eventId, input.eventType],
        );
        if (ins.rowCount === 0) return { kind: 'duplicate_event' };

        // 2. Lock the checkout row: serializes different events for the same session.
        const rows = (await c.query('select * from commerce.checkouts where id = $1 for update', [input.checkoutId])).rows as Row[];
        if (!rows[0]) throw new RollbackOutcome({ kind: 'unknown_checkout' });
        const checkout = toCheckout(rows[0]);
        if (checkout.stripeSessionId && checkout.stripeSessionId !== input.sessionId) throw new RollbackOutcome({ kind: 'session_mismatch' });

        // 3. Session dedupe.
        const existing = await loadOrder(c, 'stripe_session_id = $1', input.sessionId);
        if (existing) return { kind: 'duplicate_session', order: existing };

        // 4. Inventory: lock variant rows in id order (no deadlocks), then decrement.
        const flags = [...input.flags];
        const ids = [...new Set(checkout.lines.map((l) => numericId(l.variantId, 'ProductVariant')).filter((n): n is number => n !== null))].sort((a, b) => a - b);
        const stock = new Map<number, number | null>();
        const movements = new Map<number, { sku: string; before: number }>();
        const locked = (await c.query('select id, inventory_quantity from commerce.variants where id = any($1::int[]) order by id for update', [ids])).rows as Row[];
        for (const r of locked) stock.set(num(r.id), r.inventory_quantity === null ? null : num(r.inventory_quantity));
        for (const line of checkout.lines) {
          const n = numericId(line.variantId, 'ProductVariant');
          const have = n === null ? undefined : stock.get(n);
          if (have === undefined || have === null) continue;
          if (!movements.has(n as number)) movements.set(n as number, { sku: line.sku, before: have });
          if (have < line.quantity) flags.push('INVENTORY_SHORT');
          const left = Math.max(have - line.quantity, 0);
          stock.set(n as number, left);
          await c.query('update commerce.variants set inventory_quantity = $2 where id = $1', [n, left]);
        }

        // 5. Sequential order number from the counter row (rolls back with the transaction).
        const counter = (await c.query("update commerce.counters set value = value + 1 where name = 'order_number' returning value")).rows as Row[];
        const orderNumber = num(counter[0].value);
        const created = (
          await c.query(
            `insert into commerce.orders
               (order_number, checkout_id, stripe_session_id, email, financial_status, subtotal_minor, shipping_minor, tax_minor, total_minor, review_flags, processed_at, shipping_address, tax_lines, tax_province, shipping_province)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15) returning id`,
            [orderNumber, checkout.id, input.sessionId, input.email, input.financialStatus, checkout.subtotalMinor,
              input.shippingMinor, input.taxMinor, input.totalMinor, [...new Set(flags)], input.now,
              input.shippingAddress ? json(input.shippingAddress) : null, json(input.taxLines), checkout.province, input.shippingAddress?.province || null],
          )
        ).rows as Row[];
        for (const [position, l] of checkout.lines.entries()) {
          await c.query(
            `insert into commerce.order_lines (order_id, position, variant_id, title, variant_title, sku, quantity, unit_minor)
             values ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [created[0].id, position, l.variantId, l.title, l.variantTitle, l.sku, l.quantity, l.unitMinor],
          );
        }

        // 5b. One ORDER_PAID movement per tracked variant, in the same transaction as the stock change.
        for (const [variantNumeric, was] of [...movements].sort((a, b) => a[0] - b[0])) {
          const after = stock.get(variantNumeric) as number;
          if (after === was.before) continue;
          await c.query(
            `insert into commerce.inventory_movements (at, variant_id, sku, delta, reason, order_id, available_after)
             values ($1,$2,$3,$4,'ORDER_PAID',$5,$6)`,
            [input.now, variantNumeric, was.sku, after - was.before, created[0].id, after],
          );
        }

        // 6. Close the checkout and the cart.
        await c.query("update commerce.checkouts set status='completed', stripe_session_id=$2, updated_at=$3 where id=$1", [checkout.id, input.sessionId, input.now]);
        await c.query('update commerce.carts set completed_at = $2 where id = $1', [checkout.cartId, input.now]);
        const order = await loadOrder(c, 'id = $1', created[0].id);
        return { kind: 'created', order: order as OrderRecord };
      }).catch((error) => {
        if (error instanceof RollbackOutcome) return error.outcome;
        throw error;
      });
    },

    async recordCheckoutStatus(input: RecordStatusInput) {
      return tx(async (c) => {
        const ins = await c.query(
          'insert into commerce.processed_webhook_events (event_id, event_type) values ($1,$2) on conflict (event_id) do nothing',
          [input.eventId, input.eventType],
        );
        if (ins.rowCount === 0) return 'duplicate_event' as const;
        const res = await c.query(
          `update commerce.checkouts set status = $2, updated_at = $3
            where id = $1 and status in ('created','session_created','awaiting_payment')`,
          [input.checkoutId, input.status, input.now],
        );
        return (res.rowCount ?? 0) > 0 ? ('updated' as const) : ('ignored' as const);
      });
    },

    async getOrderBySessionId(sessionId) {
      return loadOrder(pool, 'stripe_session_id = $1', sessionId);
    },
    async countOrders() {
      return num((await q('select count(*)::int as n from commerce.orders'))[0].n);
    },

    async openCartCounts(notBefore) {
      const rows = await q(
        `select cl.variant_id, count(distinct cl.cart_id)::int as n
           from commerce.cart_lines cl join commerce.carts c on c.id = cl.cart_id
          where c.completed_at is null and c.updated_at >= $1
          group by cl.variant_id`,
        [notBefore.toISOString()],
      );
      return new Map(rows.map((r) => [gidOf('ProductVariant', r.variant_id), num(r.n)]));
    },
    async recordWebhookEvent({ eventId, eventType, outcome, at }) {
      await pool.query('insert into commerce.webhook_events (event_id, event_type, outcome, received_at) values ($1,$2,$3,$4)', [eventId, eventType, outcome, at]);
    },
    async close() {
      await pool.end();
    },
  };
  POOL_OF.set(repo, pool);
  return repo;
}

/** Thrown inside a transaction to roll it back (undoing the event-dedupe insert) and return an outcome. */
class RollbackOutcome extends Error {
  constructor(readonly outcome: CompleteCheckoutOutcome) {
    super('rollback');
  }
}

