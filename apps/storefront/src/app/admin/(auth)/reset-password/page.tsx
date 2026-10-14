import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { acceptPasswordAction } from '../../_actions/staff';
import { one, type SearchParams } from '../../_lib/gate';

export const metadata: Metadata = { title: 'Set password', referrer: 'no-referrer' };
export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const token = one((await searchParams).token) ?? '';
  return <div className="a-card">
    <h1 className="a-title">Set your password</h1>
    <p className="a-muted">Choose at least 12 characters. This link can be used once.</p>
    <ActionForm action={acceptPasswordAction} label="Set staff password">
      <input name="token" type="hidden" value={token} />
      <Field name="password" label="New password" type="password" autoComplete="new-password" maxLength={200} required />
      <Field name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" maxLength={200} required />
      <Submit pendingText="Saving…">Set password</Submit>
    </ActionForm>
    <p><Link href="/admin/forgot-password">Request a new reset link</Link></p>
  </div>;
}
