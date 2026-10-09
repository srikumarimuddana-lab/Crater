import { ButtonLink } from '@/components/ui/button';
import { PageShell } from '@/components/page-shell';
import { productPage } from '@/lib/content/shop-copy';

export default function ProductNotFound() {
  return (
    <PageShell>
      <section aria-labelledby="not-found-title" className="page-gutter flex flex-col items-center gap-5 py-20 text-center md:py-28">
        <h1 id="not-found-title" className="max-w-[18ch]">
          {productPage.notFoundHeading}
        </h1>
        <div aria-hidden="true" className="ornament w-40" />
        <p className="max-w-[48ch] text-walnut">{productPage.notFoundBody}</p>
        <ButtonLink href="/#collection" className="mt-4">
          {productPage.notFoundAction}
        </ButtonLink>
      </section>
    </PageShell>
  );
}
