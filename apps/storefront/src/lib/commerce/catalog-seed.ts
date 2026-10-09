import type { CatalogSeed, CollectionRecord, ProductRecord, VariantRecord } from './records';
import type { Image } from './types';

/**
 * PREVIEW CATALOG SEED. Derived from the six products in src/lib/content/fixtures.ts
 * (same handles, titles, images, preview copy); a unit test keeps them in sync.
 *
 * Everything here is a marked sample: names, prices, sizes, SKUs, and stock levels are
 * placeholders for development and say nothing about real inventory or approved claims.
 *
 * This file must stay free of runtime imports (type-only imports are erased) so that
 * `node db/seed.mjs` can load it directly with Node's built-in type stripping.
 */

type Spec = {
  id: number;
  handle: string;
  title: string;
  productType: string;
  blurb: string;
  optionName: string;
  /** First entry is the default variant. */
  variants: { id: number; sku: string; title: string; priceMinor: number; quantity: number | null }[];
};

const illustration = (handle: string, title: string): Image => ({
  url: `/products/${handle}/packshot.svg`,
  altText: `Illustration placeholder of the ${title} packaging on a limestone plinth`,
  width: 800,
  height: 1000,
  placeholder: true,
});

const specs: Spec[] = [
  {
    id: 1,
    handle: 'mineral-serum',
    title: 'Mineral Serum',
    productType: 'Serum',
    blurb: 'A lightweight daily serum. Placeholder copy pending approved product claims.',
    optionName: 'Size',
    variants: [
      { id: 1, sku: 'SAMPLE-MSR-30', title: '30 mL', priceMinor: 6800, quantity: 40 },
      { id: 2, sku: 'SAMPLE-MSR-15', title: '15 mL', priceMinor: 4200, quantity: 25 },
    ],
  },
  {
    id: 2,
    handle: 'cloud-cream',
    title: 'Cloud Cream',
    productType: 'Moisturizer',
    blurb: 'A soft daily moisturizer. Placeholder copy pending approved product claims.',
    optionName: 'Size',
    variants: [
      { id: 3, sku: 'SAMPLE-CCR-50', title: '50 mL', priceMinor: 5800, quantity: 30 },
      // Sample low-stock variant used to exercise stock warnings.
      { id: 4, sku: 'SAMPLE-CCR-R50', title: 'Refill 50 mL', priceMinor: 5000, quantity: 2 },
    ],
  },
  {
    id: 3,
    handle: 'gel-cleanser',
    title: 'Gel Cleanser',
    productType: 'Cleanser',
    blurb: 'A gentle gel wash for morning and evening. Placeholder copy.',
    optionName: 'Size',
    variants: [{ id: 5, sku: 'SAMPLE-GCL-150', title: '150 mL', priceMinor: 3400, quantity: 60 }],
  },
  {
    id: 4,
    handle: 'balancing-toner',
    title: 'Balancing Toner',
    productType: 'Toner',
    blurb: 'A watery toner for after cleansing. Placeholder copy.',
    optionName: 'Size',
    variants: [{ id: 6, sku: 'SAMPLE-BTN-120', title: '120 mL', priceMinor: 3800, quantity: 35 }],
  },
  {
    id: 5,
    handle: 'facial-mist',
    title: 'Facial Mist',
    productType: 'Mist',
    blurb: 'A fine mist for use through the day. Placeholder copy.',
    optionName: 'Size',
    variants: [{ id: 7, sku: 'SAMPLE-FMS-100', title: '100 mL', priceMinor: 3200, quantity: 50 }],
  },
  {
    id: 6,
    handle: 'lip-cheek-balm',
    title: 'Lip & Cheek Balm',
    productType: 'Balm',
    blurb: 'A small multi-use balm tin. Placeholder copy.',
    optionName: 'Shade',
    variants: [
      // Sample sold-out variant (quantity 0) used to exercise availability handling.
      { id: 8, sku: 'SAMPLE-LCB-01', title: 'Shade 01', priceMinor: 2400, quantity: 0 },
      { id: 9, sku: 'SAMPLE-LCB-02', title: 'Shade 02', priceMinor: 2400, quantity: 18 },
    ],
  },
];

const buildProduct = (spec: Spec, index: number): ProductRecord => {
  const image = illustration(spec.handle, spec.title);
  const created = new Date(Date.UTC(2026, 0, 5 + index * 3)).toISOString();
  const variants: VariantRecord[] = spec.variants.map((v) => ({
    id: `gid://crater/ProductVariant/${v.id}`,
    sku: v.sku,
    title: v.title,
    priceMinor: v.priceMinor,
    compareAtMinor: null,
    selectedOptions: [{ name: spec.optionName, value: v.title }],
    image,
    quantity: v.quantity,
  }));
  return {
    id: `gid://crater/Product/${spec.id}`,
    handle: spec.handle,
    title: spec.title,
    description: spec.blurb,
    vendor: 'Crater',
    productType: spec.productType,
    tags: ['sample', spec.productType.toLowerCase()],
    options: [
      {
        id: `gid://crater/ProductOption/${spec.id}`,
        name: spec.optionName,
        optionValues: spec.variants.map((v) => ({ id: `gid://crater/ProductOptionValue/${v.id}`, name: v.title })),
      },
    ],
    featuredImage: image,
    images: [image],
    details: {
      benefits: ['Preview copy — pending approved claims'],
      ingredients: ['Ingredient list pending — not yet supplied'],
      howToUse: 'Preview copy — usage directions pending approval.',
      precautions: 'Preview copy — precautions pending approval.',
    },
    sample: true,
    createdAt: created,
    updatedAt: created,
    variants,
  };
};

const collection = (id: number, handle: string, title: string, productHandles: string[]): CollectionRecord => ({
  id: `gid://crater/Collection/${id}`,
  handle,
  title,
  description: 'Sample collection — preview copy.',
  productHandles,
});

export const catalogSeed: CatalogSeed = {
  products: specs.map(buildProduct),
  collections: [
    collection(1, 'serums', 'Serums', ['mineral-serum']),
    collection(2, 'moisturizers', 'Moisturizers', ['cloud-cream']),
    collection(3, 'cleansers', 'Cleansers', ['gel-cleanser']),
    collection(4, 'toners-mists', 'Toners & mists', ['balancing-toner', 'facial-mist']),
    collection(5, 'balms', 'Balms', ['lip-cheek-balm']),
  ],
};
