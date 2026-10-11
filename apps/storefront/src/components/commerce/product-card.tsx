import Image from 'next/image';
import Link from 'next/link';
import type { Product } from '@/lib/commerce/types';
import { previewCopy, productPage } from '@/lib/content/shop-copy';
import { Price } from './price';

export function ProductCard({ product }: { product: Product }) {
  const image = product.featuredImage;
  const titleId = `product-${product.handle}-title`;
  const { minVariantPrice, maxVariantPrice } = product.priceRange;
  const varies = minVariantPrice.amount !== maxVariantPrice.amount;
  const sizes = product.variants.length;

  return (
    <article id={`product-${product.handle}`} aria-labelledby={titleId} className="relative flex h-full flex-col gap-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xs border border-espresso/15 bg-parchment">
        {image ? (
          <Image
            src={image.url}
            alt={image.altText}
            width={image.width}
            height={image.height}
            sizes="(min-width: 80rem) 405px, (min-width: 48rem) 30vw, 45vw"
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="!text-xl">
          {/* Stretched link: the whole card is the target, the title is the accessible name. */}
          <Link
            href={`/products/${product.handle}`}
            className="focus-ring after:absolute after:inset-0 after:content-[''] hover:underline hover:decoration-1 hover:underline-offset-4"
          >
            {product.title}
          </Link>
        </h3>
        <p className="text-small">
          {varies ? <span className="text-walnut">{productPage.fromPrice} </span> : null}
          <Price money={minVariantPrice} className="font-semibold" />
        </p>
        <p className="text-small flex flex-wrap gap-x-2 text-walnut">
          <span>{sizes > 1 ? productPage.sizeCount(sizes) : product.variants[0]?.title}</span>
          {product.sample ? <span>{previewCopy.sampleChip}</span> : null}
          {!product.availableForSale ? <span className="font-semibold text-espresso">{productPage.soldOut}</span> : null}
        </p>
      </div>
    </article>
  );
}
