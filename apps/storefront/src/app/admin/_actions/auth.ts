'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminConfigError, clientIpFrom, getAdminAuth } from '@/lib/admin';
import { failed, text } from '../_lib/results';
import type { FormState } from '@/components/admin/form-state';

const GENERIC = 'The email or password is not right, or this account cannot sign in. Try again.';
const LIMITED = 'Too many attempts. Wait a little while, then try again.';
const BAD_CODE = 'That code did not work. Enter the current 6-digit code from your authenticator app.';

async function ip() {
  return clientIpFrom(await headers());
}

async function auth() {
  try {
    return await getAdminAuth();
  } catch (e) {
    if (e instanceof AdminConfigError) return null;
    throw e;
  }
}

export async function signInAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await auth();
  if (!a) return failed('Admin is not configured on this server.');
  const email = text(fd, 'email').trim();
  const password = text(fd, 'password');
  if (!email || !password) {
    return {
      status: 'error',
      errors: [
        ...(email ? [] : [{ field: 'email', message: 'Enter your email address.' }]),
        ...(password ? [] : [{ field: 'password', message: 'Enter your password.' }]),
      ],
      values: { email },
    };
  }
  const r = await a.signIn({ email, password, ip: await ip() });
  if (!r.ok) return failed(r.code === 'RATE_LIMITED' ? LIMITED : GENERIC, { email });
  redirect(r.next === 'MFA_ENROL' ? '/admin/mfa/setup' : '/admin/mfa');
}

export async function verifyMfaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await auth();
  if (!a) return failed('Admin is not configured on this server.');
  const r = await a.verifySecondFactor({ code: text(fd, 'code'), ip: await ip() });
  if (r.ok) redirect('/admin');
  if (r.code === 'NO_PENDING_SIGN_IN') redirect('/admin/login?expired=1');
  return { status: 'error', errors: [{ field: 'code', message: r.code === 'RATE_LIMITED' ? LIMITED : BAD_CODE }] };
}

export async function confirmEnrolmentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await auth();
  if (!a) return failed('Admin is not configured on this server.');
  // The builtin provider accepts the client address for rate limiting; the shared interface only names `code`.
  const args = { code: text(fd, 'code'), ip: await ip() };
  const r = await a.confirmMfaEnrolment(args);
  if (r.ok) redirect('/admin');
  if (r.code === 'NO_PENDING_SIGN_IN') redirect('/admin/login?expired=1');
  return { status: 'error', errors: [{ field: 'code', message: r.code === 'RATE_LIMITED' ? LIMITED : BAD_CODE }] };
}

export async function signOutAction(): Promise<void> {
  const a = await auth();
  await a?.signOut();
  redirect('/admin/login');
}
