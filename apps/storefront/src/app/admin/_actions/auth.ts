'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminConfigError, clientIpFrom, getAdminAuth } from '@/lib/admin';
import { failed, text } from '../_lib/results';
import type { FormState } from '@/components/admin/form-state';

const GENERIC = 'The email or password is not right, or this account cannot sign in. Try again.';
const LIMITED = 'Too many attempts. Wait a little while, then try again.';

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
  redirect('/admin');
}

export async function signOutAction(): Promise<void> {
  const a = await auth();
  await a?.signOut();
  redirect('/admin/login');
}
