import type { CatalogSeed, CollectionRecord, ProductRecord, VariantRecord } from './records';
import type { Image } from './types';

/**
 * PREVIEW CATALOG SEED: nine sample herbal products and eight collections, as specified in
 * docs/catalogue.md (the skincare seed it replaces is retired; see db/seed.mjs for how old rows go).
 *
 * Everything here is a marked sample: names, prices, sizes, SKUs, stock levels and ingredient lists
 * are placeholders for development. They say nothing about real inventory, formulas, licensing or
 * approved claims. No health, efficacy or disease claims, reviews, ratings or certifications belong here.
 *
 * Numeric ids start at 11 on purpose: the retired skincare rows used 1 to 9, and a cart line or order
 * that still points at one of those ids must never resolve to a different product.
 *
 * This file must stay free of runtime imports (type-only imports are erased) so that
 * `node db/seed.mjs` can load it directly with Node's built-in type stripping.
 */

type Spec = {
  id: number;
  handle: string;
  title: string;
  /** The format: Tincture, Single herb, Body oil or Kit. */
  productType: string;
  /** One neutral sentence; used as the description and as "What it is". */
  whatItIs: string;
  /** Botanical names, nothing else. Empty for the kit, which lists its contents. */
  botanicals: string[];
  /** Tinctures carry an extraction-base placeholder until the owner confirms the base. */
  extractionBasePending: boolean;
  optionName: string;
  /** First entry is the default variant. */
  variants: { id: number; sku: string; title: string; priceMinor: number; quantity: number | null }[];
};

const illustration = (handle: string, title: string): Image => ({
  url: `/products/${handle}/packshot.svg`,
  altText: `Illustration placeholder: ${title}`,
  width: 800,
  height: 1000,
  placeholder: true,
});

const detailIllustration = (handle: string, title: string): Image => ({
  url: `/products/${handle}/detail.svg`,
  altText: `Illustration placeholder: ${title} texture`,
  width: 800,
  height: 1000,
  placeholder: true,
});

const LICENCE_NOTE = '(sample list, pending licensed formula)';

