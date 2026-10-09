import 'server-only';
import { redirect } from 'next/navigation';
import { AdminAuthError, type AdminMutationResult, type AdminUserError } from '@/lib/admin';
import type { FormState } from '@/components/admin/form-state';

export const text = (fd: FormData, key: string): string => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

/** Echo submitted text fields so a failed save keeps the draft (never passwords or codes). */
export function echo(fd: FormData, skip: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string' && !k.startsWith('$ACTION') && !skip.includes(k)) out[k] = v;
  return out;
}

export function errorsToState(errors: AdminUserError[], values?: Record<string, string>): FormState {
  const conflict = errors.some((e) => e.code === 'CONFLICT');
  const blocked = errors.some((e) => e.code === 'PUBLISH_BLOCKED');
  return {
    status: 'error',
    conflict,
    values,
    message: blocked ? 'This product cannot be published yet. See the checklist.' : undefined,
    errors: errors.map((e) => ({ field: e.field && e.code !== 'PUBLISH_BLOCKED' ? e.field.join('.') : '', message: e.message })),
  };
}

export const failed = (message: string, values?: Record<string, string>): FormState => ({ status: 'error', message, errors: [], values });

/** Runs a mutation, translating thrown auth errors (UNAUTHENTICATED -> sign-in page, others -> inline). */
export async function runAction<T>(fn: () => Promise<AdminMutationResult<T>>, values?: Record<string, string>): Promise<{ result: AdminMutationResult<T> } | { state: FormState }> {
  try {
    return { result: await fn() };
  } catch (e) {
    if (e instanceof AdminAuthError) {
      if (e.code === 'UNAUTHENTICATED') redirect('/admin/login');
      return { state: failed('You do not have permission to do this.', values) };
    }
    throw e;
  }
}
