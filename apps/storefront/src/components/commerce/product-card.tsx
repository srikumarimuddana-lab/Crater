import Image from 'next/image';
import type { FixtureProduct } from '@/lib/content/fixtures';
import { Price } from './price';

export function ProductCard({ product }: { product: FixtureProduct }) {
  const variant = product.variants[0];
  const titleId = `product-${product.handle}-title`;

  return (
    <article id={`product-${product.handle}`} aria-labelledby={titleId} className="group flex h-full flex-col gap-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xs bg-chalk">
        <Image
          src={product.image.src}
          alt={product.image.alt}
          width={product.image.width}
          height={product.image.height}
          sizes="(min-width: 80rem) 405px, (min-width: 48rem) 30vw, 45vw"
          unoptimized
          className="h-full w-full object-cover transition-transform duration-240 ease-out group-hover:scale-[1.03] group-focus-within:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-within:scale-100"
        />
        {product.image.placeholder ? (
          <span className="absolute inset-x-2 bottom-2 rounded-xs bg-chalk/90 px-2 py-1 text-center text-xs font-semibold text-pine-muted">
            Illustration placeholder
          </span>
        ) : null}
      </div>
      <span className="text-eyebrow w-fit rounded-full border border-pine bg-mineral px-3 py-1 text-pine">
        Sample product
      </span>
      <h3 id={titleId}>{product.title}</h3>
      <p className="text-small text-pine-muted">{product.previewCopy}</p>
      <dl className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <dt className="sr-only">Size</dt>
          <dd className="text-small text-pine-muted">{variant.size}</dd>
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
