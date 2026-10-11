import { PendingPage, pendingMetadata } from '@/components/pending-page';

const TITLE = 'Contact';

export const metadata = pendingMetadata(TITLE);

export default function Page() {
  return <PendingPage title={TITLE} />;
}
