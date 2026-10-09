import { describe, expect, it } from 'vitest';
import { catalogSeed } from '@/lib/commerce/catalog-seed';
import { InvalidCursorError } from '@/lib/commerce/catalog';
import { createMemoryRepository } from '@/lib/commerce/memory-repository';
import { createStorefront } from '@/lib/commerce/storefront';

const store = () => createStorefront({ repo: createMemoryRepository() });

describe('catalog seed', () => {
  const HANDLES = [
    'lemon-balm-oat-extract',
    'peppermint-ginger-extract',
    'chamomile-linden-extract',
    'hawthorn-rose-hip-extract',
    'dandelion-root-extract',
    'nettle-leaf-extract',
    'calendula-almond-body-oil',
    'lavender-jojoba-body-oil',
    'evening-ritual-kit',
  ];

  it('has the nine herbal sample products and eight collections (formats first, then rituals), all resolving', () => {
    expect(catalogSeed.products.map((p) => p.handle)).toEqual(HANDLES);
    expect(catalogSeed.collections.map((c) => c.handle)).toEqual([
      'tinctures', 'body-oils', 'single-herbs', 'kits-gifts', 'daily-ritual', 'evening-ritual', 'seasonal', 'body-care',
    ]);
    expect(catalogSeed.collections.map((c) => c.title)).toEqual([
      'Tinctures', 'Body oils', 'Single herbs', 'Kits & gifts', 'Daily ritual', 'Evening ritual', 'Seasonal', 'Body care',
    ]);
    for (const c of catalogSeed.collections) {
      expect(c.description).toBe('Sample collection. Preview copy.');
      for (const h of c.productHandles) expect(HANDLES, `${c.handle} -> ${h}`).toContain(h);
    }
    for (const p of catalogSeed.products) expect(catalogSeed.collections.some((c) => c.productHandles.includes(p.handle))).toBe(true);
    // No duplicate handles, SKUs or ids.
    const skus = catalogSeed.products.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);
    expect(skus.every((s) => /^SAMPLE-[A-Z]+-(\d+|SET3)$/.test(s))).toBe(true);
    const ids = [...catalogSeed.products.map((p) => p.id), ...catalogSeed.products.flatMap((p) => p.variants.map((v) => v.id))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives each product the documented memberships', () => {
    const memberships = (handle: string) => catalogSeed.collections.filter((c) => c.productHandles.includes(handle)).map((c) => c.handle).sort();
    expect(memberships('lemon-balm-oat-extract')).toEqual(['evening-ritual', 'tinctures']);
    expect(memberships('peppermint-ginger-extract')).toEqual(['daily-ritual', 'tinctures']);
    expect(memberships('hawthorn-rose-hip-extract')).toEqual(['seasonal', 'tinctures']);
    expect(memberships('dandelion-root-extract')).toEqual(['daily-ritual', 'single-herbs', 'tinctures']);
    expect(memberships('nettle-leaf-extract')).toEqual(['seasonal', 'single-herbs', 'tinctures']);
    expect(memberships('calendula-almond-body-oil')).toEqual(['body-care', 'body-oils']);
    expect(memberships('lavender-jojoba-body-oil')).toEqual(['body-care', 'body-oils', 'evening-ritual']);
    expect(memberships('evening-ritual-kit')).toEqual(['evening-ritual', 'kits-gifts']);
  });

  it('has [packshot, detail] placeholder images with the documented alt text, and a Size option', () => {
    for (const p of catalogSeed.products) {
      expect(p.images).toEqual([
        { url: `/products/${p.handle}/packshot.svg`, altText: `Illustration placeholder: ${p.title}`, width: 800, height: 1000, placeholder: true },
        { url: `/products/${p.handle}/detail.svg`, altText: `Illustration placeholder: ${p.title} texture`, width: 800, height: 1000, placeholder: true },
      ]);
      expect(p.featuredImage).toEqual(p.images[0]);
      expect(p.options.map((o) => o.name)).toEqual(['Size']);
      expect(p.vendor).toBe('Crater');
      expect(p.sample).toBe(true);
      expect(p.tags).toEqual(['sample', p.productType.toLowerCase()]);
    }
  });

  it('carries the "What it is" sentence, ingredients, usage and precautions placeholders', () => {
    for (const p of catalogSeed.products) {
      expect(p.details.benefits).toEqual([p.description]);
      expect(p.details.howToUse).toBe('Placeholder; follow the licensed label.');
      expect(p.details.precautions).toBe('Placeholder. Precautions will be added once the product is licensed. Do not rely on this text.');
      expect(p.details.ingredients.at(-1)).toBe('(sample list, pending licensed formula)');
    }
    const lemon = catalogSeed.products[0];
    expect(lemon.details.ingredients.slice(0, 2)).toEqual(['Melissa officinalis leaf', 'Avena sativa milky seed']);
    expect(lemon.details.ingredients.join(' ')).toMatch(/extraction base: pending owner confirmation/i); // never states the base
    const kit = catalogSeed.products[8];
    expect(kit.details.ingredients).toHaveLength(4); // three contents plus the licence note
    expect(kit.details.ingredients[0]).toContain('Lemon Balm & Oat Extract, 30 mL');
    expect(kit.details.ingredients[2]).toContain('Lavender & Jojoba Body Oil, 100 mL');
  });

  it('keeps the hero first with a 30 mL default at $24.00, and single-variant products and the kit', async () => {
    const hero = await store().product({ handle: 'lemon-balm-oat-extract' });
    expect(hero?.sample).toBe(true);
    expect(hero?.vendor).toBe('Crater');
    expect(hero?.variants[0]).toMatchObject({ title: '30 mL', sku: 'SAMPLE-LBO-30', price: { amount: '24.00', currencyCode: 'CAD' } });
    expect(hero?.variants[1]).toMatchObject({ title: '60 mL', sku: 'SAMPLE-LBO-60', price: { amount: '38.00' } });
    expect((await store().products({})).nodes[0].handle).toBe('lemon-balm-oat-extract');
    const single = catalogSeed.products.filter((p) => p.variants.length === 1).map((p) => p.handle);
    expect(single).toEqual(['calendula-almond-body-oil', 'lavender-jojoba-body-oil', 'evening-ritual-kit']);
    expect(catalogSeed.products[8].variants[0]).toMatchObject({ title: 'Set of 3', sku: 'SAMPLE-ER-SET3', priceMinor: 7400, quantity: 12 });
    expect(catalogSeed.products.every((p) => p.variants.every((v) => v.compareAtMinor === null))).toBe(true);
  });

  it('has exactly one sold-out variant (Chamomile 60 mL) and one low-stock variant (Hawthorn 30 mL)', () => {
    const variants = catalogSeed.products.flatMap((p) => p.variants.map((v) => ({ handle: p.handle, ...v })));
    expect(variants.filter((v) => v.quantity === 0).map((v) => [v.handle, v.title])).toEqual([['chamomile-linden-extract', '60 mL']]);
    expect(variants.filter((v) => v.quantity === 2).map((v) => [v.handle, v.title])).toEqual([['hawthorn-rose-hip-extract', '30 mL']]);
    expect(variants.find((v) => v.handle === 'chamomile-linden-extract' && v.title === '30 mL')?.quantity).toBe(30);
  });

  it('avoids claim words, percentages, certifications and reviews anywhere in the seed text', () => {
    const text = JSON.stringify(catalogSeed).toLowerCase();
    const avoided = ['calm', 'relief', 'immune', 'detox', 'cleanse', 'boost', 'sleep', 'stress', 'cure', 'treat', 'heal', 'organic', 'certified', 'clinical', 'dermatolog', 'best seller', '%'];
    for (const word of avoided) expect(text, `seed text contains "${word}"`).not.toContain(word);
    expect(text).not.toMatch(/\breviews?\b|\bratings?\b|free shipping|proven|tested/);
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
    expect(nodes).toHaveLength(9);
    const chamomile = nodes.find((p) => p.handle === 'chamomile-linden-extract')!;
    expect(chamomile.availableForSale).toBe(true); // the 30 mL is still in stock
    expect(chamomile.variants[1]).toMatchObject({ title: '60 mL', availableForSale: false, quantityAvailable: 0 });
    expect(chamomile.variants[0]).toMatchObject({ title: '30 mL', availableForSale: true });
    const hawthorn = nodes.find((p) => p.handle === 'hawthorn-rose-hip-extract')!;
    expect(hawthorn.variants[0]).toMatchObject({ title: '30 mL', availableForSale: true, quantityAvailable: 2 });
    const hero = nodes.find((p) => p.handle === 'lemon-balm-oat-extract')!;
    expect(hero.priceRange).toEqual({
      minVariantPrice: { amount: '24.00', currencyCode: 'CAD' },
      maxVariantPrice: { amount: '38.00', currencyCode: 'CAD' },
    });
  });

  it('sorts by TITLE, PRICE, CREATED_AT and honours reverse', async () => {
    const s = store();
    const handles = async (args: Parameters<typeof s.products>[0]) => (await s.products({ first: 50, ...args })).nodes.map((p) => p.handle);
    expect(await handles({ sortKey: 'TITLE' })).toEqual([
      'calendula-almond-body-oil', 'chamomile-linden-extract', 'dandelion-root-extract', 'evening-ritual-kit', 'hawthorn-rose-hip-extract',
      'lavender-jojoba-body-oil', 'lemon-balm-oat-extract', 'nettle-leaf-extract', 'peppermint-ginger-extract',
    ]);
    expect((await handles({ sortKey: 'TITLE', reverse: true }))[0]).toBe('peppermint-ginger-extract');
    // PRICE sorts by lowest variant price, ties by title: dandelion/nettle/peppermint 22, chamomile/lemon balm 24, hawthorn 26, calendula 30, lavender 32, kit 74
    expect(await handles({ sortKey: 'PRICE' })).toEqual([
      'dandelion-root-extract', 'nettle-leaf-extract', 'peppermint-ginger-extract', 'chamomile-linden-extract', 'lemon-balm-oat-extract',
      'hawthorn-rose-hip-extract', 'calendula-almond-body-oil', 'lavender-jojoba-body-oil', 'evening-ritual-kit',
    ]);
    expect(await handles({ sortKey: 'CREATED_AT' })).toEqual(catalogSeed.products.map((p) => p.handle));
    expect((await handles({ sortKey: 'CREATED_AT', reverse: true }))[0]).toBe('evening-ritual-kit');
  });

  it('paginates with opaque cursors and reports pageInfo', async () => {
    const s = store();
    const p1 = await s.products({ first: 5, sortKey: 'TITLE' });
    expect(p1.nodes).toHaveLength(5);
    expect(p1.pageInfo).toMatchObject({ hasNextPage: true, hasPreviousPage: false });
    const p2 = await s.products({ first: 5, sortKey: 'TITLE', after: p1.pageInfo.endCursor });
    expect(p2.nodes.map((p) => p.handle)).toEqual(['lavender-jojoba-body-oil', 'lemon-balm-oat-extract', 'nettle-leaf-extract', 'peppermint-ginger-extract']);
    expect(p2.pageInfo).toMatchObject({ hasNextPage: false, hasPreviousPage: true });
    const all = [...p1.nodes, ...p2.nodes].map((p) => p.handle);
    expect(new Set(all).size).toBe(9);
  });

  it('rejects malformed cursors and clamps first', async () => {
    const s = store();
    await expect(s.products({ after: '%%%' })).rejects.toBeInstanceOf(InvalidCursorError);
    await expect(s.products({ after: Buffer.from('{"x":1}').toString('base64url') })).rejects.toBeInstanceOf(InvalidCursorError);
    expect((await s.products({ first: 0 })).nodes).toHaveLength(1);
    expect((await s.products({ first: 9999 })).nodes).toHaveLength(9);
  });

  it('filters by free text, product_type, tag, available_for_sale and collection', async () => {
    const s = store();
    const handles = async (query?: string, collection?: string) => (await s.products({ query, collection, sortKey: 'TITLE' })).nodes.map((p) => p.handle);
    expect(await handles('lemon')).toEqual(['lemon-balm-oat-extract']);
    expect(await handles('WARM minty')).toEqual(['peppermint-ginger-extract']);
    expect(await handles('"lightly sweet"')).toEqual(['chamomile-linden-extract']);
    expect(await handles('product_type:"Single herb"')).toEqual(['dandelion-root-extract', 'nettle-leaf-extract']);
    expect(await handles('product_type:tincture')).toEqual(['chamomile-linden-extract', 'hawthorn-rose-hip-extract', 'lemon-balm-oat-extract', 'peppermint-ginger-extract']);
    expect(await handles('tag:sample product_type:kit')).toEqual(['evening-ritual-kit']);
    expect(await handles('tag:nope')).toEqual([]);
    expect(await handles('nonexistentword')).toEqual([]);
    expect(await handles(undefined, 'single-herbs')).toEqual(['dandelion-root-extract', 'nettle-leaf-extract']);
    expect(await handles('nettle', 'single-herbs')).toEqual(['nettle-leaf-extract']);
    expect(await handles(undefined, 'no-such-collection')).toEqual([]);
  });

  it('filters available_for_sale using live stock', async () => {
    const repo = createMemoryRepository();
    const s = createStorefront({ repo });
    expect((await s.products({ query: 'available_for_sale:true' })).nodes).toHaveLength(9);
    await repo.updateVariant('gid://crater/ProductVariant/24', { quantity: 0 }); // lavender body oil has one variant
    const avail = (await s.products({ query: 'available_for_sale:true' })).nodes.map((p) => p.handle);
    expect(avail).not.toContain('lavender-jojoba-body-oil');
    expect((await s.products({ query: 'available_for_sale:false' })).nodes.map((p) => p.handle)).toEqual(['lavender-jojoba-body-oil']);
  });

  it('product() returns null for unknown handles and lists collections', async () => {
    const s = store();
    expect(await s.product({ handle: 'nope' })).toBeNull();
    expect((await s.collections()).map((c) => c.handle)).toEqual(['tinctures', 'body-oils', 'single-herbs', 'kits-gifts', 'daily-ritual', 'evening-ritual', 'seasonal', 'body-care']);
  });
});

