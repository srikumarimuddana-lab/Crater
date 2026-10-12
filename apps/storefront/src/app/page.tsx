import Link from 'next/link';
import { ProductCard } from '@/components/commerce/product-card';
import {
  CareSection,
  FeaturedCarousel,
  Hero,
  JournalTeaser,
  RitualTiles,
  StoryBlock,
  Ticker,
  ValueTiles,
  ValuesRows,
  type RitualTileData,
} from '@/components/home-sections';
import { PageShell } from '@/components/page-shell';
import { RevealObserver } from '@/components/reveal';
import { SectionHeading } from '@/components/section-heading';
import { getStorefront } from '@/lib/commerce';
import type { Collection, Product, ProductsQueryArgs } from '@/lib/commerce/types';
import { browse, home, productPage } from '@/lib/content/shop-copy';

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

const categoryOf = (href: string) => new URLSearchParams(href.split('#')[0].split('?')[1] ?? '').get('category') ?? undefined;

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

  const hero = all.find((p) => p.handle === home.hero.productHandle) ?? all[0];
  const byHandle = new Map(all.map((p) => [p.handle, p]));
  const featured = home.featured.productHandles.map((h) => byHandle.get(h)).filter((p): p is Product => Boolean(p));

  // Ritual tiles borrow the first product of each collection as a stand-in image until photography exists.
  const ritualTiles: RitualTileData[] = await Promise.all(
    home.shopByRitual.tiles.map(async (tile) => {
      const handle = categoryOf(tile.href);
      let image: Product['featuredImage'] = null;
      if (handle && !loadFailed) {
        try {
          image = (await storefront.products({ first: 1, collection: handle })).nodes[0]?.featuredImage ?? null;
        } catch {
          // The tile still works as a text link.
        }
      }
      return { label: tile.label, description: tile.description, href: tile.href, image };
    }),
  );

  const hrefFor = (handle: string | undefined) => {
    const q = new URLSearchParams();
    if (handle) q.set('category', handle);
    if (activeSort !== 'featured') q.set('sort', activeSort);
    const qs = q.toString();
    return `/${qs ? `?${qs}` : ''}#collection`;
  };

  return (
    <PageShell tone="green">
      <RevealObserver />
      {hero && hero.variants[0] ? <Hero product={hero} /> : null}
      <Ticker />
      <ValueTiles />
      <FeaturedCarousel products={featured} />
      <RitualTiles tiles={ritualTiles} />

      {/* The full collection sits before the owner's story and values, which are still placeholders. */}
      <section id="collection" aria-labelledby="collection-title" className="page-gutter py-16 md:py-24">
        <SectionHeading
          id="collection-title"
          eyebrow={browse.collectionEyebrow}
          title={productPage.shopAll}
          emphasis={browse.collectionEmphasis}
          actions={
            <form method="get" action="/" className="flex items-center gap-2">
              {activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
              <label htmlFor="sort" className="text-small text-grey">
                {browse.sortLabel}
              </label>
              <select
                id="sort"
                name="sort"
                defaultValue={activeSort}
                className="focus-ring min-h-11 rounded-full border border-ink/20 bg-page px-4 text-base"
              >
                {(Object.keys(SORTS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {browse.sortOptions[k]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="focus-ring inline-flex min-h-11 items-center px-2 text-base font-medium text-deep underline decoration-deep/40 underline-offset-4 hover:decoration-deep"
              >
                {browse.sortApply}
              </button>
            </form>
          }
        />
        <p className="text-small mt-3 text-grey" aria-live="polite">
          {loadFailed ? browse.listLoadError : browse.count(shown.length)}
        </p>

        <nav aria-label="Filter products" className="mt-8">
          <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            {[{ handle: undefined, title: 'All products' }, ...categories].map(({ handle, title }) => {
              const current = handle === activeCategory;
              return (
                <li key={title}>
                  <Link
                    href={hrefFor(handle)}
                    aria-current={current ? 'page' : undefined}
                    className={
                      'focus-ring inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-[0.9375rem] font-medium transition-colors motion-reduce:transition-none ' +
                      (current ? 'border-deep bg-deep text-white' : 'border-ink/20 text-ink hover:border-ink hover:bg-cream')
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
          <p className="mt-10 text-grey">{browse.emptyCollection}</p>
        ) : (
          <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 md:gap-y-12 lg:gap-x-8">
            {shown.map((product) => (
              <li key={product.handle}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CareSection />
      <StoryBlock />
      <ValuesRows />
      <JournalTeaser />
    </PageShell>
  );
}
