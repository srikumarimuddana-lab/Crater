import type { Connection, ID } from '@/lib/commerce/types';
import { audit, type AuditDraft } from '../audit';
import { AdminAuthError } from '../errors';
import { roleCan } from '../permissions';
import type { AdminRepository } from '../records';
import type { AdminSession, AdminMutationResult, AdminUserError, Capability } from '../types';
import { gidTail } from '../ids';

export type ServiceDeps = {
  admin: AdminRepository;
  commerce: import('@/lib/commerce/records').CommerceRepository;
  config: { timezone: string };
  /** Resolves the current staff session (null when signed out). */
  getSession: () => Promise<AdminSession | null>;
  now?: () => Date;
};

export type Ctx = ServiceDeps & { clock: () => Date };

export const makeCtx = (deps: ServiceDeps): Ctx => ({ ...deps, clock: deps.now ?? (() => new Date()) });

export const hasCapability = (s: AdminSession, cap: Capability): boolean => s.capabilities.includes(cap) && roleCan(s.staff.role, cap);

export const actorOf = (s: AdminSession): { id: number; email: string } => ({ id: gidTail(s.staff.id, 'StaffUser') ?? 0, email: s.staff.email });

/** Reads: signed out -> UNAUTHENTICATED; missing capability -> FORBIDDEN (the UI maps both). */
export async function readAs(ctx: Ctx, cap: Capability): Promise<AdminSession> {
  const s = await ctx.getSession();
  if (!s) throw new AdminAuthError('UNAUTHENTICATED');
  if (!hasCapability(s, cap)) throw new AdminAuthError('FORBIDDEN', cap);
  return s;
}

export const userError = (code: AdminUserError['code'], field: string[] | null, message: string): AdminUserError => ({ code, field, message });
export const fail = <T>(...errors: AdminUserError[]): AdminMutationResult<T> => ({ data: null, userErrors: errors });
export const ok = <T>(data: T): AdminMutationResult<T> => ({ data, userErrors: [] });

/**
 * Mutations: signed out throws UNAUTHENTICATED; a missing capability is audited (`access.denied`) and returned
 * as a FORBIDDEN userError, so the attempt is visible and the UI can show the message inline.
 */
export async function mutateAs<T>(
  ctx: Ctx,
  cap: Capability,
  run: (session: AdminSession, at: string) => Promise<AdminMutationResult<T>>,
): Promise<AdminMutationResult<T>> {
  const s = await ctx.getSession();
  if (!s) throw new AdminAuthError('UNAUTHENTICATED');
  const at = ctx.clock().toISOString();
  if (!hasCapability(s, cap)) {
    await audit(ctx.admin, { actor: actorOf(s), action: 'access.denied', target: { type: 'capability', id: cap }, at });
    return fail(userError('FORBIDDEN', null, 'You do not have permission to do this.'));
  }
  return run(s, at);
}

export const auditDraft = (s: AdminSession, at: string, d: Omit<AuditDraft, 'actor' | 'at'>): AuditDraft => ({ ...d, actor: actorOf(s), at });

// ---- validation -----------------------------------------------------------------------------------

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Trimmed text within [min, max], no control characters. Returns the text or an error message. */
export function cleanText(value: unknown, label: string, { min = 0, max, multiline = false }: { min?: number; max: number; multiline?: boolean }): { value: string } | { error: string } {
  if (typeof value !== 'string') return { error: `${label} must be text.` };
  const text = value.trim();
  if (CONTROL.test(text) || (!multiline && /[\r\n\t]/.test(text))) return { error: `${label} contains characters that are not allowed.` };
  if (text.length < min) return { error: min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.` };
  if (text.length > max) return { error: `${label} must be at most ${max} characters.` };
  return { value: text };
}

export function clampFirst(first: number | undefined, fallback = 25): number {
  return Number.isInteger(first) && (first as number) >= 1 ? Math.min(first as number, 100) : fallback;
}

// ---- cursors --------------------------------------------------------------------------------------

export const encodeIdCursor = (id: number): string => Buffer.from(`id:${id}`).toString('base64url');
export function decodeIdCursor(cursor: string | null | undefined): number | null {
  if (!cursor) return null;
  const m = /^id:(\d{1,15})$/.exec(Buffer.from(String(cursor).slice(0, 64), 'base64url').toString('utf8'));
  return m ? Number(m[1]) : null;
}
export const encodeOrderCursor = (processedAt: string, id: number): string => Buffer.from(JSON.stringify([processedAt, id])).toString('base64url');
export function decodeOrderCursor(cursor: string | null | undefined): { processedAt: string; id: number } | null {
  if (!cursor) return null;
  try {
    const v = JSON.parse(Buffer.from(String(cursor).slice(0, 200), 'base64url').toString('utf8')) as unknown;
    if (Array.isArray(v) && typeof v[0] === 'string' && Number.isInteger(v[1]) && !Number.isNaN(Date.parse(v[0]))) return { processedAt: new Date(v[0]).toISOString(), id: v[1] as number };
  } catch {
    // fall through: an unreadable cursor means "start from the first page"
  }
  return null;
}

export function page<T>(nodes: T[], hasNext: boolean, hasPrevious: boolean, cursorOf: (node: T) => string): Connection<T> {
  return {
    nodes,
    pageInfo: {
      hasNextPage: hasNext,
      hasPreviousPage: hasPrevious,
      startCursor: nodes.length ? cursorOf(nodes[0]) : null,
      endCursor: nodes.length ? cursorOf(nodes[nodes.length - 1]) : null,
    },
  };
}

export type { ID };
