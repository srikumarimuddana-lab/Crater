import { ButtonLink } from '@/components/ui/button';
import { PageShell } from '@/components/page-shell';
import { recovery } from '@/lib/content/shop-copy';

/** Global 404 for any address that is not a product page (those have their own, closer to the product). */
export default function NotFound() {
  return (
    <PageShell>
      <section aria-labelledby="not-found-title" className="page-gutter flex flex-col items-start gap-5 py-16 md:py-24">
        <h1 id="not-found-title" className="max-w-[18ch] !text-[clamp(2rem,1.6rem+1.4vw,2.75rem)]">
          {recovery.pageNotFoundHeading}
        </h1>
        <p className="max-w-[48ch] text-walnut">{recovery.pageNotFoundBody}</p>
        <ButtonLink href="/#collection" className="mt-4">
          {recovery.pageNotFoundAction}
        </ButtonLink>
      </section>
    </PageShell>
  );
}