describe('variantBySelectedOptions', () => {
  const s = store();
  it('resolves the exact variant, case-insensitively', async () => {
    expect((await s.variantBySelectedOptions({ handle: 'lemon-balm-oat-extract', selectedOptions: [{ name: 'Size', value: '60 mL' }] }))?.id).toBe('gid://crater/ProductVariant/12');
    expect((await s.variantBySelectedOptions({ handle: 'evening-ritual-kit', selectedOptions: [{ name: 'size', value: 'set of 3' }] }))?.title).toBe('Set of 3');
  });
  it('returns null for unknown values, partial/duplicate/extra options, and unknown products', async () => {
    expect(await s.variantBySelectedOptions({ handle: 'lemon-balm-oat-extract', selectedOptions: [{ name: 'Size', value: '99 mL' }] })).toBeNull();
    expect(await s.variantBySelectedOptions({ handle: 'lemon-balm-oat-extract', selectedOptions: [] })).toBeNull();
    expect(await s.variantBySelectedOptions({ handle: 'lemon-balm-oat-extract', selectedOptions: [{ name: 'Size', value: '60 mL' }, { name: 'Size', value: '30 mL' }] })).toBeNull();
    expect(await s.variantBySelectedOptions({ handle: 'lemon-balm-oat-extract', selectedOptions: [{ name: 'Size', value: '60 mL' }, { name: 'Color', value: 'x' }] })).toBeNull();
    expect(await s.variantBySelectedOptions({ handle: 'ghost', selectedOptions: [{ name: 'Size', value: '60 mL' }] })).toBeNull();
  });
});
