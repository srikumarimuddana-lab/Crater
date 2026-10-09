import Image from 'next/image';
import Link from 'next/link';
import { Price } from '@/components/commerce/price';
import { ProductCard } from '@/components/commerce/product-card';
import { PreviewBanner } from '@/components/preview-banner';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { ButtonLink } from '@/components/ui/button';
import { categories, fixtureProducts, heroProduct, isProductCategory } from '@/lib/content/fixtures';

type HomeProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { category } = await searchParams;
  const activeCategory = isProductCategory(category) ? category : undefined;
  const products = activeCategory ? fixtureProducts.filter((p) => p.category === activeCategory) : fixtureProducts;
  const hero = heroProduct;
  const heroVariant = hero.variants[0];

  return (
    <>
      <PreviewBanner />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <section
          aria-labelledby="hero-title"
          className="page-gutter grid grid-cols-1 gap-x-6 gap-y-6 pt-6 pb-12 md:grid-cols-2 md:grid-rows-[auto_1fr] md:gap-y-6 md:py-16 lg:grid-cols-12 lg:gap-x-8 lg:py-24"
        >
          <div className="md:col-start-1 md:row-start-1 md:self-start lg:col-span-5 lg:pt-16">
            <p className="text-eyebrow text-pine-muted">Serum · Sample product</p>
            <h1 id="hero-title" className="mt-3">
              {hero.title}
            </h1>
          </div>

          <figure className="md:col-start-2 md:row-span-2 md:row-start-1 w-full lg:col-span-6 lg:col-start-7 lg:max-w-[32.5rem] lg:justify-self-end">
            <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-xs bg-chalk md:aspect-[4/5]">
              <Image
                src={hero.image.src}
                alt={hero.image.alt}
                width={hero.image.width}
                height={hero.image.height}
                sizes="(min-width: 80rem) 520px, (min-width: 48rem) 45vw, 100vw"
                unoptimized
                preload
                className="h-full w-full object-cover object-[50%_60%]"
              />
            </div>
            {hero.image.placeholder ? (
              <figcaption className="text-small mt-2 text-pine-muted">Illustration placeholder — not a product photo.</figcaption>
            ) : null}
          </figure>

          <div className="flex flex-col gap-5 md:col-start-1 md:row-start-2 md:self-start lg:col-span-5">
            <p className="max-w-[34ch] text-pine-muted">{hero.previewCopy}</p>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-small text-pine-muted">{heroVariant.size}</span>
              <Price money={heroVariant.price} className="text-price" />
              <span className="text-small text-pine-muted">Sample price</span>
            </p>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
              <ButtonLink href={`#product-${hero.handle}`}>Shop the serum</ButtonLink>
              <ButtonLink href="#collection" variant="secondary">
                View the collection
              </ButtonLink>
            </div>
          </div>
        </section>

        <section id="collection" aria-labelledby="collection-title" className="page-gutter py-12 md:py-16 lg:py-24">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <h2 id="collection-title">Shop the collection</h2>
            <p className="text-small text-pine-muted" aria-live="polite">
              {activeCategory
                ? `Showing ${products.length} of ${fixtureProducts.length} sample products.`
                : `${fixtureProducts.length} sample products for layout preview.`}
            </p>
          </div>

          <nav aria-label="Filter products" className="mt-6">
            <ul className="flex flex-wrap gap-2">
              {[{ slug: undefined, label: 'All products' }, ...categories].map(({ slug, label }) => {
                const current = slug === activeCategory;
                return (
                  <li key={label}>
                    <Link
                      href={slug ? `/?category=${slug}#collection` : '/#collection'}
                      aria-current={current ? 'page' : undefined}
                      className={
                        'focus-ring inline-flex min-h-11 items-center rounded-full border border-pine px-4 text-[0.9375rem] font-semibold ' +
                        (current ? 'bg-pine text-porcelain' : 'text-pine hover:bg-mineral')
                      }
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 lg:gap-x-8">
            {products.map((product) => (
              <li key={product.handle}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
