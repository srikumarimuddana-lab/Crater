import { ButtonLink } from '@/components/ui/button';
import { PageShell } from '@/components/page-shell';
import { productPage } from '@/lib/content/shop-copy';

export default function ProductNotFound() {
  return (
    <PageShell>
      <section aria-labelledby="not-found-title" className="page-gutter flex flex-col items-start gap-5 py-16 md:py-24">
        <h1 id="not-found-title" className="max-w-[18ch] !text-[clamp(2rem,1.6rem+1.4vw,2.75rem)]">
          {productPage.notFoundHeading}
        </h1>
        <p className="max-w-[48ch] text-walnut">{productPage.notFoundBody}</p>
        <ButtonLink href="/#collection" className="mt-4">
          {productPage.notFoundAction}
        </ButtonLink>
      </section>
    </PageShell>
  );
}
