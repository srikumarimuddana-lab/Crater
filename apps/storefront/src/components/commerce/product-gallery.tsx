import Image from 'next/image';
import type { Image as ProductImage } from '@/lib/commerce/types';
import { previewCopy, productPage } from '@/lib/content/shop-copy';

/**
 * Product images for N >= 1. A single server-rendered list, restyled by breakpoint:
 * - lg and up: images stacked in the 7/12 column.
 * - below lg: one horizontal CSS scroll-snap strip. Each slide carries its own static "1 / 2" label, so the
 *   position indicator needs no JavaScript. Optional thumbnail links jump to the slides by anchor.
 * Every slide reserves its aspect ratio; only the first image is eager and preloaded.
 */
export function ProductGallery({ images, idPrefix = 'gallery' }: { images: ProductImage[]; idPrefix?: string }) {
  if (images.length === 0) return null;
  const many = images.length > 1;
  const slideId = (i: number) => `${idPrefix}-${i + 1}`;

  return (
    <section aria-label={productPage.galleryLabel} className="lg:col-span-7">
      <ul
        className={
          many
            ? 'flex gap-3 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:block lg:space-y-4 lg:overflow-visible'
            : ''
        }
      >
        {images.map((image, i) => (
          <li
            key={image.url}
            id={slideId(i)}
            className={many ? 'relative w-full shrink-0 snap-center scroll-mt-4 lg:w-auto lg:shrink' : 'relative'}
          >
            <div className="relative aspect-square overflow-hidden rounded-xs border border-espresso/15 bg-parchment sm:aspect-[4/5]">
              <Image
                src={image.url}
                alt={image.altText}
                width={image.width}
                height={image.height}
                sizes="(min-width: 64rem) 700px, 100vw"
                unoptimized
                {...(i === 0 ? { preload: true } : { loading: 'lazy' as const })}
                className="h-full w-full object-cover object-[50%_60%]"
              />
            </div>
            {many ? (
              <p className="text-small absolute bottom-3 left-3 rounded-xs bg-ivory/90 px-2 py-0.5 tabular-nums text-espresso lg:hidden">
                <span className="sr-only">{productPage.galleryImage}: </span>
                {i + 1} / {images.length}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {many ? (
        <ul aria-label={productPage.galleryThumbnails} className="mt-3 flex gap-2 lg:hidden">
          {images.map((image, i) => (
            <li key={image.url}>
              <a
                href={`#${slideId(i)}`}
                aria-label={productPage.galleryJump(i + 1, images.length)}
                className="focus-ring block size-14 overflow-hidden rounded-xs border border-espresso/30 bg-parchment hover:border-espresso"
              >
                <Image src={image.url} alt="" width={112} height={140} unoptimized loading="lazy" className="h-full w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {images.some((i) => i.placeholder) ? (
        <p className="text-small mt-3 text-walnut">{previewCopy.imagePlaceholderCaption}</p>
      ) : null}
    </section>
  );
}
