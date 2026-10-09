import { PendingPage, pendingMetadata } from '@/components/pending-page';

const TITLE = 'Journal';

export const metadata = pendingMetadata(TITLE);

export default function Page() {
  return <PendingPage title={TITLE} />;
}
