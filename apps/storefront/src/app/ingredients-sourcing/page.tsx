import { PendingPage, pendingMetadata } from '@/components/pending-page';

const TITLE = 'Ingredients & sourcing';

export const metadata = pendingMetadata(TITLE);

export default function Page() {
  return <PendingPage title={TITLE} />;
}
