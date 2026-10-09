import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToBag } from '@/components/commerce/add-to-bag';
import { Price } from '@/components/commerce/price';
import { PageShell } from '@/components/page-shell';
import { getStorefront } from '@/lib/commerce';
import type { Product, ProductVariant } from '@/lib/commerce/types';
import { detailsSections, lowStockText, previewCopy, productPage } from '@/lib/content/shop-copy';

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { handle } = await params;
  const product = await getStorefront().product({ handle });
  if (!product) return { title: productPage.notFoundHeading, robots: { index: false, follow: false } };
  return {
    title: `${product.title} — Crater`,
    description: product.description,
    // Sample products stay out of search indexes until verified content replaces them.
    robots: product.sample ? { index: false, follow: false } : undefined,
  };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
/** URL parameter for an option: its lowercase name (`?size=15+mL`, `?shade=Shade+02`). */
const paramName = (optionName: string) => optionName.toLowerCase();

function defaultVariant(product: Product): ProductVariant {
  return product.variants.find((v) => v.availableForSale) ?? product.variants[0];
}

function resolveVariant(product: Product, sp: Awaited<Props['searchParams']>): { variant: ProductVariant; notFound: boolean } {
  const fallback = defaultVariant(product);
  const requested = product.options.map((o) => ({ option: o, value: first(sp[paramName(o.name)]) }));
  if (requested.every((r) => r.value === undefined)) return { variant: fallback, notFound: false };
  const wanted = requested.map(({ option, value }) => ({
    name: option.name,
    value: value ?? fallback.selectedOptions.find((s) => s.name === option.name)?.value ?? '',
  }));
  const match = product.variants.find((v) => wanted.every((w) => v.selectedOptions.some((s) => s.name === w.name && s.value === w.value)));
  return match ? { variant: match, notFound: false } : { variant: fallback, notFound: true };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { handle } = await params;
  const sp = await searchParams;
  const product = await getStorefront().product({ handle });
  if (!product) notFound();

  const { variant, notFound: variantMissing } = resolveVariant(product, sp);
  const image = variant.image ?? product.featuredImage;
  const low = lowStockText(variant.quantityAvailable);
  const anyAvailable = product.variants.some((v) => v.availableForSale);

  const hrefFor = (optionName: string, value: string) => {
    const q = new URLSearchParams();
    for (const o of product.options) {
      q.set(paramName(o.name), o.name === optionName ? value : (variant.selectedOptions.find((s) => s.name === o.name)?.value ?? ''));
    }
    return `/products/${product.handle}?${q.toString()}`;
  };
  const optionAvailable = (optionName: string, value: string) =>
    product.variants.some(
      (v) =>
        v.availableForSale &&
        v.selectedOptions.some((s) => s.name === optionName && s.value === value) &&
        v.selectedOptions.every((s) => s.name === optionName || variant.selectedOptions.some((c) => c.name === s.name && c.value === s.value)),
    );

  const sections = [
    { key: 'benefits', ...detailsSections.benefits, body: <ul className="list-disc space-y-1 pl-5">{product.details.benefits.map((b) => <li key={b}>{b}</li>)}</ul> },
    { key: 'ingredients', ...detailsSections.ingredients, body: <ul className="list-disc space-y-1 pl-5">{product.details.ingredients.map((b) => <li key={b}>{b}</li>)}</ul> },
    { key: 'howToUse', ...detailsSections.howToUse, body: <p>{product.details.howToUse}</p> },
    { key: 'precautions', ...detailsSections.precautions, body: <p>{product.details.precautions}</p> },
  ];

  return (
    <PageShell>
      <article aria-labelledby="product-title" className="page-gutter py-8 md:py-14 lg:py-20">
        <nav aria-label={productPage.breadcrumbLabel} className="mb-6">
          <Link href="/#collection" className="focus-ring text-small inline-flex min-h-11 items-center font-semibold text-espresso underline underline-offset-4">
            <span aria-hidden="true" className="mr-2">←</span>
            {productPage.backToCollection}
          </Link>
        </nav>

        <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
          <figure className="mx-auto w-full max-w-[34rem] lg:mx-0 lg:max-w-none">
            <div className="relative mx-4 aspect-square overflow-hidden rounded-xs bg-forest-deep ring-1 ring-gold-deep/60 ring-offset-[6px] ring-offset-ivory sm:aspect-[4/5] md:mx-0 lg:ring-offset-8">
              {image ? (
                <Image
                  src={image.url}
                  alt={image.altText}
                  width={image.width}
                  height={image.height}
                  sizes="(min-width: 64rem) 560px, 100vw"
                  unoptimized
                  preload
                  className="h-full w-full object-cover object-[50%_60%]"
                />
              ) : null}
            </div>
            {image?.placeholder ? (
              <figcaption className="text-small mt-5 text-walnut">{previewCopy.imagePlaceholderCaption}</figcaption>
            ) : null}
          </figure>

          <div className="flex flex-col gap-6">
            <header>
              {product.sample ? (
                <p className="text-eyebrow w-fit rounded-full border border-gold-deep bg-parchment px-3 py-1 text-espresso">
                  {previewCopy.sampleChip}
                </p>
              ) : null}
              <h1 id="product-title" className="mt-4">
                {product.title}
              </h1>
              <div aria-hidden="true" className="ornament mt-5 w-32" />
            </header>

            <p className="max-w-[48ch] text-walnut">{product.description}</p>

            <p aria-live="polite" aria-atomic="true" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="sr-only">{productPage.priceLabel}: </span>
              <Price money={variant.price} className="text-price" />
              {product.sample ? <span className="text-small text-walnut">{previewCopy.samplePriceLabel}</span> : null}
            </p>

            {variantMissing ? (
              <p role="status" className="text-small rounded-xs border border-gold-deep bg-parchment px-3 py-2">
                {productPage.variantNotFound}
              </p>
            ) : null}

            {product.options.map((option) => (
              <fieldset key={option.id} className="min-w-0">
                <legend className="text-eyebrow text-walnut">{productPage.optionLegend(option.name)}</legend>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {option.optionValues.map((ov) => {
                    const selected = variant.selectedOptions.some((s) => s.name === option.name && s.value === ov.name);
                    const ok = optionAvailable(option.name, ov.name);
                    return (
                      <li key={ov.id}>
                        <Link
                          href={hrefFor(option.name, ov.name)}
                          scroll={false}
                          aria-current={selected ? 'true' : undefined}
                          className={
                            'focus-ring inline-flex min-h-11 flex-col items-center justify-center rounded-xs border px-5 py-1 text-[0.9375rem] font-semibold transition-colors duration-180 motion-reduce:transition-none ' +
                            (selected ? 'border-forest bg-forest text-gold-light ' : 'border-walnut text-espresso hover:bg-parchment ') +
                            (ok ? '' : 'border-dashed')
                          }
                        >
                          <span>{ov.name}</span>
                          {ok ? null : (
                            <span className="text-xs font-normal">
                              <span className="sr-only">, </span>
                              {productPage.optionUnavailableSuffix}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}

            <div aria-live="polite" className="space-y-1">
              {!anyAvailable ? <p className="font-semibold">{productPage.allUnavailable}</p> : null}
              {anyAvailable && !variant.availableForSale ? (
                <p className="font-semibold">{productPage.variantUnavailable(variant.title)}</p>
              ) : null}
              {low ? <p className="text-small font-semibold text-espresso">{low}</p> : null}
            </div>

            <AddToBag
              key={variant.id}
              variantId={variant.id}
              productHandle={product.handle}
              productTitle={product.title}
              variantTitle={variant.title}
              available={variant.availableForSale}
            />
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-x-12 gap-y-10 border-t border-gold-deep/40 pt-10 md:mt-20 md:grid-cols-2">
          <p className="text-small text-walnut md:col-span-2">{detailsSections.sectionNote}</p>
          {sections.map((s) => (
            <section key={s.key} aria-labelledby={`details-${s.key}`}>
              <h2 id={`details-${s.key}`} className="text-3xl md:text-3xl">
                {s.heading}
              </h2>
              <div className="mt-4 text-espresso">{s.body}</div>
              <p className="text-small mt-3 text-walnut">{s.disclaimer}</p>
            </section>
          ))}
        </div>
      </article>
    </PageShell>
  );
}
