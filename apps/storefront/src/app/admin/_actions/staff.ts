'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/admin/form-state';
import { AdminAuthError, clientIpFrom, requireAdmin } from '@/lib/admin';
import type { StaffRole } from '@/lib/admin/types';
import { getAccountService } from '@/lib/admin/auth/account-runtime';
import { AccountError } from '@/lib/admin/auth/account-errors';
import { failed, text } from '../_lib/results';

function failure(error: unknown): FormState {
  if (error instanceof AdminAuthError) {
    if (error.code === 'UNAUTHENTICATED') redirect('/admin/login');
    return failed('You do not have permission to manage staff.');
  }
  return failed(error instanceof AccountError ? error.message : 'The change could not be completed. Check integration status and try again.');
}

export async function inviteStaffAction(_previous: FormState, data: FormData): Promise<FormState> {
  try {
    await requireAdmin('staff:manage');
    await (await getAccountService()).invite({ email: text(data, 'email'), name: text(data, 'name'), role: text(data, 'role') as StaffRole });
    revalidatePath('/admin/staff');
    return { status: 'success', errors: [], message: 'Invitation queued. The link expires in 24 hours.' };
  } catch (error) { return failure(error); }
}

export async function updateStaffAction(_previous: FormState, data: FormData): Promise<FormState> {
  try {
    await requireAdmin('staff:manage');
    if (text(data, 'confirmed') !== 'yes') return failed('Confirm the role and access change before saving.');
    await (await getAccountService()).updateStaff({ id: Number(text(data, 'id')), role: text(data, 'role') as StaffRole, status: text(data, 'status') as 'ACTIVE' | 'DISABLED' });
    revalidatePath('/admin/staff');
    return { status: 'success', errors: [], message: 'Staff account updated. Existing sessions have been signed out.' };
  } catch (error) { return failure(error); }
}

export async function requestPasswordResetAction(_previous: FormState, data: FormData): Promise<FormState> {
  const result = await (await getAccountService()).requestReset(text(data, 'email'), clientIpFrom(await headers()));
  return { status: 'success', errors: [], message: result.message };
}

export async function acceptPasswordAction(_previous: FormState, data: FormData): Promise<FormState> {
  if (text(data, 'password') !== text(data, 'confirmPassword')) return failed('The passwords do not match.');
  const result = await (await getAccountService()).acceptPassword({ token: text(data, 'token'), password: text(data, 'password') });
  if (!result.ok) return failed(result.message);
  redirect('/admin/login?passwordChanged=1');
}
