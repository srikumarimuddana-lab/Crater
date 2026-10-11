import Image from 'next/image';
import Link from 'next/link';
import { Price } from '@/components/commerce/price';
import { ProductCard } from '@/components/commerce/product-card';
import { Emphasis, SectionHeading } from '@/components/section-heading';
import { ArrowLink, ButtonLink } from '@/components/ui/button';
import type { Product } from '@/lib/commerce/types';
import { home, previewCopy } from '@/lib/content/shop-copy';
import { CarouselControls } from './carousel-controls';

export function Hero({ product }: { product: Product }) {
  const variant = product.variants[0];
  const image = product.featuredImage;
  return (
    <section aria-labelledby="hero-title" className="bg-page">
      <div className="page-gutter grid grid-cols-1 gap-x-12 gap-y-8 py-10 md:grid-cols-12 md:items-start md:py-16 lg:py-24">
        <div className="md:col-span-6 lg:col-span-5 lg:pt-4">
          <p className="text-small font-medium text-ink-soft">{home.hero.eyebrow}</p>
          <h1 id="hero-title" className="mt-4 !text-[clamp(2.5rem,1.5rem+3.4vw,4.5rem)] max-md:min-h-[3.15em]">
            <Emphasis text={home.hero.headline} word={home.hero.emphasis} />
          </h1>
          <p className="text-lead mt-5 max-w-[36ch]">{home.hero.subline}</p>
          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
            <ButtonLink href={home.hero.primaryAction.href} variant="primary">
              {home.hero.primaryAction.label}
            </ButtonLink>
            <ArrowLink href={home.hero.secondaryAction.href}>{home.hero.secondaryAction.label}</ArrowLink>
          </div>
        </div>

        <figure className="md:col-span-6 lg:col-span-7">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card bg-surface md:aspect-[5/4] lg:aspect-[3/2]">
            {image ? (
              <Image
                src={image.url}
                alt={image.altText}
                width={image.width}
                height={image.height}
                sizes="(min-width: 80rem) 700px, (min-width: 48rem) 50vw, 100vw"
                unoptimized
                preload
                className="h-full w-full object-cover object-[50%_60%]"
              />
            ) : null}
          </div>
          <figcaption className="text-small mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ink-soft">
            <Link
              href={`/products/${product.handle}`}
              className="focus-ring inline-flex min-h-11 items-center font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              {product.title}
            </Link>
            {variant ? (
              <>
                <span>{variant.title}</span>
                <Price money={variant.price} className="font-semibold text-ink" />
                <span>{previewCopy.samplePriceLabel}</span>
              </>
            ) : null}
            {image?.placeholder ? <span className="w-full">{previewCopy.imagePlaceholderCaption}</span> : null}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/** Three true facts in a hairline strip (Elise's badge row, without the claims). */
export function ValueTiles() {
  return (
    <section aria-label="Store information" className="border-y border-ink/10">
      <ul className="page-gutter grid gap-x-10 md:grid-cols-3">
        {home.valueTiles.map((tile) => (
          <li key={tile.title} className="flex gap-3 py-5 md:py-6">
            <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-bronze-soft" />
            <div>
              <p className="font-medium">{tile.title}</p>
              <p className="text-small mt-0.5 max-w-[40ch] text-ink-soft">{tile.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Horizontal scroll-snap list. A plain scrollable list without JavaScript; buttons are added once hydrated.
 * The first product is a wider feature card (Elise's collection layout); the list keeps one item per product.
 */
export function FeaturedCarousel({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  const { featured } = home;
  return (
    <section aria-labelledby="featured-title" className="py-16 md:py-24">
      <div className="page-gutter">
        <SectionHeading
          id="featured-title"
          eyebrow={featured.eyebrow}
          title={featured.title}
          emphasis={featured.emphasis}
          actions={
            <>
              <ArrowLink href="/#collection">{featured.viewAll}</ArrowLink>
              <CarouselControls targetId="featured-list" previousLabel={featured.previousLabel} nextLabel={featured.nextLabel} />
            </>
          }
        />
        <ul
          id="featured-list"
          className="featured-scroller -mx-5 mt-10 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-4 md:-mx-8 md:scroll-px-8 md:gap-6 md:px-8 xl:-mx-20 xl:scroll-px-20 xl:px-20"
        >
          {products.map((product, i) => (
            <li
              key={product.handle}
              className={
                i === 0
                  ? 'w-[86%] flex-none snap-start sm:w-[70%] md:w-[calc(((100%-3rem)/3.2)*2+1.5rem)] lg:w-[calc(((100%-4.5rem)/4)*2+1.5rem)]'
                  : 'w-[72%] flex-none snap-start sm:w-[calc((100%-1rem)/2.4)] md:w-[calc((100%-3rem)/3.2)] lg:w-[calc((100%-4.5rem)/4)]'
              }
            >
              <ProductCard product={product} feature={i === 0} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export type RitualTileData = { label: string; description: string; href: string; image: Product['featuredImage'] };

/** Four collections numbered 01–04 on a pale sage band. The numerals and arrows are decorative. */
export function RitualTiles({ tiles }: { tiles: RitualTileData[] }) {
  const { shopByRitual } = home;
  return (
    <section aria-labelledby="ritual-title" className="bg-sage py-16 md:py-24">
      <div className="page-gutter">
        <SectionHeading id="ritual-title" eyebrow={shopByRitual.eyebrow} title={shopByRitual.title} emphasis={shopByRitual.emphasis} />
        <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6">
          {tiles.map((tile, i) => (
            <li key={tile.label}>
              <Link href={tile.href} className="link-arrow focus-ring group block rounded-card">
                <span className="relative block aspect-[4/5] overflow-hidden rounded-card bg-page">
                  {tile.image ? (
                    <Image
                      src={tile.image.url}
                      alt=""
                      width={tile.image.width}
                      height={tile.image.height}
                      sizes="(min-width: 64rem) 300px, 45vw"
                      unoptimized
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : null}
                  <span aria-hidden="true" className="numeral absolute left-4 top-4">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </span>
                <span className="mt-4 flex items-baseline justify-between gap-3">
                  <span className="font-display text-xl group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">
                    {tile.label}
                  </span>
                  <span aria-hidden="true" className="arrow text-moss">
                    →
                  </span>
                </span>
                <span className="text-small mt-1 block text-ink-soft">{tile.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Owner's story placeholder on a peach-cream band (no dark band). */
export function StoryBlock() {
  const { story } = home;
  return (
    <section aria-labelledby="story-title" className="bg-warm">
      <div className="page-gutter grid gap-x-12 gap-y-6 py-16 md:grid-cols-12 md:py-24">
        <div className="md:col-span-5">
          <p className="eyebrow">{story.eyebrow}</p>
          <h2 id="story-title" className="mt-4">
            <Emphasis text={story.title} word={story.emphasis} />
          </h2>
        </div>
        <div className="md:col-span-6 md:col-start-7 md:pt-14">
          <p className="text-lead max-w-[48ch]">{story.body}</p>
          <p className="mt-5">
            <span className="inline-flex min-h-7 items-center rounded-full border border-ink/15 px-3 text-small text-ink-soft">
              {story.pendingNote}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

export function ValuesRows() {
  const { values } = home;
  return (
    <section aria-labelledby="values-title" className="py-16 md:py-24">
      <div className="page-gutter">
        <SectionHeading id="values-title" eyebrow={values.eyebrow} title={values.title} emphasis={values.emphasis} />
        <ul className="mt-10 border-b border-ink/10">
          {values.rows.map((row, i) => (
            <li key={row.title} className="grid gap-x-8 gap-y-2 border-t border-ink/10 py-7 md:grid-cols-12 md:items-baseline">
              <span aria-hidden="true" className="numeral md:col-span-1">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="font-display text-2xl md:col-span-4">{row.title}</p>
              <p className="max-w-[56ch] text-ink-soft md:col-span-6 md:col-start-7">{row.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Hidden (not rendered, not focusable) until `home.journal.enabled` is true. */
export function JournalTeaser() {
  if (!home.journal.enabled) return null;
  return (
    <section aria-labelledby="journal-title" className="page-gutter py-16">
      <h2 id="journal-title">{home.journal.title}</h2>
      <ArrowLink href="/journal" className="mt-4">
        {home.journal.viewAll}
      </ArrowLink>
    </section>
  );
}
