import Image from 'next/image';
import Link from 'next/link';
import { Price } from '@/components/commerce/price';
import { ProductCard } from '@/components/commerce/product-card';
import { ButtonLink } from '@/components/ui/button';
import type { Product } from '@/lib/commerce/types';
import { home, previewCopy } from '@/lib/content/shop-copy';
import { CarouselControls } from './carousel-controls';

const h2Class = '!text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)]';

export function Hero({ product }: { product: Product }) {
  const variant = product.variants[0];
  const image = product.featuredImage;
  return (
    <section aria-labelledby="hero-title" className="bg-parchment">
      <div className="page-gutter grid grid-cols-1 items-center gap-x-12 gap-y-8 py-10 md:grid-cols-12 md:py-14 lg:py-20">
        <div className="md:col-span-6 lg:col-span-5">
          <h1 id="hero-title" className="!text-[clamp(2.25rem,1.4rem+3vw,4rem)]">
            {home.hero.headline}
          </h1>
          <p className="mt-4 max-w-[36ch] text-lg text-walnut">{home.hero.subline}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={home.hero.primaryAction.href} variant="primary">
              {home.hero.primaryAction.label}
            </ButtonLink>
            <ButtonLink href={home.hero.secondaryAction.href} variant="secondary">
              {home.hero.secondaryAction.label}
            </ButtonLink>
          </div>
        </div>

        <figure className="md:col-span-6 lg:col-span-7">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xs bg-forest-deep md:aspect-[5/4] lg:aspect-[3/2]">
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
          <figcaption className="text-small mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-walnut">
            <Link
              href={`/products/${product.handle}`}
              className="focus-ring inline-flex min-h-11 items-center font-semibold text-espresso underline underline-offset-4"
            >
              {product.title}
            </Link>
            {variant ? (
              <>
                <span>{variant.title}</span>
                <Price money={variant.price} className="font-semibold text-espresso" />
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

export function ValueTiles() {
  return (
    <section aria-label="Store information" className="border-b border-espresso/15">
      <ul className="page-gutter grid md:grid-cols-3 md:divide-x md:divide-espresso/15 max-md:divide-y max-md:divide-espresso/15">
        {home.valueTiles.map((tile) => (
          <li key={tile.title} className="py-6 md:px-8 md:first:pl-0 md:last:pr-0">
            <p className="font-semibold">{tile.title}</p>
            <p className="text-small mt-1 max-w-[40ch] text-walnut">{tile.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Horizontal scroll-snap list. A plain scrollable list without JavaScript; buttons are added once hydrated. */
export function FeaturedCarousel({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  const { featured } = home;
  return (
    <section aria-labelledby="featured-title" className="py-12 md:py-16 lg:py-20">
      <div className="page-gutter">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h2 id="featured-title" className={h2Class}>
            {featured.title}
          </h2>
          <div className="flex items-center gap-4">
            <Link href="/#collection" className="focus-ring inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
              {featured.viewAll}
            </Link>
            <CarouselControls targetId="featured-list" previousLabel={featured.previousLabel} nextLabel={featured.nextLabel} />
          </div>
        </div>
        <ul
          id="featured-list"
          className="featured-scroller -mx-5 mt-6 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-4 md:-mx-8 md:scroll-px-8 md:gap-6 md:px-8 xl:-mx-20 xl:scroll-px-20 xl:px-20"
        >
          {products.map((product) => (
            <li
              key={product.handle}
              className="w-[72%] flex-none snap-start sm:w-[calc((100%-1rem)/2.4)] md:w-[calc((100%-3rem)/3.2)] lg:w-[calc((100%-4.5rem)/4)]"
            >
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export type RitualTileData = { label: string; description: string; href: string; image: Product['featuredImage'] };

export function RitualTiles({ tiles }: { tiles: RitualTileData[] }) {
  return (
    <section aria-labelledby="ritual-title" className="border-t border-espresso/15 py-12 md:py-16 lg:py-20">
      <div className="page-gutter">
        <h2 id="ritual-title" className={h2Class}>
          {home.shopByRitual.title}
        </h2>
        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
          {tiles.map((tile) => (
            <li key={tile.label}>
              <Link href={tile.href} className="focus-ring group block">
                <span className="relative block aspect-[4/5] overflow-hidden rounded-xs border border-espresso/15 bg-parchment">
                  {tile.image ? (
                    <Image
                      src={tile.image.url}
                      alt=""
                      width={tile.image.width}
                      height={tile.image.height}
                      sizes="(min-width: 64rem) 300px, 45vw"
                      unoptimized
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
                    />
                  ) : null}
                </span>
                <span className="mt-3 block font-display text-xl group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">
                  {tile.label}
                </span>
                <span className="text-small block text-walnut">{tile.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function StoryBlock() {
  return (
    <section aria-labelledby="story-title" className="on-dark bg-forest text-ivory">
      <div className="page-gutter grid gap-x-12 gap-y-4 py-14 md:grid-cols-12 md:py-20">
        <h2 id="story-title" className="text-ivory md:col-span-5">
          {home.story.title}
        </h2>
        <div className="md:col-span-6 md:col-start-7">
          <p className="max-w-[48ch] text-lg text-ivory/90">{home.story.body}</p>
          <p className="text-small mt-4 text-gold-light">{home.story.pendingNote}</p>
        </div>
      </div>
    </section>
  );
}

export function ValuesRows() {
  return (
    <section aria-labelledby="values-title" className="py-12 md:py-16 lg:py-20">
      <div className="page-gutter">
        <h2 id="values-title" className={h2Class}>
          {home.values.title}
        </h2>
        <ul className="mt-8 border-b border-espresso/15">
          {home.values.rows.map((row) => (
            <li key={row.title} className="grid gap-x-12 gap-y-1 border-t border-espresso/15 py-6 md:grid-cols-12">
              <p className="font-display text-2xl md:col-span-4">{row.title}</p>
              <p className="max-w-[56ch] text-walnut md:col-span-7 md:col-start-6">{row.body}</p>
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
    <section aria-labelledby="journal-title" className="page-gutter py-12">
      <h2 id="journal-title" className={h2Class}>
        {home.journal.title}
      </h2>
      <Link href="/journal" className="focus-ring mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
        {home.journal.viewAll}
      </Link>
    </section>
  );
}
