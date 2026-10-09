import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToBag } from '@/components/commerce/add-to-bag';
import { ProductGallery } from '@/components/commerce/product-gallery';
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
  // The variant's own image leads when it has one; the rest follow in catalog order.
  const lead = variant.image ?? product.featuredImage;
  const gallery = lead
    ? [lead, ...product.images.filter((i) => i.url !== lead.url)]
    : product.images;
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

  const list = (items: string[]) => <ul className="list-disc space-y-1 pl-5">{items.map((b) => <li key={b}>{b}</li>)}</ul>;
  const sections = [
    { key: 'benefits', ...detailsSections.benefits, body: list(product.details.benefits) },
    { key: 'howToUse', ...detailsSections.howToUse, body: <p>{product.details.howToUse}</p> },
    { key: 'ingredients', ...detailsSections.ingredients, body: list(product.details.ingredients) },
    { key: 'precautions', ...detailsSections.precautions, body: <p>{product.details.precautions}</p> },
    { key: 'shippingReturns', ...detailsSections.shippingReturns, body: <p>{detailsSections.shippingReturns.body}</p> },
  ];

  const collections = await getStorefront().collections();
  const category = collections.find((c) => c.title.toLowerCase().startsWith(product.productType.toLowerCase()));
  const priceFor = (optionName: string, value: string) =>
    product.variants.find(
      (v) =>
        v.selectedOptions.some((s) => s.name === optionName && s.value === value) &&
        v.selectedOptions.every((s) => s.name === optionName || variant.selectedOptions.some((c) => c.name === s.name && c.value === s.value)),
    )?.price;

  return (
    <PageShell>
      <article aria-labelledby="product-title" className="page-gutter pt-4 pb-24 md:pt-6 lg:pb-20">
        <nav aria-label={productPage.breadcrumbLabel} className="text-small">
          <ol className="flex flex-wrap items-center gap-x-2 text-walnut">
            <li>
              <Link href="/#collection" className="focus-ring inline-flex min-h-11 items-center underline underline-offset-4">
                {productPage.shopAll}
              </Link>
            </li>
            {category ? (
              <li className="flex items-center gap-x-2">
                <span aria-hidden="true">/</span>
                <Link
                  href={`/?category=${category.handle}#collection`}
                  className="focus-ring inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  {category.title}
                </Link>
              </li>
            ) : null}
          </ol>
        </nav>

        <div className="mt-2 grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-12">
          <ProductGallery images={gallery} />

          <div className="flex flex-col gap-6 lg:col-span-5 lg:sticky lg:top-6 lg:self-start">
            <header>
              {product.sample ? <p className="text-small text-walnut">{previewCopy.sampleChip}</p> : null}
              <h1 id="product-title" className="mt-1 !text-[clamp(2rem,1.6rem+1.4vw,2.75rem)]">
                {product.title}
              </h1>
              <p className="mt-3 max-w-[48ch] text-walnut">{product.description}</p>
              <p aria-live="polite" aria-atomic="true" className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="sr-only">{productPage.priceLabel}: </span>
                <Price money={variant.price} className="text-price" />
                {product.sample ? <span className="text-small text-walnut">{previewCopy.samplePriceLabel}</span> : null}
              </p>
            </header>

            {variantMissing ? (
              <p role="status" className="text-small rounded-xs border border-espresso/40 bg-parchment px-3 py-2">
                {productPage.variantNotFound}
              </p>
            ) : null}

            {product.options.map((option) => (
              <fieldset key={option.id} className="min-w-0">
                <legend className="text-small font-semibold">
                  {option.name}: <span className="font-normal text-walnut">{variant.selectedOptions.find((s) => s.name === option.name)?.value}</span>
                  <span className="sr-only">. {productPage.optionLegend(option.name)}</span>
                </legend>
                <ul className="mt-3 grid grid-cols-2 gap-2">
                  {option.optionValues.map((ov) => {
                    const selected = variant.selectedOptions.some((s) => s.name === option.name && s.value === ov.name);
                    const ok = optionAvailable(option.name, ov.name);
                    const price = priceFor(option.name, ov.name);
                    return (
                      <li key={ov.id}>
                        <Link
                          href={hrefFor(option.name, ov.name)}
                          scroll={false}
                          aria-current={selected ? 'true' : undefined}
                          className={
                            'focus-ring flex min-h-14 flex-col justify-center rounded-xs border px-4 py-2 text-base transition-colors motion-reduce:transition-none ' +
                            (selected ? 'border-2 border-forest bg-ivory ' : 'border-espresso/30 hover:border-espresso ') +
                            (ok ? '' : 'text-walnut ')
                          }
                        >
                          <span className={`font-semibold ${ok ? '' : 'line-through'}`}>{ov.name}</span>
                          <span className="text-small text-walnut">
                            {ok ? null : (
                              <>
                                {productPage.soldOut}
                                {price ? <span aria-hidden="true"> · </span> : null}
                              </>
                            )}
                            {price ? <Price money={price} /> : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}

            <div aria-live="polite" className="space-y-1 empty:hidden">
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
              price={variant.price}
            />

            <div className="border-t border-espresso/15">
              {sections.map((sec) => (
                <details key={sec.key} className="group border-b border-espresso/15">
                  <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {sec.heading}
                    <span aria-hidden="true" className="text-xl leading-none group-open:hidden">+</span>
                    <span aria-hidden="true" className="hidden text-xl leading-none group-open:inline">−</span>
                  </summary>
                  <div className="pb-5">
                    {sec.body}
                    <p className="text-small mt-3 text-walnut">{sec.disclaimer}</p>
                  </div>
                </details>
              ))}
            </div>
            <p className="text-small -mt-3 text-walnut">{detailsSections.sectionNote}</p>

            <dl aria-label={productPage.keyFacts} className="text-small grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
              <dt className="font-semibold">{productPage.sizeFact}</dt>
              <dd className="text-walnut">{variant.title}</dd>
              <dt className="font-semibold">{productPage.categoryFact}</dt>
              <dd className="text-walnut">{product.productType}</dd>
            </dl>
          </div>
        </div>
      </article>
    </PageShell>
  );
}
