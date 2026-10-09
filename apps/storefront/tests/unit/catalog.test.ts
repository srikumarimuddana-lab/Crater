import { describe, expect, it } from 'vitest';
import { catalogSeed } from '@/lib/commerce/catalog-seed';
import { InvalidCursorError } from '@/lib/commerce/catalog';
import { createMemoryRepository } from '@/lib/commerce/memory-repository';
import { createStorefront } from '@/lib/commerce/storefront';
import { categories, fixtureProducts } from '@/lib/content/fixtures';

const store = () => createStorefront({ repo: createMemoryRepository() });

describe('catalog seed', () => {
  it('stays in sync with the Phase 1 fixtures (handles, titles, images, preview copy, categories)', () => {
    expect(catalogSeed.products.map((p) => p.handle)).toEqual(fixtureProducts.map((p) => p.handle));
    for (const fx of fixtureProducts) {
      const p = catalogSeed.products.find((x) => x.handle === fx.handle)!;
      expect(p.title).toBe(fx.title);
      expect(p.description).toBe(fx.previewCopy);
      expect(p.featuredImage).toMatchObject({ url: fx.image.src, altText: fx.image.alt, width: fx.image.width, height: fx.image.height, placeholder: true });
      const col = catalogSeed.collections.find((c) => c.productHandles.includes(fx.handle))!;
      expect(col.handle).toBe(fx.category);
    }
    expect(catalogSeed.collections.map((c) => c.handle)).toEqual(categories.map((c) => c.slug));
  });

  it('marks everything as sample and keeps the hero variant first', async () => {
    const serum = await store().product({ handle: 'mineral-serum' });
    expect(serum?.sample).toBe(true);
    expect(serum?.vendor).toBe('Crater');
    expect(serum?.variants[0]).toMatchObject({ title: '30 mL', price: { amount: '68.00', currencyCode: 'CAD' } });
    expect(serum?.variants[1]).toMatchObject({ title: '15 mL', price: { amount: '42.00' } });
    expect(catalogSeed.products.every((p) => p.sample)).toBe(true);
  });

  it('contains a sold-out and a low-stock variant, and no clinical claims or percentages', () => {
    const variants = catalogSeed.products.flatMap((p) => p.variants);
    expect(variants.some((v) => v.quantity === 0)).toBe(true);
    expect(variants.some((v) => v.quantity === 2)).toBe(true);
    const text = JSON.stringify(catalogSeed.products.map((p) => [p.description, p.details]));
    expect(text).not.toMatch(/%|clinical|dermatolog|tested|certified|\breviews?\b|proven/i);
  });

  it('uses the documented id shapes', () => {
    const p = catalogSeed.products[0];
    expect(p.id).toMatch(/^gid:\/\/crater\/Product\/\d+$/);
    expect(p.variants[0].id).toMatch(/^gid:\/\/crater\/ProductVariant\/\d+$/);
  });
});

