import type { CollectionRecord, ProductRecord, VariantRecord } from './records';
import { toMoney } from './money';
import type { Connection, ID, Product, ProductsQueryArgs, ProductVariant, SelectedOption } from './types';

export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid cursor');
  }
}

export type CatalogIndex = {
  products: ProductRecord[];
  collections: CollectionRecord[];
  variants: Map<ID, { variant: VariantRecord; product: ProductRecord }>;
};

export function buildIndex(products: ProductRecord[], collections: CollectionRecord[] = []): CatalogIndex {
  const variants = new Map<ID, { variant: VariantRecord; product: ProductRecord }>();
  for (const product of products) for (const variant of product.variants) variants.set(variant.id, { variant, product });
  return { products, collections, variants };
}

export const isVariantAvailable = (v: VariantRecord): boolean => v.quantity === null || v.quantity > 0;

export function toVariant(variant: VariantRecord, product: ProductRecord): ProductVariant {
  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku,
    availableForSale: isVariantAvailable(variant),
    quantityAvailable: variant.quantity,
    price: toMoney(variant.priceMinor),
    compareAtPrice: variant.compareAtMinor === null ? null : toMoney(variant.compareAtMinor),
    selectedOptions: variant.selectedOptions.map((o) => ({ ...o })),
    image: variant.image ? { ...variant.image } : null,
    product: { id: product.id, handle: product.handle, title: product.title },
  };
}

const minPrice = (p: ProductRecord) => Math.min(...p.variants.map((v) => v.priceMinor));
const maxPrice = (p: ProductRecord) => Math.max(...p.variants.map((v) => v.priceMinor));
const productAvailable = (p: ProductRecord) => p.variants.some(isVariantAvailable);

