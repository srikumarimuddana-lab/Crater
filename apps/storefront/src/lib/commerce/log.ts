import { createHash } from 'node:crypto';

/**
 * Redacting diagnostics. Cart ids are bearer secrets and Stripe session ids tie to a
 * buyer, so neither is ever logged in full. Keys and signing secrets are scrubbed from
 * any error text.
 */

/** Short one-way reference, safe to log and stable for correlation. */
export function ref(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}

export function redactSession(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : '…';
}

const SECRET = /\b(?:sk|rk|pk|whsec)_(?:test_|live_)?[A-Za-z0-9_]+|postgres(?:ql)?:\/\/\S+|gid:\/\/crater\/Cart\/[A-Za-z0-9_-]+/g;

export function scrub(text: string): string {
  return text.replace(SECRET, '[redacted]');
}

export function errorInfo(error: unknown): Record<string, string | number | undefined> {
  if (error && typeof error === 'object') {
    const e = error as { type?: unknown; code?: unknown; statusCode?: unknown; name?: unknown; message?: unknown };
    return {
      name: typeof e.name === 'string' ? e.name : undefined,
      type: typeof e.type === 'string' ? e.type : undefined,
      code: typeof e.code === 'string' ? e.code : undefined,
      status: typeof e.statusCode === 'number' ? e.statusCode : undefined,
      message: typeof e.message === 'string' ? scrub(e.message).slice(0, 300) : undefined,
    };
  }
  return { message: 'non-error thrown' };
}

export const logger = {
  warn(event: string, data: Record<string, unknown> = {}) {
    console.warn(`[commerce] ${event}`, data);
  },
  error(event: string, error: unknown, data: Record<string, unknown> = {}) {
    console.error(`[commerce] ${event}`, { ...data, error: errorInfo(error) });
  },
};
