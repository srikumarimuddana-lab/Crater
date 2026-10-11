import Link from 'next/link';
import { ProductCard } from '@/components/commerce/product-card';
import {
  FeaturedCarousel,
  Hero,
  JournalTeaser,
  RitualTiles,
  StoryBlock,
  ValueTiles,
  ValuesRows,
  type RitualTileData,
} from '@/components/home-sections';
import { PageShell } from '@/components/page-shell';
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
    <PageShell>
      {hero && hero.variants[0] ? <Hero product={hero} /> : null}
      <ValueTiles />
      <FeaturedCarousel products={featured} />
      <RitualTiles tiles={ritualTiles} />
      <StoryBlock />
      <ValuesRows />
      <JournalTeaser />

        <section id="collection" aria-labelledby="collection-title" className="page-gutter border-t border-espresso/15 py-12 md:py-16 lg:py-20">
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
            <ul className="-mx-5 flex gap-x-6 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {[{ handle: undefined, title: 'All products' }, ...categories].map(({ handle, title }) => {
                const current = handle === activeCategory;
                return (
                  <li key={title}>
                    <Link
                      href={hrefFor(handle)}
                      aria-current={current ? 'page' : undefined}
                      className={
                        'focus-ring inline-flex min-h-11 items-center whitespace-nowrap border-b-2 text-base transition-colors motion-reduce:transition-none ' +
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
    </PageShell>
  );
}
