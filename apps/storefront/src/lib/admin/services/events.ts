import type { Connection } from '@/lib/commerce/types';
import { adminGid } from '../ids';
import type { PageQuery } from '../service-types';
import type { AuditEntry, StaffUser, WebhookEventSummary } from '../types';
import { clampFirst, decodeIdCursor, encodeIdCursor, hasCapability, page, readAs, type Ctx } from './shared';
import { toStaffUser } from '../auth/builtin';

/** Bookkeepers see financial audit entries only (requirements section 1). */
const FINANCIAL_PREFIXES = ['product.price_changed', 'refund.', 'ledger.', 'export.'];

export function eventsService(ctx: Ctx) {
  const { admin } = ctx;
  return {
    async webhooks(query: { first?: number } = {}): Promise<WebhookEventSummary[]> {
      await readAs(ctx, 'events:read');
      return (await admin.listWebhookEvents(clampFirst(query.first, 50))).map((e) => ({ id: e.eventId, type: e.eventType, receivedAt: e.receivedAt, outcome: e.outcome }));
    },

    async audit(query: PageQuery = {}): Promise<Connection<AuditEntry>> {
      const s = await readAs(ctx, 'audit:read');
      const first = clampFirst(query.first, 50);
      const beforeId = decodeIdCursor(query.after);
      const full = hasCapability(s, 'staff:read'); // Owner sees everything
      const rows = await admin.listAudit({ first, beforeId, actionPrefixes: full ? undefined : FINANCIAL_PREFIXES });
      const slice = rows.slice(0, first);
      const ids = new Map<string, number>();
      const nodes = slice.map((r): AuditEntry => {
        const id = adminGid('AuditEntry', r.id);
        ids.set(id, r.id);
        return {
          id,
          at: r.at,
          actor: r.actorId !== null && r.actorEmail ? { id: adminGid('StaffUser', r.actorId), email: r.actorEmail } : null,
          action: r.action,
          target: r.targetType && r.targetId ? { type: r.targetType, id: r.targetId } : null,
          changes: r.changes,
        };
      });
      return page(nodes, rows.length > first, beforeId !== null, (n) => encodeIdCursor(ids.get(n.id) as number));
    },
  };
}

export function staffService(ctx: Ctx) {
  return {
    async list(): Promise<StaffUser[]> {
      await readAs(ctx, 'staff:read');
      return (await ctx.admin.listStaff()).map(toStaffUser);
    },
  };
}