describe('products()', () => {
  it('lists with product-level availability and price range', async () => {
    const { nodes } = await store().products({ first: 50 });
    expect(nodes).toHaveLength(6);
    const balm = nodes.find((p) => p.handle === 'lip-cheek-balm')!;
    expect(balm.availableForSale).toBe(true); // one shade still in stock
    expect(balm.variants[0]).toMatchObject({ availableForSale: false, quantityAvailable: 0 });
    const serum = nodes.find((p) => p.handle === 'mineral-serum')!;
    expect(serum.priceRange).toEqual({
      minVariantPrice: { amount: '42.00', currencyCode: 'CAD' },
      maxVariantPrice: { amount: '68.00', currencyCode: 'CAD' },
    });
  });

  it('sorts by TITLE, PRICE, CREATED_AT and honours reverse', async () => {
    const s = store();
    const handles = async (args: Parameters<typeof s.products>[0]) => (await s.products({ first: 50, ...args })).nodes.map((p) => p.handle);
    expect(await handles({ sortKey: 'TITLE' })).toEqual(['balancing-toner', 'cloud-cream', 'facial-mist', 'gel-cleanser', 'lip-cheek-balm', 'mineral-serum']);
    expect((await handles({ sortKey: 'TITLE', reverse: true }))[0]).toBe('mineral-serum');
    // PRICE sorts by lowest variant price: balm 24, mist 32, cleanser 34, toner 38, serum 42, cream 50
    expect(await handles({ sortKey: 'PRICE' })).toEqual(['lip-cheek-balm', 'facial-mist', 'gel-cleanser', 'balancing-toner', 'mineral-serum', 'cloud-cream']);
    expect(await handles({ sortKey: 'CREATED_AT' })).toEqual(catalogSeed.products.map((p) => p.handle));
    expect((await handles({ sortKey: 'CREATED_AT', reverse: true }))[0]).toBe('lip-cheek-balm');
  });

  it('paginates with opaque cursors and reports pageInfo', async () => {
    const s = store();
    const p1 = await s.products({ first: 4, sortKey: 'TITLE' });
    expect(p1.nodes).toHaveLength(4);
    expect(p1.pageInfo).toMatchObject({ hasNextPage: true, hasPreviousPage: false });
    const p2 = await s.products({ first: 4, sortKey: 'TITLE', after: p1.pageInfo.endCursor });
    expect(p2.nodes.map((p) => p.handle)).toEqual(['lip-cheek-balm', 'mineral-serum']);
    expect(p2.pageInfo).toMatchObject({ hasNextPage: false, hasPreviousPage: true });
    const all = [...p1.nodes, ...p2.nodes].map((p) => p.handle);
    expect(new Set(all).size).toBe(6);
  });

  it('rejects malformed cursors and clamps first', async () => {
    const s = store();
    await expect(s.products({ after: '%%%' })).rejects.toBeInstanceOf(InvalidCursorError);
    await expect(s.products({ after: Buffer.from('{"x":1}').toString('base64url') })).rejects.toBeInstanceOf(InvalidCursorError);
    expect((await s.products({ first: 0 })).nodes).toHaveLength(1);
    expect((await s.products({ first: 9999 })).nodes).toHaveLength(6);
  });

  it('filters by free text, product_type, tag, available_for_sale and collection', async () => {
    const s = store();
    const handles = async (query?: string, collection?: string) => (await s.products({ query, collection, sortKey: 'TITLE' })).nodes.map((p) => p.handle);
    expect(await handles('serum')).toEqual(['mineral-serum']);
    expect(await handles('SOFT daily')).toEqual(['cloud-cream']);
    expect(await handles('"fine mist"')).toEqual(['facial-mist']);
    expect(await handles('product_type:Balm')).toEqual(['lip-cheek-balm']);
    expect(await handles('tag:sample product_type:cleanser')).toEqual(['gel-cleanser']);
    expect(await handles('tag:nope')).toEqual([]);
    expect(await handles('nonexistentword')).toEqual([]);
    expect(await handles(undefined, 'toners-mists')).toEqual(['balancing-toner', 'facial-mist']);
    expect(await handles('mist', 'toners-mists')).toEqual(['facial-mist']);
    expect(await handles(undefined, 'no-such-collection')).toEqual([]);
  });

  it('filters available_for_sale using live stock', async () => {
    const repo = createMemoryRepository();
    const s = createStorefront({ repo });
    expect((await s.products({ query: 'available_for_sale:true' })).nodes).toHaveLength(6);
    await repo.updateVariant('gid://crater/ProductVariant/5', { quantity: 0 }); // gel cleanser has one variant
    const avail = (await s.products({ query: 'available_for_sale:true' })).nodes.map((p) => p.handle);
    expect(avail).not.toContain('gel-cleanser');
    expect((await s.products({ query: 'available_for_sale:false' })).nodes.map((p) => p.handle)).toEqual(['gel-cleanser']);
  });

  it('product() returns null for unknown handles and lists collections', async () => {
    const s = store();
    expect(await s.product({ handle: 'nope' })).toBeNull();
    expect((await s.collections()).map((c) => c.handle)).toEqual(['serums', 'moisturizers', 'cleansers', 'toners-mists', 'balms']);
  });
});

describe('variantBySelectedOptions', () => {
  const s = store();
  it('resolves the exact variant, case-insensitively', async () => {
    expect((await s.variantBySelectedOptions({ handle: 'mineral-serum', selectedOptions: [{ name: 'Size', value: '15 mL' }] }))?.id).toBe('gid://crater/ProductVariant/2');
    expect((await s.variantBySelectedOptions({ handle: 'cloud-cream', selectedOptions: [{ name: 'size', value: 'refill 50 ml' }] }))?.title).toBe('Refill 50 mL');
  });
  it('returns null for unknown values, partial/duplicate/extra options, and unknown products', async () => {
    expect(await s.variantBySelectedOptions({ handle: 'mineral-serum', selectedOptions: [{ name: 'Size', value: '99 mL' }] })).toBeNull();
    expect(await s.variantBySelectedOptions({ handle: 'mineral-serum', selectedOptions: [] })).toBeNull();
    expect(await s.variantBySelectedOptions({ handle: 'mineral-serum', selectedOptions: [{ name: 'Size', value: '15 mL' }, { name: 'Size', value: '30 mL' }] })).toBeNull();
    expect(await s.variantBySelectedOptions({ handle: 'mineral-serum', selectedOptions: [{ name: 'Size', value: '15 mL' }, { name: 'Color', value: 'x' }] })).toBeNull();
    expect(await s.variantBySelectedOptions({ handle: 'ghost', selectedOptions: [{ name: 'Size', value: '15 mL' }] })).toBeNull();
  });
});
