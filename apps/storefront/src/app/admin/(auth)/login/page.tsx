import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminConfigError, getAdminSession } from '@/lib/admin';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { ConfigProblem, Notice } from '@/components/admin/ui';
import { signInAction } from '../../_actions/auth';
import { one, type SearchParams } from '../../_lib/gate';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  try {
    if (await getAdminSession()) redirect('/admin');
  } catch (e) {
    if (e instanceof AdminConfigError) return <ConfigProblem message={e.message} />;
    throw e;
  }
  return (
    <div className="a-card">
      <h1 className="a-title" style={{ marginBottom: 4 }}>
        Sign in
      </h1>
      <p className="a-muted" style={{ marginBottom: 16 }}>
        Crater staff console. Accounts are invite-only.
      </p>
      {one(sp.expired) ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warning" role="status">
            Your sign-in expired. Start again.
          </Notice>
        </div>
      ) : null}
      <ActionForm action={signInAction} label="Sign in" errorTitle="We could not sign you in">
        <Field name="email" label="Email" type="email" autoComplete="username" inputMode="email" required />
        <Field name="password" label="Password" type="password" autoComplete="current-password" required />
        <Submit pendingText="Signing in…">Continue</Submit>
      </ActionForm>
    </div>
  );
}
