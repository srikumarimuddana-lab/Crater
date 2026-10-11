import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { verifyMfaAction } from '../../_actions/auth';

export const metadata: Metadata = { title: 'Authenticator code' };

export default function MfaPage() {
  return (
    <div className="a-card">
      <h1 className="a-title" style={{ marginBottom: 4 }}>
        Authenticator code
      </h1>
      <p className="a-muted" style={{ marginBottom: 16 }}>
        Enter the 6-digit code from your authenticator app.
      </p>
      <ActionForm action={verifyMfaAction} label="Authenticator code" errorTitle="We could not sign you in">
        <Field name="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required autoFocus />
        <div className="a-row">
          <Submit pendingText="Checking…">Sign in</Submit>
          <Link href="/admin/login">Start over</Link>
        </div>
      </ActionForm>
    </div>
  );
}
