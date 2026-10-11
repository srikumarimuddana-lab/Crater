import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminConfigError, getAdminSession } from '@/lib/admin';
import { commerceMode } from '@/lib/commerce';
import { AdminShell } from '@/components/admin/shell';
import { ConfigProblem } from '@/components/admin/ui';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  let session;
  try {
    session = await getAdminSession();
  } catch (e) {
    if (e instanceof AdminConfigError) return <ConfigProblem message={e.message} />;
    throw e;
  }
  if (!session) redirect('/admin/login');
  const mode = commerceMode();
  return (
    <AdminShell session={session} env={{ testMode: mode !== 'stripe-live', sampleData: mode === 'fixture' }}>
      {children}
    </AdminShell>
  );
}
