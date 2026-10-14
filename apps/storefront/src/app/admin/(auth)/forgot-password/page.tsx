import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { requestPasswordResetAction } from '../../_actions/staff';

export const metadata: Metadata = { title: 'Reset password' };
export default function ForgotPasswordPage() {
  return <div className="a-card">
    <h1 className="a-title">Reset password</h1>
    <p className="a-muted">Enter your staff email. Reset links expire in 30 minutes.</p>
    <ActionForm action={requestPasswordResetAction} label="Request password reset">
      <Field name="email" label="Email" type="email" autoComplete="username" required />
      <Submit pendingText="Requesting…">Request reset link</Submit>
    </ActionForm>
    <p><Link href="/admin/login">Back to sign in</Link></p>
  </div>;
}
