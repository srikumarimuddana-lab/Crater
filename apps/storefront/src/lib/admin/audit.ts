import type { AdminRepository, AuditInput } from './records';

export type AuditDraft = {
  actor: { id: number; email: string } | null;
  action: string;
  target?: { type: string; id: string } | null;
  changes?: Record<string, { from: unknown; to: unknown }>;
  /** Raw client address; only a truncated form is stored. */
  ip?: string | null;
  /** ISO time; defaults to now. Services pass their injected clock. */
  at?: string;
};

// Strong words match anywhere (case-insensitive); short ambiguous words only as whole lower-case tokens, so an
// upper-case SKU used in a key (e.g. "SAMPLE-IP-30.price") is not mistaken for personal data.
const PII_STRONG = /e-?mail|phone|address|postal|password|secret|token/i;
const PII_WEAK = /(^|[._:\s-])(name|ip|tel|zip|note|notes|code)([._:\s-]|$)/;
const looksPersonal = (key: string): boolean => PII_STRONG.test(key) || PII_WEAK.test(key);
const EMAIL_IN_TEXT = /[^\s@]{1,64}@[^\s@]{1,255}\.[A-Za-z]{2,}/g;
const MAX_VALUE = 200;

/** IPv4 -> /24, IPv6 -> first three groups; anything else -> null. */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (/^[0-9a-f:]+$/i.test(ip) && ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::/48`;
  return null;
}

function sanitiseValue(v: unknown): unknown {
  if (typeof v === 'string') return v.replace(EMAIL_IN_TEXT, '[redacted]').slice(0, MAX_VALUE);
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v === undefined) return null;
  return String(JSON.stringify(v) ?? '').replace(EMAIL_IN_TEXT, '[redacted]').slice(0, MAX_VALUE);
}

/**
 * Defence in depth for "no PII in changes": a key that names personal data (email, phone, address, name,
 * notes, secrets) is a programming error and throws; email-looking text in values is redacted; values are
 * truncated. Services pass ids, statuses, money and counts only.
 */
export function sanitiseChanges(changes: AuditDraft['changes']): AuditInput['changes'] {
  const out: AuditInput['changes'] = {};
  for (const [key, change] of Object.entries(changes ?? {})) {
    if (looksPersonal(key)) throw new Error(`audit: change key "${key}" looks like personal data and must not be logged`);
    out[key.slice(0, 80)] = { from: sanitiseValue(change.from), to: sanitiseValue(change.to) };
  }
  return out;
}

export function toAuditInput(draft: AuditDraft): AuditInput {
  return {
    actorId: draft.actor?.id ?? null,
    actorEmail: draft.actor?.email ?? null,
    action: draft.action.slice(0, 80),
    targetType: draft.target?.type ?? null,
    targetId: draft.target?.id ?? null,
    changes: sanitiseChanges(draft.changes),
    ipTrunc: truncateIp(draft.ip),
    ...(draft.at ? { at: draft.at } : {}),
  };
}

/**
 * Append-only audit writer. Every mutation uses it, either directly or (for state changes) through the
 * repository method that writes the row in the same transaction as the change.
 */
export async function audit(repo: Pick<AdminRepository, 'appendAudit'>, draft: AuditDraft): Promise<void> {
  await repo.appendAudit(toAuditInput(draft));
}
