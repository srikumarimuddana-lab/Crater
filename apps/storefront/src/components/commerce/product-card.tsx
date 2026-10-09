import Image from 'next/image';
import type { FixtureProduct } from '@/lib/content/fixtures';
import { Price } from './price';

export function ProductCard({ product }: { product: FixtureProduct }) {
  const variant = product.variants[0];
  const titleId = `product-${product.handle}-title`;

  return (
    <article id={`product-${product.handle}`} aria-labelledby={titleId} className="group flex h-full flex-col gap-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xs bg-forest-deep ring-1 ring-gold-deep/40 ring-offset-4 ring-offset-ivory">
        <Image
          src={product.image.src}
          alt={product.image.alt}
          width={product.image.width}
          height={product.image.height}
          sizes="(min-width: 80rem) 405px, (min-width: 48rem) 30vw, 45vw"
          unoptimized
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] group-focus-within:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-within:scale-100"
        />
        {product.image.placeholder ? (
          <span className="absolute inset-x-2 bottom-2 rounded-xs bg-ivory/90 px-2 py-1 text-center text-xs font-semibold text-espresso">
            Illustration placeholder
          </span>
        ) : null}
      </div>
      <span className="text-eyebrow mt-2 w-fit rounded-full border border-gold-deep bg-parchment px-3 py-1 text-espresso">
        Sample product
      </span>
      <h3 id={titleId}>{product.title}</h3>
      <p className="text-small text-walnut">{product.previewCopy}</p>
      <dl className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-gold-deep/30 pt-3">
        <div>
          <dt className="sr-only">Size</dt>
          <dd className="text-small text-walnut">{variant.size}</dd>
        </div>
        <div>
          <dt className="sr-only">Sample price</dt>
          <dd>
            <Price money={variant.price} className="text-price" />
          </dd>
        </div>
      </dl>
    </article>
  );
}
