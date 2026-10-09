/**
 * Sign-in throttling policy (pure). Failures are counted per email and per IP (hashed). After `free`
 * consecutive failures every further failure locks that key for baseMs * 2^(failures - free), capped. The count
 * resets after a quiet window or a successful sign-in (email key). Messages stay generic: a locked key says
 * only "try again later", whether or not the email belongs to a staff account.
 */
export type AttemptKind = 'email' | 'ip';
export type AttemptRecord = { kind: AttemptKind; keyHash: string; failures: number; lastFailureAt: string | null; lockedUntil: string | null };

export const RATE_POLICY = {
  free: { email: 5, ip: 20 } as Record<AttemptKind, number>,
  baseMs: 30_000,
  maxMs: 15 * 60_000,
  windowMs: 60 * 60_000,
};

export const backoffMs = (failures: number, free: number): number =>
  failures <= free ? 0 : Math.min(RATE_POLICY.maxMs, RATE_POLICY.baseMs * 2 ** Math.min(failures - free - 1, 20));

export const emptyAttempt = (kind: AttemptKind, keyHash: string): AttemptRecord => ({ kind, keyHash, failures: 0, lastFailureAt: null, lockedUntil: null });

/** Milliseconds the key stays locked (0 when free to try). */
export function lockedForMs(a: AttemptRecord | null, now: Date): number {
  if (!a?.lockedUntil) return 0;
  return Math.max(0, new Date(a.lockedUntil).getTime() - now.getTime());
}

export function withFailure(current: AttemptRecord | null, kind: AttemptKind, keyHash: string, now: Date): AttemptRecord {
  const base = current ?? emptyAttempt(kind, keyHash);
  const quiet = base.lastFailureAt !== null && now.getTime() - new Date(base.lastFailureAt).getTime() > RATE_POLICY.windowMs;
  const failures = (quiet ? 0 : base.failures) + 1;
  const wait = backoffMs(failures, RATE_POLICY.free[kind]);
  return {
    kind,
    keyHash,
    failures,
    lastFailureAt: now.toISOString(),
    lockedUntil: wait > 0 ? new Date(now.getTime() + wait).toISOString() : null,
  };
}
