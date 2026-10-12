import { PendingPage, pendingMetadata } from '@/components/pending-page';

const TITLE = 'Herbal education';

export const metadata = pendingMetadata(TITLE);

export default function Page() {
  return <PendingPage title={TITLE} />;
}
