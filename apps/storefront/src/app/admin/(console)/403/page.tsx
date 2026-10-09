import type { Metadata } from 'next';
import { Forbidden } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Not allowed' };
export default function Page() {
  return <Forbidden />;
}