const specs: Spec[] = [
  {
    id: 11,
    handle: 'lemon-balm-oat-extract',
    title: 'Lemon Balm & Oat Extract',
    productType: 'Tincture',
    whatItIs: 'A liquid herbal extract in a 30 mL or 60 mL amber glass dropper bottle, with a gentle herbal taste.',
    botanicals: ['Melissa officinalis leaf', 'Avena sativa milky seed'],
    extractionBasePending: true,
    optionName: 'Size',
    variants: [
      { id: 11, sku: 'SAMPLE-LBO-30', title: '30 mL', priceMinor: 2400, quantity: 40 },
      { id: 12, sku: 'SAMPLE-LBO-60', title: '60 mL', priceMinor: 3800, quantity: 25 },
    ],
  },
  {
    id: 12,
    handle: 'peppermint-ginger-extract',
    title: 'Peppermint & Ginger Extract',
    productType: 'Tincture',
    whatItIs: 'A liquid herbal extract in an amber glass dropper bottle, with a warm, minty taste.',
    botanicals: ['Mentha x piperita leaf', 'Zingiber officinale root'],
    extractionBasePending: true,
    optionName: 'Size',
    variants: [
      { id: 13, sku: 'SAMPLE-PG-30', title: '30 mL', priceMinor: 2200, quantity: 35 },
      { id: 14, sku: 'SAMPLE-PG-60', title: '60 mL', priceMinor: 3600, quantity: 20 },
    ],
  },
  {
    id: 13,
    handle: 'chamomile-linden-extract',
    title: 'Chamomile & Linden Extract',
    productType: 'Tincture',
    whatItIs: 'A liquid herbal extract in an amber glass dropper bottle, with a floral, lightly sweet taste.',
    botanicals: ['Matricaria chamomilla flower', 'Tilia cordata flower'],
    extractionBasePending: true,
    optionName: 'Size',
    variants: [
      { id: 15, sku: 'SAMPLE-CL-30', title: '30 mL', priceMinor: 2400, quantity: 30 },
      // The one sample SOLD OUT variant (quantity 0), used to exercise availability handling.
      { id: 16, sku: 'SAMPLE-CL-60', title: '60 mL', priceMinor: 3800, quantity: 0 },
    ],
  },
  {
    id: 14,
    handle: 'hawthorn-rose-hip-extract',
    title: 'Hawthorn & Rose Hip Extract',
    productType: 'Tincture',
    whatItIs: 'A liquid herbal extract in an amber glass dropper bottle, with a tart, fruity taste.',
    botanicals: ['Crataegus monogyna berry', 'Rosa canina fruit'],
    extractionBasePending: true,
    optionName: 'Size',
    variants: [
      // The one sample LOW STOCK variant (quantity 2), used to exercise stock warnings.
      { id: 17, sku: 'SAMPLE-HRH-30', title: '30 mL', priceMinor: 2600, quantity: 2 },
      { id: 18, sku: 'SAMPLE-HRH-60', title: '60 mL', priceMinor: 4200, quantity: 15 },
    ],
  },
  {
    id: 15,
    handle: 'dandelion-root-extract',
    title: 'Dandelion Root Extract',
    productType: 'Single herb',
    whatItIs: 'A single-herb liquid extract in an amber glass dropper bottle, with an earthy, bitter taste.',
    botanicals: ['Taraxacum officinale root'],
    extractionBasePending: true,
    optionName: 'Size',
    variants: [
      { id: 19, sku: 'SAMPLE-DR-30', title: '30 mL', priceMinor: 2200, quantity: 30 },
      { id: 20, sku: 'SAMPLE-DR-60', title: '60 mL', priceMinor: 3600, quantity: 18 },
    ],
  },
  {
    id: 16,
    handle: 'nettle-leaf-extract',
    title: 'Nettle Leaf Extract',
    productType: 'Single herb',
    whatItIs: 'A single-herb liquid extract in an amber glass dropper bottle, with a green, grassy taste.',
    botanicals: ['Urtica dioica leaf'],
    extractionBasePending: true,
    optionName: 'Size',
    variants: [
      { id: 21, sku: 'SAMPLE-NL-30', title: '30 mL', priceMinor: 2200, quantity: 28 },
      { id: 22, sku: 'SAMPLE-NL-60', title: '60 mL', priceMinor: 3600, quantity: 16 },
    ],
  },
  {
    id: 17,
    handle: 'calendula-almond-body-oil',
    title: 'Calendula & Almond Body Oil',
    productType: 'Body oil',
    whatItIs: 'A light body oil with a soft floral scent, in a 100 mL amber glass bottle with a pump.',
    botanicals: ['Calendula officinalis flower', 'Prunus dulcis oil'],
    extractionBasePending: false,
    optionName: 'Size',
    variants: [{ id: 23, sku: 'SAMPLE-CAB-100', title: '100 mL', priceMinor: 3000, quantity: 22 }],
  },
  {
    id: 18,
    handle: 'lavender-jojoba-body-oil',
    title: 'Lavender & Jojoba Body Oil',
    productType: 'Body oil',
    whatItIs: 'A light body oil with a lavender scent, in a 100 mL amber glass bottle with a pump.',
    botanicals: ['Lavandula angustifolia flower', 'Simmondsia chinensis seed oil'],
    extractionBasePending: false,
    optionName: 'Size',
    variants: [{ id: 24, sku: 'SAMPLE-LJB-100', title: '100 mL', priceMinor: 3200, quantity: 20 }],
  },
  {
    id: 19,
    handle: 'evening-ritual-kit',
    title: 'Evening Ritual Kit',
    productType: 'Kit',
    whatItIs: 'Three sample bottles packed together in a kit box, for gifting or trying the range.',
    botanicals: [],
    extractionBasePending: false,
    optionName: 'Size',
    variants: [{ id: 25, sku: 'SAMPLE-ER-SET3', title: 'Set of 3', priceMinor: 7400, quantity: 12 }],
  },
];

/** Sample kit contents (owner to confirm): products 1 and 3 in 30 mL and product 8 in 100 mL. */
const KIT_CONTENTS: { handle: string; size: string }[] = [
  { handle: 'lemon-balm-oat-extract', size: '30 mL' },
  { handle: 'chamomile-linden-extract', size: '30 mL' },
  { handle: 'lavender-jojoba-body-oil', size: '100 mL' },
];

