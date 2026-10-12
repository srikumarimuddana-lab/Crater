import Image from 'next/image';
import Link from 'next/link';
import { Price } from '@/components/commerce/price';
import { ProductCard } from '@/components/commerce/product-card';
import { MapleLeaf } from '@/components/maple-leaf';
import { Emphasis, SectionHeading } from '@/components/section-heading';
import { ArrowLink, ButtonLink } from '@/components/ui/button';
import type { Product } from '@/lib/commerce/types';
import { brand } from '@/lib/content/brand';
import { home, previewCopy } from '@/lib/content/shop-copy';
import { CarouselControls } from './carousel-controls';

/**
 * Nuda-style hero on the green gradient: Canadian tags, the stacked two-line headline (second word fades into
 * amber), lead, a white pill button and an arrow link; the packshot overlaps on the right with its price caption.
 * DOM order is head, media, caption at every width; the h1 reserves two lines on small screens.
 */
export function Hero({ product }: { product: Product }) {
  const variant = product.variants[0];
  const image = product.featuredImage;
  const { hero } = home;
  return (
    <section aria-labelledby="hero-title" className="hero-band hero-texture on-green relative overflow-hidden text-white">
      <div className="page-gutter relative grid grid-cols-1 gap-y-10 py-12 md:grid-cols-12 md:items-start md:py-16 lg:py-24">
        <div className="relative z-0 md:col-span-8 md:col-start-1 md:row-start-1 md:pt-4">
          <ul aria-label="Canadian company" className="text-small flex min-h-8 flex-wrap gap-2 font-semibold md:flex-nowrap">
            {brand.canadianTags.map((tag, i) => (
              <li key={tag} className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/15 px-3">
                {i === 0 ? <MapleLeaf className="size-4 text-leaf" /> : null}
                {tag}
              </li>
            ))}
          </ul>
          <h1 id="hero-title" className="hero-title mt-6 max-md:min-h-[1.9em]">
            <span className="hero-slide-left block">{hero.headlineWords[0]}</span>{' '}
            <span className="hero-slide-right text-gradient-amber block">{hero.headlineWords[1]}</span>
          </h1>
          <p className="hero-fade mt-6 max-w-[42ch] text-lg text-white/90 md:max-w-[38ch]">{hero.subline}</p>
          <div className="hero-fade mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
            <ButtonLink href={hero.primaryAction.href} variant="light">
              {hero.primaryAction.label}
            </ButtonLink>
            <ArrowLink href={hero.secondaryAction.href} tone="green">
              {hero.secondaryAction.label}
            </ArrowLink>
          </div>
        </div>

        <figure className="relative z-10 md:col-span-5 md:col-start-8 md:row-start-1 md:mt-2">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card bg-cream shadow-[0_32px_64px_-28px_rgb(0_0_0/0.45)] md:aspect-[4/5]">
            {image ? (
              <Image
                src={image.url}
                alt={image.altText}
                width={image.width}
                height={image.height}
                sizes="(min-width: 80rem) 560px, (min-width: 48rem) 42vw, 100vw"
                unoptimized
                preload
                className="h-full w-full object-cover object-[50%_60%]"
              />
            ) : null}
          </div>
          <figcaption className="text-small mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-white/85">
            <Link
              href={`/products/${product.handle}`}
              className="focus-ring inline-flex min-h-11 items-center font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white"
            >
              {product.title}
            </Link>
            {variant ? (
              <>
                <span>{variant.title}</span>
                <Price money={variant.price} className="font-bold text-white" />
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

/** Scrolling band under the hero (Nuda): the client's offerings and Canadian identity. The second copy only closes the loop. */
export function Ticker() {
  const row = (dup: boolean) => (
    <ul aria-hidden={dup || undefined} className={`flex ${dup ? 'ticker-dup' : ''}`}>
      {home.ticker.map((item) => (
        <li key={item} className="flex items-center gap-5 whitespace-nowrap px-5 font-display text-lg font-semibold">
          {item}
          <span aria-hidden="true" className="text-amber-light">
            ✦
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <aside aria-label="Our range" className="ticker bg-ink py-3 text-white">
      <div className="ticker-track">
        {row(false)}
        {row(true)}
      </div>
    </aside>
  );
}

/** Three true facts in a hairline strip. */
export function ValueTiles() {
  return (
    <section aria-label="Store information" className="border-b border-ink/10">
      <ul className="page-gutter grid gap-x-10 md:grid-cols-3">
        {home.valueTiles.map((tile) => (
          <li key={tile.title} className="flex gap-3 py-5 md:py-6">
            <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-amber" />
            <div>
              <p className="font-semibold">{tile.title}</p>
              <p className="text-small mt-0.5 max-w-[40ch] text-grey">{tile.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Horizontal scroll-snap list. A plain scrollable list without JavaScript; buttons are added once hydrated.
 * The first product is a wider feature card; the list keeps one item per product.
 */
export function FeaturedCarousel({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  const { featured } = home;
  return (
    <section aria-labelledby="featured-title" className="py-16 md:py-24">
      <div className="page-gutter">
        <div className="reveal">
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
        </div>
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

/** Four collections numbered 01–04 on the pale mint tint. The numerals and arrows are decorative. */
export function RitualTiles({ tiles }: { tiles: RitualTileData[] }) {
  const { shopByRitual } = home;
  return (
    <section aria-labelledby="ritual-title" className="bg-mint-pale py-16 md:py-24">
      <div className="page-gutter">
        <div className="reveal">
          <SectionHeading id="ritual-title" eyebrow={shopByRitual.eyebrow} title={shopByRitual.title} emphasis={shopByRitual.emphasis} />
        </div>
        <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6">
          {tiles.map((tile, i) => (
            <li key={tile.label} className="reveal">
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
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : null}
                  <span aria-hidden="true" className="numeral absolute left-4 top-4">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </span>
                <span className="mt-4 flex items-baseline justify-between gap-3">
                  <span className="font-display text-xl font-semibold group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">
                    {tile.label}
                  </span>
                  <span aria-hidden="true" className="arrow text-deep">
                    →
                  </span>
                </span>
                <span className="text-small mt-1 block text-grey">{tile.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Coaching and education cards plus the quiz banner (the client's services; pages are pending). */
export function CareSection() {
  const { care } = home;
  return (
    <section aria-labelledby="care-title" className="py-16 md:py-24">
      <div className="page-gutter">
        <div className="reveal">
          <SectionHeading id="care-title" eyebrow={care.eyebrow} title={care.title} emphasis={care.emphasis} />
        </div>
        <ul className="mt-10 grid gap-6 md:grid-cols-2">
          {care.cards.map((card) => (
            <li key={card.href} className="reveal flex flex-col gap-4 rounded-card bg-cream p-7 md:p-9">
              <h3>{card.title}</h3>
              <p className="max-w-[48ch] text-grey">{card.body}</p>
              <ArrowLink href={card.href}>{card.action}</ArrowLink>
            </li>
          ))}
        </ul>
        <div className="on-green reveal mt-6 rounded-card bg-deep px-7 py-9 text-white md:flex md:items-center md:justify-between md:gap-10 md:px-10">
          <div>
            <p className="eyebrow">{care.quiz.eyebrow}</p>
            <h3 className="mt-3 !text-2xl md:!text-3xl">{care.quiz.title}</h3>
            <p className="mt-2 max-w-[48ch] text-white/85">{care.quiz.body}</p>
          </div>
          <ButtonLink href={care.quiz.href} variant="light" className="mt-6 shrink-0 md:mt-0">
            {care.quiz.action}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

/** Founder's story placeholder on the blush band ("a little pink is fine"). */
export function StoryBlock() {
  const { story } = home;
  return (
    <section aria-labelledby="story-title" className="bg-blush">
      <div className="page-gutter grid gap-x-12 gap-y-6 py-16 md:grid-cols-12 md:py-24">
        <div className="reveal md:col-span-5">
          <p className="eyebrow">{story.eyebrow}</p>
          <h2 id="story-title" className="mt-4">
            <Emphasis text={story.title} word={story.emphasis} />
          </h2>
        </div>
        <div className="reveal md:col-span-6 md:col-start-7 md:pt-14">
          <p className="text-lead max-w-[48ch]">{story.body}</p>
          <p className="mt-5">
            <span className="text-small inline-flex min-h-7 items-center rounded-full border border-ink/15 bg-page px-3 text-grey">{story.pendingNote}</span>
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
        <div className="reveal">
          <SectionHeading id="values-title" eyebrow={values.eyebrow} title={values.title} emphasis={values.emphasis} />
        </div>
        <ul className="mt-10 border-b border-ink/10">
          {values.rows.map((row, i) => (
            <li key={row.title} className="reveal grid gap-x-8 gap-y-2 border-t border-ink/10 py-7 md:grid-cols-12 md:items-baseline">
              <span aria-hidden="true" className="numeral md:col-span-1">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="font-display text-2xl font-semibold md:col-span-4">{row.title}</p>
              <p className="max-w-[56ch] text-grey md:col-span-6 md:col-start-7">{row.body}</p>
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
