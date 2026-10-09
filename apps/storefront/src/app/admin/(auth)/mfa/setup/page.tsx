import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminAuth } from '@/lib/admin';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { confirmEnrolmentAction } from '../../../_actions/auth';

export const metadata: Metadata = { title: 'Set up your authenticator' };

export default async function MfaSetupPage() {
  const enrolment = await (await getAdminAuth()).beginMfaEnrolment();
  if (!enrolment) redirect('/admin/login?expired=1');
  return (
    <div className="a-card">
      <h1 className="a-title" style={{ marginBottom: 4 }}>
        Set up your authenticator
      </h1>
      <p className="a-muted" style={{ marginBottom: 16 }}>
        Two-step sign-in is required. Add this account to an authenticator app, then enter the code it shows.
      </p>
      <ol style={{ paddingLeft: 20, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <li>
          In your authenticator app choose &ldquo;enter a setup key&rdquo; and type this key.
          <p className="a-code" style={{ marginTop: 6 }} aria-label="Setup key">
            {enrolment.secret}
          </p>
        </li>
        <li>
          Or open this setup link on the device with the app.
          <p className="a-code" style={{ marginTop: 6 }} aria-label="Setup link">
            {enrolment.otpauthUri}
          </p>
        </li>
      </ol>
      <p className="a-hint" style={{ marginBottom: 12 }}>
        Keep the key private. It is shown only during setup.
      </p>
      <ActionForm action={confirmEnrolmentAction} label="Confirm authenticator">
        <Field name="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required />
        <div className="a-row">
          <Submit pendingText="Checking…">Confirm and sign in</Submit>
          <Link href="/admin/login">Cancel</Link>
        </div>
      </ActionForm>
    </div>
  );
}
