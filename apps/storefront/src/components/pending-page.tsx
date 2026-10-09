import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { ButtonLink } from '@/components/ui/button';
import { pendingPage } from '@/lib/content/shop-copy';

/** Metadata for a placeholder page: titled, and kept out of search indexes. */
export function pendingMetadata(title: string): Metadata {
  return { title: `${title} — Crater`, robots: { index: false, follow: false } };
}

/** Shared "Content pending" template for pages the owner has not supplied yet. Never invents content. */
export function PendingPage({ title }: { title: string }) {
  return (
    <PageShell>
      <section aria-labelledby="pending-title" className="page-gutter py-14 md:py-20">
        <h1 id="pending-title" className="!text-[clamp(2rem,1.6rem+1.4vw,2.75rem)]">
          {title}
        </h1>
        <p className="mt-4 font-semibold">{pendingPage.status}</p>
        <p className="mt-2 max-w-[48ch] text-walnut">{pendingPage.body}</p>
        <ButtonLink href="/#collection" variant="primary" className="mt-8">
          {pendingPage.action}
        </ButtonLink>
      </section>
    </PageShell>
  );
}
