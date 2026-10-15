import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin';

/** Legacy bookmarks remain safe after password-only authentication replaces MFA. */
export default async function LegacyMfaPage() {
  redirect((await getAdminSession()) ? '/admin' : '/admin/login');
}
