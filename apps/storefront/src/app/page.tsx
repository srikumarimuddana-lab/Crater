import Image from 'next/image';
import Link from 'next/link';
import { Price } from '@/components/commerce/price';
import { ProductCard } from '@/components/commerce/product-card';
import { PreviewBanner } from '@/components/preview-banner';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { ButtonLink } from '@/components/ui/button';
import { commerceMode, getStorefront } from '@/lib/commerce';
import type { Collection, Product, ProductsQueryArgs } from '@/lib/commerce/types';
import { browse, previewCopy, productPage } from '@/lib/content/shop-copy';

const HERO_HANDLE = 'mineral-serum';

type SortKey = keyof typeof browse.sortOptions;
const SORTS: Record<SortKey, Pick<ProductsQueryArgs, 'sortKey' | 'reverse'>> = {
  featured: {},
  title: { sortKey: 'TITLE' },
  'price-asc': { sortKey: 'PRICE' },
  'price-desc': { sortKey: 'PRICE', reverse: true },
};
const isSort = (v: unknown): v is SortKey => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SORTS, v);

type HomeProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { category, sort } = await searchParams;
  const activeSort: SortKey = isSort(sort) ? sort : 'featured';
  const storefront = getStorefront();

  let all: Product[] = [];
  let categories: Collection[] = [];
  let shown: Product[] = [];
  let activeCategory: string | undefined;
  let loadFailed = false;
  try {
    [all, categories] = await Promise.all([storefront.products({ first: 50 }).then((c) => c.nodes), storefront.collections()]);
    activeCategory = categories.find((c) => c.handle === category)?.handle;
    shown = (await storefront.products({ first: 50, collection: activeCategory, ...SORTS[activeSort] })).nodes;
  } catch {
    loadFailed = true;
  }

  const hero = all.find((p) => p.handle === HERO_HANDLE) ?? all[0];
  const heroVariant = hero?.variants[0];
  const heroImage = hero?.featuredImage;

  const hrefFor = (handle: string | undefined) => {
    const q = new URLSearchParams();
    if (handle) q.set('category', handle);
    if (activeSort !== 'featured') q.set('sort', activeSort);
    const qs = q.toString();
    return `/${qs ? `?${qs}` : ''}#collection`;
  };

  return (
    <>
      <PreviewBanner mode={commerceMode()} />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {hero && heroVariant ? (
          <section aria-labelledby="hero-title" className="bg-parchment">
            <div className="page-gutter grid grid-cols-1 gap-x-10 gap-y-6 py-8 md:grid-cols-12 md:grid-rows-[auto_1fr] md:py-14 lg:py-20">
              <div className="md:col-span-5 md:row-start-1 md:self-start">
                <p className="text-small text-walnut">{previewCopy.sampleChip}</p>
                <h1 id="hero-title" className="mt-3 !text-[clamp(2.25rem,1.4rem+3vw,4rem)]">
                  {hero.title}
                </h1>
                <p className="mt-4 max-w-[34ch] text-walnut">{hero.description}</p>
              </div>

              <figure className="md:col-span-7 md:col-start-6 md:row-span-2 md:row-start-1">
                <div className="relative aspect-square w-full overflow-hidden rounded-xs bg-forest-deep md:aspect-[4/5]">
                  {heroImage ? (
                    <Image
                      src={heroImage.url}
                      alt={heroImage.altText}
                      width={heroImage.width}
                      height={heroImage.height}
                      sizes="(min-width: 80rem) 700px, (min-width: 48rem) 55vw, 100vw"
                      unoptimized
                      preload
                      className="h-full w-full object-cover object-[50%_60%]"
                    />
                  ) : null}
                </div>
                {heroImage?.placeholder ? (
                  <figcaption className="text-small mt-3 text-walnut">Illustration placeholder — not a product photo.</figcaption>
                ) : null}
              </figure>

              <div className="flex flex-col gap-5 md:col-span-5 md:row-start-2 md:self-start">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-small text-walnut">{heroVariant.title}</span>
                  <Price money={heroVariant.price} className="text-price" />
                  <span className="text-small text-walnut">Sample price</span>
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <ButtonLink href={`/products/${hero.handle}`} variant="primary">
                    Shop the serum
                  </ButtonLink>
                  <ButtonLink href="#collection" variant="secondary">
                    View the collection
                  </ButtonLink>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section id="collection" aria-labelledby="collection-title" className="page-gutter py-12 md:py-16 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div>
              <h2 id="collection-title" className="!text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)]">
                {productPage.shopAll}
              </h2>
              <p className="text-small mt-1 text-walnut" aria-live="polite">
                {loadFailed ? browse.listLoadError : browse.count(shown.length)}
              </p>
            </div>

            <form method="get" action="/" className="flex items-center gap-2">
              {activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
              <label htmlFor="sort" className="text-small text-walnut">
                {browse.sortLabel}
              </label>
              <select
                id="sort"
                name="sort"
                defaultValue={activeSort}
                className="focus-ring min-h-11 rounded-xs border border-espresso/40 bg-ivory px-3 text-base"
              >
                {(Object.keys(SORTS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {browse.sortOptions[k]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="focus-ring inline-flex min-h-11 items-center px-2 text-base font-semibold underline underline-offset-4"
              >
                {browse.sortApply}
              </button>
            </form>
          </div>

          <nav aria-label="Filter products" className="mt-6 border-b border-espresso/15">
            <ul className="flex flex-wrap gap-x-6">
              {[{ handle: undefined, title: 'All products' }, ...categories].map(({ handle, title }) => {
                const current = handle === activeCategory;
                return (
                  <li key={title}>
                    <Link
                      href={hrefFor(handle)}
                      aria-current={current ? 'page' : undefined}
                      className={
                        'focus-ring inline-flex min-h-11 items-center border-b-2 text-base transition-colors motion-reduce:transition-none ' +
                        (current ? 'border-forest font-semibold text-forest' : 'border-transparent text-espresso hover:border-espresso/40')
                      }
                    >
                      {title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {!loadFailed && shown.length === 0 ? (
            <p className="mt-10 text-walnut">{browse.emptyCollection}</p>
          ) : (
            <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 lg:gap-x-8">
              {shown.map((product) => (
                <li key={product.handle}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