export function toProduct(p: ProductRecord): Product {
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    description: p.description,
    vendor: p.vendor,
    productType: p.productType,
    tags: [...p.tags],
    availableForSale: productAvailable(p),
    options: p.options.map((o) => ({ ...o, optionValues: o.optionValues.map((v) => ({ ...v })) })),
    priceRange: { minVariantPrice: toMoney(minPrice(p)), maxVariantPrice: toMoney(maxPrice(p)) },
    featuredImage: p.featuredImage ? { ...p.featuredImage } : null,
    images: p.images.map((i) => ({ ...i })),
    variants: p.variants.map((v) => toVariant(v, p)),
    details: {
      benefits: [...p.details.benefits],
      ingredients: [...p.details.ingredients],
      howToUse: p.details.howToUse,
      precautions: p.details.precautions,
    },
    sample: p.sample,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Search

type ParsedQuery = {
  text: string[];
  productType: string[];
  tag: string[];
  availableForSale: boolean | null;
};

/** Splits on whitespace, honouring "quoted phrases" and field:"quoted value". */
function tokenize(query: string): string[] {
  return query.match(/(?:[^\s":]+:"[^"]*"|"[^"]*"|\S+)/g) ?? [];
}

export function parseQuery(query: string | undefined): ParsedQuery {
  const parsed: ParsedQuery = { text: [], productType: [], tag: [], availableForSale: null };
  for (const raw of tokenize(query ?? '')) {
    const m = /^(product_type|tag|available_for_sale):(.*)$/i.exec(raw);
    const unquote = (s: string) => s.replace(/^"(.*)"$/, '$1').trim().toLowerCase();
    if (m) {
      const value = unquote(m[2]);
      const field = m[1].toLowerCase();
      if (field === 'product_type') parsed.productType.push(value);
      else if (field === 'tag') parsed.tag.push(value);
      else if (value === 'true' || value === 'false') parsed.availableForSale = value === 'true';
      continue;
    }
    const text = unquote(raw);
    if (text) parsed.text.push(text);
  }
  return parsed;
}

function matches(p: ProductRecord, q: ParsedQuery): boolean {
  const title = p.title.toLowerCase();
  const description = p.description.toLowerCase();
  if (!q.text.every((t) => title.includes(t) || description.includes(t))) return false;
  if (!q.productType.every((t) => p.productType.toLowerCase() === t)) return false;
  if (!q.tag.every((t) => p.tags.some((x) => x.toLowerCase() === t))) return false;
  if (q.availableForSale !== null && productAvailable(p) !== q.availableForSale) return false;
  return true;
}

function relevance(p: ProductRecord, q: ParsedQuery): number {
  const title = p.title.toLowerCase();
  return q.text.reduce((score, t) => score + (title.includes(t) ? 2 : 1), 0);
}

// ---------------------------------------------------------------------------
// Cursors: opaque base64url of {id, i}. `id` anchors to a product; `i` is the fallback position.

export function encodeCursor(id: ID, i: number): string {
  return Buffer.from(JSON.stringify({ id, i }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { id: ID; i: number } {
  if (cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new InvalidCursorError();
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      parsed && typeof parsed === 'object' && 'id' in parsed && 'i' in parsed &&
      typeof parsed.id === 'string' && typeof parsed.i === 'number' && Number.isInteger(parsed.i) && parsed.i >= 0
    ) {
      return { id: parsed.id, i: parsed.i };
    }
  } catch {
    // fall through
  }
  throw new InvalidCursorError();
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export function queryProducts(index: CatalogIndex, args: ProductsQueryArgs = {}): Connection<Product> {
  const parsed = parseQuery(args.query);
  let list = index.products.filter((p) => matches(p, parsed));

  if (args.collection !== undefined) {
    const col = index.collections.find((c) => c.handle === args.collection);
    const handles = new Set(col?.productHandles ?? []);
    list = list.filter((p) => handles.has(p.handle));
  }

  const sortKey = args.sortKey ?? 'RELEVANCE';
  const position = new Map(index.products.map((p, i) => [p.id, i]));
  const byTitle = (a: ProductRecord, b: ProductRecord) => a.title.localeCompare(b.title, 'en');
  const stable = (a: ProductRecord, b: ProductRecord) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0);
  const compare: Record<string, (a: ProductRecord, b: ProductRecord) => number> = {
    TITLE: (a, b) => byTitle(a, b) || stable(a, b),
    PRICE: (a, b) => minPrice(a) - minPrice(b) || byTitle(a, b) || stable(a, b),
    CREATED_AT: (a, b) => a.createdAt.localeCompare(b.createdAt) || stable(a, b),
    RELEVANCE: (a, b) => relevance(b, parsed) - relevance(a, parsed) || stable(a, b),
  };
  list = [...list].sort(compare[sortKey] ?? compare.RELEVANCE);
  if (args.reverse) list.reverse();

  let start = 0;
  if (args.after) {
    const cursor = decodeCursor(args.after);
    const at = list.findIndex((p) => p.id === cursor.id);
    start = at >= 0 ? at + 1 : Math.min(cursor.i + 1, list.length);
  }
  const requested = args.first ?? DEFAULT_PAGE_SIZE;
  const first = Number.isFinite(requested) ? Math.min(Math.max(Math.floor(requested), 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const page = list.slice(start, start + first);
  return {
    nodes: page.map(toProduct),
    pageInfo: {
      hasNextPage: start + page.length < list.length,
      hasPreviousPage: start > 0,
      startCursor: page.length ? encodeCursor(page[0].id, start) : null,
      endCursor: page.length ? encodeCursor(page[page.length - 1].id, start + page.length - 1) : null,
    },
  };
}

/** Exact match on every product option (names and values compared case-insensitively). */
export function findVariantBySelectedOptions(
  index: CatalogIndex,
  handle: string,
  selected: SelectedOption[],
): ProductVariant | null {
  const product = index.products.find((p) => p.handle === handle);
  if (!product || !Array.isArray(selected)) return null;
  const norm = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
  const wanted = new Map<string, string>();
  for (const o of selected) {
    const name = norm(o?.name);
    if (!name || wanted.has(name)) return null;
    wanted.set(name, norm(o?.value));
  }
  if (wanted.size !== product.options.length) return null;
  const match = product.variants.find(
    (v) =>
      v.selectedOptions.length === wanted.size &&
      v.selectedOptions.every((o) => wanted.get(norm(o.name)) === norm(o.value)),
  );
  return match ? toVariant(match, product) : null;
}
