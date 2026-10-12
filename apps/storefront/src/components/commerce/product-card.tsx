import Image from 'next/image';
import Link from 'next/link';
import type { Product } from '@/lib/commerce/types';
import { previewCopy, productPage } from '@/lib/content/shop-copy';
import { Price } from './price';

/** Flat tile card: image on the cream tint, serif name, price, sizes. `feature` widens the image (first card of a row). */
export function ProductCard({ product, feature = false }: { product: Product; feature?: boolean }) {
  const image = product.featuredImage;
  const titleId = `product-${product.handle}-title`;
  const { minVariantPrice, maxVariantPrice } = product.priceRange;
  const varies = minVariantPrice.amount !== maxVariantPrice.amount;
  const sizes = product.variants.length;

  return (
    <article id={`product-${product.handle}`} aria-labelledby={titleId} className="group relative flex h-full flex-col gap-3">
      <div className={`relative overflow-hidden rounded-card bg-cream ${feature ? 'aspect-[5/4] md:aspect-[8/5]' : 'aspect-[4/5]'}`}>
        {image ? (
          <Image
            src={image.url}
            alt={image.altText}
            width={image.width}
            height={image.height}
            sizes={feature ? '(min-width: 80rem) 640px, (min-width: 48rem) 60vw, 90vw' : '(min-width: 80rem) 405px, (min-width: 48rem) 30vw, 45vw'}
            unoptimized
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="!text-xl">
          {/* Stretched link: the whole card is the target, the title is the accessible name. */}
          <Link
            href={`/products/${product.handle}`}
            className="focus-ring after:absolute after:inset-0 after:rounded-card after:content-[''] hover:underline hover:decoration-1 hover:underline-offset-4"
          >
            {product.title}
          </Link>
        </h3>
        <p className="text-small">
          {varies ? <span className="text-grey">{productPage.fromPrice} </span> : null}
          <Price money={minVariantPrice} className="font-semibold" />
        </p>
        <p className="text-small flex flex-wrap gap-x-2 text-grey">
          <span>{sizes > 1 ? productPage.sizeCount(sizes) : product.variants[0]?.title}</span>
          {product.sample ? <span>{previewCopy.sampleChip}</span> : null}
          {!product.availableForSale ? <span className="font-semibold text-ink">{productPage.soldOut}</span> : null}
        </p>
      </div>
    </article>
  );
}
