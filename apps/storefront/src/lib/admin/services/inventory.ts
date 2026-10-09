import { CART_TTL_MS } from '@/lib/commerce/cart-logic';
import type { Connection, ID } from '@/lib/commerce/types';
import { toAuditInput } from '../audit';
import { gidTail, adminGid } from '../ids';
import { ADJUST_REASONS, REASON_SIGN, allowedAdjustReasons } from '../permissions';
import type { MovementWithActor } from '../records';
import type { AdjustStockInput, InventoryLevel, InventoryQuery, MovementsQuery } from '../service-types';
import type { AdminMutationResult, InventoryMovement, StockAdjustmentReason } from '../types';
import { auditDraft, cleanText, clampFirst, decodeIdCursor, encodeIdCursor, fail, mutateAs, ok, page, readAs, userError, type Ctx } from './shared';

const MAX_DELTA = 100_000;

const toMovement = (m: MovementWithActor): InventoryMovement => ({
  id: adminGid('InventoryMovement', m.id),
  at: m.at,
  variantId: m.variantId,
  sku: m.sku,
  delta: m.delta,
  reason: m.reason,
  note: m.note,
  actor: m.actorEmail,
  availableAfter: m.availableAfter,
});

export function inventoryService(ctx: Ctx) {
  const { admin, commerce } = ctx;
  return {
    async levels(query: InventoryQuery = {}): Promise<InventoryLevel[]> {
      await readAs(ctx, 'inventory:read');
      const [products, committed, carts] = await Promise.all([
        commerce.listProducts({ includeInactive: true }),
        admin.committedByVariant(),
        commerce.openCartCounts(new Date(ctx.clock().getTime() - CART_TTL_MS)),
      ]);
      const text = (query.query ?? '').trim().toLowerCase().slice(0, 100);
      const out: InventoryLevel[] = [];
      for (const p of products) {
        if (p.status === 'ARCHIVED' && !query.includeArchived) continue;
        for (const v of p.variants) {
          if (text && !p.title.toLowerCase().includes(text) && !v.sku.toLowerCase().includes(text)) continue;
          const tracked = v.quantity !== null;
          const c = committed.get(v.id) ?? 0;
          const low = tracked && (v.quantity as number) <= v.lowStockThreshold;
          if (query.onlyLow && !low) continue;
          out.push({
            variantId: v.id,
            productId: p.id,
            productTitle: p.title,
            productHandle: p.handle,
            productStatus: p.status,
            variantTitle: v.title,
            sku: v.sku,
            tracked,
            available: v.quantity,
            committed: c,
            onHand: tracked ? (v.quantity as number) + c : null,
            lowStockThreshold: v.lowStockThreshold,
            low,
            openCartCount: carts.get(v.id) ?? 0,
          });
        }
      }
      return out.sort((a, b) => Number(b.low) - Number(a.low) || (a.low && b.low ? (a.available ?? 0) - (b.available ?? 0) : 0));
    },

    async adjust(input: AdjustStockInput): Promise<AdminMutationResult<InventoryMovement>> {
      return mutateAs(ctx, 'inventory:adjust', async (s, at) => {
        const variantId = gidTail(input?.variantId, 'ProductVariant');
        if (variantId === null) return fail(userError('NOT_FOUND', ['variantId'], 'Variant not found.'));
        if (!ADJUST_REASONS.includes(input.reason)) return fail(userError('INVALID', ['reason'], 'Choose a reason.'));
        if (!allowedAdjustReasons(s.staff.role).includes(input.reason)) return fail(userError('FORBIDDEN', ['reason'], 'Your role cannot use this reason.'));
        const { delta } = input;
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_DELTA) {
          return fail(userError('INVALID', ['delta'], `Enter a whole number other than 0 (up to ${MAX_DELTA}).`));
        }
        const sign = REASON_SIGN[input.reason];
        if (sign === '+' && delta < 0) return fail(userError('INVALID', ['delta'], 'This reason adds stock: enter a positive number.'));
        if (sign === '-' && delta > 0) return fail(userError('INVALID', ['delta'], 'This reason removes stock: enter a negative number.'));
        let note: string | null = null;
        if (input.note !== undefined && input.note !== null && input.note.trim() !== '') {
          const c = cleanText(input.note, 'Note', { max: 500 });
          if ('error' in c) return fail(userError('INVALID', ['note'], c.error));
          note = c.value;
        }
        if (input.reason === 'OTHER' && (note?.length ?? 0) < 3) return fail(userError('INVALID', ['note'], 'Add a note (3+ characters) when the reason is Other.'));

        const r = await admin.adjustStock({
          variantId,
          delta,
          reason: input.reason,
          note,
          staffId: gidTail(s.staff.id, 'StaffUser') ?? 0,
          at,
          // The note can contain personal data, so only the quantities and the reason are logged.
          audit: (m) =>
            toAuditInput(
              auditDraft(s, at, {
                action: 'inventory.adjusted',
                target: { type: 'variant', id: m.variantId },
                changes: { available: { from: m.availableAfter - m.delta, to: m.availableAfter }, reason: { from: null, to: m.reason } },
              }),
            ),
        });
        switch (r.kind) {
          case 'not_found':
            return fail(userError('NOT_FOUND', ['variantId'], 'Variant not found.'));
          case 'untracked':
            return fail(userError('INVALID', ['variantId'], 'Stock is not tracked for this variant.'));
          case 'below_zero':
            return fail(userError('INVALID', ['delta'], `Stock cannot go below 0: only ${r.available} available.`));
          default:
            return ok(toMovement(r.movement));
        }
      });
    },

    async movements(query: MovementsQuery = {}): Promise<Connection<InventoryMovement>> {
      await readAs(ctx, 'inventory:read');
      const first = clampFirst(query.first);
      const beforeId = decodeIdCursor(query.after);
      const variantId = query.variantId ? (gidTail(query.variantId as ID, 'ProductVariant') ?? undefined) : undefined;
      const rows = await admin.listMovements({ first, beforeId, variantId });
      const slice = rows.slice(0, first);
      const ids = new Map(slice.map((m) => [adminGid('InventoryMovement', m.id), m.id]));
      return page(slice.map(toMovement), rows.length > first, beforeId !== null, (n) => encodeIdCursor(ids.get(n.id) as number));
    },
  };
}
