/**
 * PREVIEW FIXTURES — sample products for Phase 1 layout work only.
 *
 * Every name, price, size, and line of copy below is placeholder content written
 * for the preview. None of it is an approved product, claim, price, or stock
 * level, and nothing here can create an order. Replace with verified brand and
 * commerce data before launch (see docs/design-brief.md).
 */

export const FIXTURE_MODE = true as const;

/** Decimal string + ISO currency; never a float used as a checkout authority. */
export type Money = {
  amount: string;
  currencyCode: string;
};

export type ProductImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Placeholder illustrations must stay marked until real photography exists. */
  placeholder: boolean;
};

export type ProductVariant = {
  id: string;
  title: string;
  size: string;
  price: Money;
};

export type ProductCategory = 'serums' | 'moisturizers' | 'cleansers' | 'toners-mists' | 'balms';

export type FixtureProduct = {
  handle: string;
  title: string;
  category: ProductCategory;
  /** Preview copy only — not an approved benefit or claim. */
  previewCopy: string;
  image: ProductImage;
  variants: [ProductVariant, ...ProductVariant[]];
  sample: true;
};

export const categories: { slug: ProductCategory; label: string }[] = [
  { slug: 'serums', label: 'Serums' },
  { slug: 'moisturizers', label: 'Moisturizers' },
  { slug: 'cleansers', label: 'Cleansers' },
  { slug: 'toners-mists', label: 'Toners & mists' },
  { slug: 'balms', label: 'Balms' },
];

const CAD = (amount: string): Money => ({ amount, currencyCode: 'CAD' });

const illustration = (handle: string, title: string): ProductImage => ({
  src: `/products/${handle}/packshot.svg`,
  alt: `Illustration placeholder of the ${title} packaging on a limestone plinth`,
  width: 800,
  height: 1000,
  placeholder: true,
});

export const fixtureProducts: FixtureProduct[] = [
  {
    handle: 'mineral-serum',
    title: 'Mineral Serum',
    category: 'serums',
    previewCopy: 'A lightweight daily serum. Placeholder copy pending approved product claims.',
    image: illustration('mineral-serum', 'Mineral Serum'),
    variants: [{ id: 'fixture-variant-mineral-serum-30', title: '30 mL', size: '30 mL', price: CAD('68.00') }],
    sample: true,
  },
  {
    handle: 'cloud-cream',
    title: 'Cloud Cream',
    category: 'moisturizers',
    previewCopy: 'A soft daily moisturizer. Placeholder copy pending approved product claims.',
    image: illustration('cloud-cream', 'Cloud Cream'),
    variants: [{ id: 'fixture-variant-cloud-cream-50', title: '50 mL', size: '50 mL', price: CAD('58.00') }],
    sample: true,
  },
  {
    handle: 'gel-cleanser',
    title: 'Gel Cleanser',
    category: 'cleansers',
    previewCopy: 'A gentle gel wash for morning and evening. Placeholder copy.',
    image: illustration('gel-cleanser', 'Gel Cleanser'),
    variants: [{ id: 'fixture-variant-gel-cleanser-150', title: '150 mL', size: '150 mL', price: CAD('34.00') }],
    sample: true,
  },
  {
    handle: 'balancing-toner',
    title: 'Balancing Toner',
    category: 'toners-mists',
    previewCopy: 'A watery toner for after cleansing. Placeholder copy.',
    image: illustration('balancing-toner', 'Balancing Toner'),
    variants: [{ id: 'fixture-variant-balancing-toner-120', title: '120 mL', size: '120 mL', price: CAD('38.00') }],
    sample: true,
  },
  {
    handle: 'facial-mist',
    title: 'Facial Mist',
    category: 'toners-mists',
    previewCopy: 'A fine mist for use through the day. Placeholder copy.',
    image: illustration('facial-mist', 'Facial Mist'),
    variants: [{ id: 'fixture-variant-facial-mist-100', title: '100 mL', size: '100 mL', price: CAD('32.00') }],
    sample: true,
  },
  {
    handle: 'lip-cheek-balm',
    title: 'Lip & Cheek Balm',
    category: 'balms',
    previewCopy: 'A small multi-use balm tin. Placeholder copy.',
    image: illustration('lip-cheek-balm', 'Lip & Cheek Balm'),
    variants: [{ id: 'fixture-variant-lip-cheek-balm-15', title: '15 g', size: '15 g', price: CAD('24.00') }],
    sample: true,
  },
];

export const heroProduct = fixtureProducts[0];

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === 'string' && categories.some((c) => c.slug === value);
}

/** Display formatting only; the amount string stays the source of truth. */
export function formatMoney({ amount, currencyCode }: Money, locale = 'en-CA'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(Number(amount));
}