const ingredientsOf = (spec: Spec): string[] => {
  if (spec.productType === 'Kit') {
    const lines = KIT_CONTENTS.map(({ handle, size }) => {
      const item = specs.find((s) => s.handle === handle)!;
      return `${item.title}, ${size}: ${item.botanicals.join(', ')}`;
    });
    return [...lines, LICENCE_NOTE];
  }
  return [
    ...spec.botanicals,
    // OWNER: the extraction base (alcohol and water) is not confirmed and must not be published yet.
    ...(spec.extractionBasePending ? ['Extraction base: pending owner confirmation'] : []),
    LICENCE_NOTE,
  ];
};

const buildProduct = (spec: Spec, index: number): ProductRecord => {
  const image = illustration(spec.handle, spec.title);
  const created = new Date(Date.UTC(2026, 0, 5 + index * 3)).toISOString();
  const variants: VariantRecord[] = spec.variants.map((v) => ({
    id: `gid://crater/ProductVariant/${v.id}`,
    sku: v.sku,
    title: v.title,
    priceMinor: v.priceMinor,
    compareAtMinor: null,
    // SAMPLE cost for development only (about 35% of price, rounded to 5 cents); the owner enters real costs.
    costMinor: Math.round((v.priceMinor * 0.35) / 5) * 5,
    lowStockThreshold: 5,
    selectedOptions: [{ name: spec.optionName, value: v.title }],
    image,
    quantity: v.quantity,
  }));
  return {
    id: `gid://crater/Product/${spec.id}`,
    handle: spec.handle,
    title: spec.title,
    description: spec.whatItIs,
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
    images: [image, detailIllustration(spec.handle, spec.title)],
    details: {
      // Despite the field name, this holds the single "What it is" sentence (docs/catalogue.md section 7).
      benefits: [spec.whatItIs],
      ingredients: ingredientsOf(spec),
      howToUse: 'Placeholder; follow the licensed label.',
      precautions: 'Placeholder. Precautions will be added once the product is licensed. Do not rely on this text.',
    },
    sample: true,
    status: 'ACTIVE',
    createdAt: created,
    updatedAt: created,
    variants,
  };
};

const collection = (id: number, handle: string, title: string, productHandles: string[]): CollectionRecord => ({
  id: `gid://crater/Collection/${id}`,
  handle,
  title,
  description: 'Sample collection. Preview copy.',
  productHandles,
});

/** Product handles in seed order that belong to a collection, derived from docs/catalogue.md section 2. */
const MEMBERSHIP: Record<string, string[]> = {
  tinctures: ['lemon-balm-oat-extract', 'peppermint-ginger-extract', 'chamomile-linden-extract', 'hawthorn-rose-hip-extract', 'dandelion-root-extract', 'nettle-leaf-extract'],
  'body-oils': ['calendula-almond-body-oil', 'lavender-jojoba-body-oil'],
  'single-herbs': ['dandelion-root-extract', 'nettle-leaf-extract'],
  'kits-gifts': ['evening-ritual-kit'],
  'daily-ritual': ['peppermint-ginger-extract', 'dandelion-root-extract'],
  'evening-ritual': ['lemon-balm-oat-extract', 'chamomile-linden-extract', 'lavender-jojoba-body-oil', 'evening-ritual-kit'],
  seasonal: ['hawthorn-rose-hip-extract', 'nettle-leaf-extract'],
  'body-care': ['calendula-almond-body-oil', 'lavender-jojoba-body-oil'],
};

export const catalogSeed: CatalogSeed = {
  products: specs.map(buildProduct),
  collections: [
    // Formats first, then rituals.
    collection(11, 'tinctures', 'Tinctures', MEMBERSHIP['tinctures']),
    collection(12, 'body-oils', 'Body oils', MEMBERSHIP['body-oils']),
    collection(13, 'single-herbs', 'Single herbs', MEMBERSHIP['single-herbs']),
    collection(14, 'kits-gifts', 'Kits & gifts', MEMBERSHIP['kits-gifts']),
    collection(15, 'daily-ritual', 'Daily ritual', MEMBERSHIP['daily-ritual']),
    collection(16, 'evening-ritual', 'Evening ritual', MEMBERSHIP['evening-ritual']),
    collection(17, 'seasonal', 'Seasonal', MEMBERSHIP['seasonal']),
    collection(18, 'body-care', 'Body care', MEMBERSHIP['body-care']),
  ],
};
