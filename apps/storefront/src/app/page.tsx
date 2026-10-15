import Link from 'next/link';
import { ProductCard } from '@/components/commerce/product-card';
import { RemedyHero, RemedyStory, RemedyFeature, RemedyMoments, RemedyWhy, RemedyJournal, RemedyCommunity } from '@/components/remedy-home';
import { Routine } from '@/components/remedy-motion';
import { homeSections } from '@/lib/content/cms/presentation';
import { getJournalArticles } from '@/lib/content/cms/journal';
import { getPageMetadata } from '@/lib/content/cms/metadata';
import { getPageContent } from '@/lib/content/cms';
import { PageShell } from '@/components/page-shell';
import { getStorefront } from '@/lib/commerce';
import type { Collection, Product, ProductsQueryArgs } from '@/lib/commerce/types';
import { browse } from '@/lib/content/shop-copy';

export async function generateMetadata() { return getPageMetadata('home'); }

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
  const { category, sort, preview, q, after } = await searchParams;
  const [c, articles] = await Promise.all([getPageContent('home', preview), getJournalArticles(preview)]);
  const activeSort: SortKey = isSort(sort) ? sort : 'featured';
  const storefront = getStorefront();

  let categories: Collection[] = [];
  let shown: Product[] = [];
  let activeCategory: string | undefined;
  let loadFailed = false;
  let nextCursor: string | null = null;
  const query = typeof q === 'string' ? q.trim().slice(0,100) : undefined;
  try {
    categories = await storefront.collections();
    activeCategory = categories.find((c) => c.handle === category)?.handle;
    const connection = await storefront.products({ first: 24, query, after: typeof after === 'string' ? after : undefined, collection: activeCategory, ...SORTS[activeSort] });
    shown = connection.nodes;
    nextCursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } catch {
    loadFailed = true;
  }

  const hrefFor = (handle: string | undefined, cursor?: string | null) => {
    const q = new URLSearchParams();
    if (query) q.set('q',query);
    if (cursor) q.set('after',cursor);
    if (handle) q.set('category', handle);
    if (activeSort !== 'featured') q.set('sort', activeSort);
    const qs = q.toString();
    return `/${qs ? `?${qs}` : ''}#collection`;
  };

  const collection = (
        <section id="collection" aria-labelledby="collection-title" className="page-gutter border-t border-espresso/15 py-12 md:py-16 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div>
              <h2 id="collection-title" className="!text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)]">
                {c.collectionTitle}
              </h2>
              <p className="mt-2 text-walnut">{c.collectionText}</p>
              <p className="text-small mt-1 text-walnut" aria-live="polite">
                {loadFailed ? browse.listLoadError : browse.count(shown.length)}
              </p>
            </div>

            <form method="get" action="/#collection" className="flex items-center gap-2">
              {query ? <input type="hidden" name="q" value={query} /> : null}
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

<form action="/#collection" method="get" className="r-search"><label htmlFor="product-search">{c.searchLabel}</label><input id="product-search" name="q" type="search" placeholder={c.searchPlaceholder} defaultValue={typeof q === 'string' ? q : ''} maxLength={100} /><button type="submit">{c.searchButton} ↗</button></form>
          <nav aria-label="Filter products" className="mt-6 border-b border-espresso/15">
            <ul className="-mx-5 flex gap-x-6 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {[{ handle: undefined, title: c.allProductsLabel }, ...categories].map(({ handle, title }) => {
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
          <div className="mt-10 flex gap-6">{after ? <Link className="r-pill" href={hrefFor(activeCategory)}>{c.firstPageLabel}</Link> : null}{nextCursor ? <Link className="r-pill" href={hrefFor(activeCategory,nextCursor)}>{c.moreProductsLabel} ↗</Link> : null}</div>
        </section>
  );
  const sections = {
    story:<RemedyStory c={c}/>,ritual:<Routine c={c}/>,feature:<RemedyFeature c={c}/>,collection,
    moments:<RemedyMoments c={c}/>,why:<RemedyWhy c={c}/>,journal:<RemedyJournal c={c} articles={articles}/>,community:<RemedyCommunity c={c}/>,
  };
  return <PageShell preview={preview}><div className="remedy-home"><RemedyHero c={c}/>{homeSections(c).map(key=><div key={key} className="r-home-section" data-section={key}>{sections[key]}</div>)}</div></PageShell>;
}
