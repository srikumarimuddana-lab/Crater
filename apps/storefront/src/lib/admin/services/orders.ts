import { multiplyMinor, toMoney } from '@/lib/commerce/money';
import type { Connection, ID } from '@/lib/commerce/types';
import { gidTail } from '../ids';
import { fieldAccess, maskEmail } from '../permissions';
import type { OrderWithFulfilment } from '../records';
import type { PackingSlip, MarkFulfilledInput, UpdateNotesInput } from '../service-types';
import type { AdminMutationResult, AdminOrder, AdminOrderSummary, AdminSession, OrdersQuery, OrderTimelineEvent } from '../types';
import { auditDraft, cleanText, clampFirst, decodeOrderCursor, encodeOrderCursor, fail, hasCapability, mutateAs, ok, page, readAs, userError, type Ctx } from './shared';
import { toAuditInput } from '../audit';

const orderGid = (id: number): ID => `gid://crater/Order/${id}`;
const TRACKING = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,59}$/;

function shape(o: OrderWithFulfilment, s: AdminSession, noteEvents: { at: string; actorName: string | null }[]): AdminOrder {
  const prices = hasCapability(s, 'orders:read_prices');
  const internal = hasCapability(s, 'orders:internal_notes');
  const access = fieldAccess(s.staff.role);
  const timeline: OrderTimelineEvent[] = [{ at: o.processedAt, kind: 'PLACED', message: 'Order placed', actor: null }];
  if (prices) {
    if (['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(o.financialStatus)) timeline.push({ at: o.processedAt, kind: 'PAID', message: 'Payment confirmed', actor: null });
    for (const flag of o.reviewFlags) timeline.push({ at: o.processedAt, kind: 'FLAGGED', message: `Flagged for review: ${flag}`, actor: null });
  }
  if (o.fulfilment) timeline.push({ at: o.fulfilment.fulfilledAt, kind: 'FULFILLED', message: `Fulfilled via ${o.fulfilment.carrier}`, actor: o.fulfilment.byName });
  if (internal) for (const n of noteEvents) timeline.push({ at: n.at, kind: 'NOTE', message: 'Notes updated', actor: n.actorName });
  timeline.sort((a, b) => a.at.localeCompare(b.at));
  return {
    id: orderGid(o.id),
    name: `#${o.number}`,
    processedAt: o.processedAt,
    financialStatus: o.financialStatus,
    fulfilmentStatus: o.fulfilmentStatus,
    reviewFlags: [...o.reviewFlags],
    email: o.email === null || access.orderEmail === 'none' ? null : access.orderEmail === 'masked' ? maskEmail(o.email) : o.email,
    shippingAddress: o.shippingAddress ? { ...o.shippingAddress } : null,
    lines: o.lines.map((l) => ({
      variantId: l.variantId,
      title: l.title,
      variantTitle: l.variantTitle,
      sku: l.sku,
      quantity: l.quantity,
      unitPrice: prices ? toMoney(l.unitMinor) : null,
      total: prices ? toMoney(multiplyMinor(l.unitMinor, l.quantity)) : null,
    })),
    totals: prices
      ? { subtotal: toMoney(o.subtotalMinor), shipping: toMoney(o.shippingMinor), tax: toMoney(o.taxMinor), total: toMoney(o.totalMinor) }
      : null,
    taxLines: prices ? o.taxLines.map((l) => ({ ...l, amount: { ...l.amount } })) : null,
    taxProvince: o.taxProvince,
    shippingProvince: o.shippingProvince,
    packingInstructions: o.packingInstructions,
    internalNotes: internal ? o.internalNotes : null,
    fulfilment: o.fulfilment
      ? { carrier: o.fulfilment.carrier, trackingNumber: o.fulfilment.trackingNumber, fulfilledAt: o.fulfilment.fulfilledAt, by: o.fulfilment.byName ?? 'Staff' }
      : null,
    timeline,
  };
}

export function ordersService(ctx: Ctx) {
  const { admin } = ctx;

  async function load(id: number, s: AdminSession): Promise<AdminOrder | null> {
    const o = await admin.getOrder(id);
    return o ? shape(o, s, await admin.listOrderNoteEvents(id)) : null;
  }

  return {
    async list(query: OrdersQuery = {}): Promise<Connection<AdminOrderSummary>> {
      const s = await readAs(ctx, 'orders:read');
      const prices = hasCapability(s, 'orders:read_prices');
      const access = fieldAccess(s.staff.role);
      const first = clampFirst(query.first);
      const after = decodeOrderCursor(query.after);
      const filter: Parameters<typeof admin.listOrders>[0] = { first, after, financialStatus: query.financialStatus, fulfilmentStatus: query.fulfilmentStatus };
      const text = (query.query ?? '').trim().slice(0, 100);
      if (text) {
        if (/^#?\d{1,9}$/.test(text)) filter.orderNumber = Number(text.replace('#', ''));
        // Searching by email would let a role infer data it may not see: only roles with full email access can.
        else if (access.orderEmail === 'full') filter.emailContains = text.toLowerCase();
        else return page<AdminOrderSummary>([], false, false, () => '');
      }
      const rows = await admin.listOrders(filter);
      const slice = rows.slice(0, first);
      const nodes = slice.map((o): AdminOrderSummary => ({
        id: orderGid(o.id),
        name: `#${o.number}`,
        processedAt: o.processedAt,
        financialStatus: o.financialStatus,
        fulfilmentStatus: o.fulfilmentStatus,
        reviewFlags: [...o.reviewFlags],
        itemCount: o.lines.reduce((n, l) => n + l.quantity, 0),
        total: prices ? toMoney(o.totalMinor) : null,
      }));
      const cursors = new Map(slice.map((o) => [orderGid(o.id), encodeOrderCursor(o.processedAt, o.id)]));
      return page(nodes, rows.length > first, after !== null, (n) => cursors.get(n.id) as string);
    },

    async get(orderId: ID): Promise<AdminOrder | null> {
      const s = await readAs(ctx, 'orders:read');
      const id = gidTail(orderId, 'Order');
      return id === null ? null : load(id, s);
    },

    async packingSlip(orderId: ID): Promise<PackingSlip | null> {
      await readAs(ctx, 'orders:read');
      const id = gidTail(orderId, 'Order');
      const o = id === null ? null : await admin.getOrder(id);
      if (!o) return null;
      return {
        orderId: orderGid(o.id),
        orderName: `#${o.number}`,
        processedAt: o.processedAt,
        shippingAddress: o.shippingAddress ? { ...o.shippingAddress } : null,
        packingInstructions: o.packingInstructions,
        lines: o.lines.map((l) => ({ title: l.title, variantTitle: l.variantTitle, sku: l.sku, quantity: l.quantity })),
      };
    },

    async markFulfilled(input: MarkFulfilledInput): Promise<AdminMutationResult<AdminOrder>> {
      return mutateAs(ctx, 'orders:fulfil', async (s, at) => {
        const id = gidTail(input?.orderId, 'Order');
        if (id === null) return fail(userError('NOT_FOUND', ['orderId'], 'Order not found.'));
        const carrier = cleanText(input.carrier, 'Carrier', { min: 1, max: 60 });
        if ('error' in carrier) return fail(userError('INVALID', ['carrier'], carrier.error));
        const tracking = typeof input.trackingNumber === 'string' ? input.trackingNumber.trim() : '';
        if (!TRACKING.test(tracking)) return fail(userError('INVALID', ['trackingNumber'], 'Enter a tracking number (letters, numbers, spaces, . _ / -; up to 60 characters).'));
        const draft = auditDraft(s, at, {
          action: 'order.fulfilled',
          target: { type: 'order', id: orderGid(id) },
          changes: { fulfilmentStatus: { from: 'UNFULFILLED', to: 'FULFILLED' }, carrier: { from: null, to: carrier.value } },
        });
        const r = await admin.markFulfilled({ orderId: id, carrier: carrier.value, trackingNumber: tracking, staffId: draft.actor?.id ?? 0, at, audit: toAuditInput(draft) });
        switch (r.kind) {
          case 'not_found':
            return fail(userError('NOT_FOUND', ['orderId'], 'Order not found.'));
          case 'not_fulfillable':
            return fail(userError('INVALID', ['orderId'], 'This order is not paid, so it cannot be fulfilled.'));
          case 'conflict':
            return fail(userError('CONFLICT', ['orderId'], 'This order was already fulfilled with different details.'));
          default:
            return ok(shape(r.order, s, await admin.listOrderNoteEvents(id)));
        }
      });
    },

    async updateNotes(input: UpdateNotesInput): Promise<AdminMutationResult<AdminOrder>> {
      return mutateAs(ctx, 'orders:internal_notes', async (s, at) => {
        const id = gidTail(input?.orderId, 'Order');
        if (id === null) return fail(userError('NOT_FOUND', ['orderId'], 'Order not found.'));
        const patch: { packingInstructions?: string | null; internalNotes?: string | null } = {};
        for (const [key, label, max] of [['packingInstructions', 'Packing instructions', 2000], ['internalNotes', 'Internal notes', 4000]] as const) {
          const v = input[key];
          if (v === undefined) continue;
          if (v === null) {
            patch[key] = null;
            continue;
          }
          const c = cleanText(v, label, { max, multiline: true });
          if ('error' in c) return fail(userError('INVALID', [key], c.error));
          patch[key] = c.value === '' ? null : c.value;
        }
        if (!('packingInstructions' in patch) && !('internalNotes' in patch)) return fail(userError('INVALID', null, 'Nothing to update.'));
        const state = (v: string | null) => (v ? 'set' : 'empty');
        const updated = await admin.updateOrderNotes({
          orderId: id,
          ...patch,
          // Note text can contain personal data, so the audit log records only whether each note is set.
          audit: (before) =>
            toAuditInput(
              auditDraft(s, at, {
                action: 'order.notes_updated',
                target: { type: 'order', id: orderGid(id) },
                changes: {
                  ...('packingInstructions' in patch ? { packingInstructions: { from: state(before.packingInstructions), to: state(patch.packingInstructions ?? null) } } : {}),
                  ...('internalNotes' in patch ? { internalNotes: { from: state(before.internalNotes), to: state(patch.internalNotes ?? null) } } : {}),
                },
              }),
            ),
        });
        if (!updated) return fail(userError('NOT_FOUND', ['orderId'], 'Order not found.'));
        return ok(shape(updated, s, await admin.listOrderNoteEvents(id)));
      });
    },
  };
}
