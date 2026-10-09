#!/usr/bin/env node
// Upserts the sample catalog into commerce.* from src/lib/commerce/catalog-seed.ts
// (loaded through Node's built-in type stripping). Re-running refreshes content and
// prices but preserves existing inventory_quantity so it never undoes recorded sales.
//
// Connection: DIRECT_DATABASE_URL if set, else DATABASE_URL.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { catalogSeed } from '../src/lib/commerce/catalog-seed.ts';
import { poolConfig } from './migrate.mjs';

const tail = (gid) => Number(String(gid).split('/').pop());
const json = (value) => JSON.stringify(value);

/** @param {import('pg').Pool} pool */
export async function seedCatalog(pool, catalog = catalogSeed) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const p of catalog.products) {
      await client.query(
        `insert into commerce.products
           (id, handle, title, description, vendor, product_type, tags, options, featured_image, images, details, sample, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14)
         on conflict (id) do update set
           handle = excluded.handle, title = excluded.title, description = excluded.description,
           vendor = excluded.vendor, product_type = excluded.product_type, tags = excluded.tags,
           options = excluded.options, featured_image = excluded.featured_image, images = excluded.images,
           details = excluded.details, sample = excluded.sample, updated_at = excluded.updated_at`,
        [tail(p.id), p.handle, p.title, p.description, p.vendor, p.productType, p.tags, json(p.options),
          json(p.featuredImage), json(p.images), json(p.details), p.sample, p.createdAt, p.updatedAt],
      );
      for (const [position, v] of p.variants.entries()) {
        await client.query(
          `insert into commerce.variants
             (id, product_id, position, sku, title, price_minor, compare_at_minor, selected_options, image, inventory_quantity)
           values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
           on conflict (id) do update set
             product_id = excluded.product_id, position = excluded.position, sku = excluded.sku, title = excluded.title,
             price_minor = excluded.price_minor, compare_at_minor = excluded.compare_at_minor,
             selected_options = excluded.selected_options, image = excluded.image`,
          [tail(v.id), tail(p.id), position, v.sku, v.title, v.priceMinor, v.compareAtMinor, json(v.selectedOptions), json(v.image), v.quantity],
        );
      }
    }
    const idByHandle = new Map(catalog.products.map((p) => [p.handle, tail(p.id)]));
    for (const c of catalog.collections) {
      await client.query(
        `insert into commerce.collections (id, handle, title, description) values ($1,$2,$3,$4)
         on conflict (id) do update set handle = excluded.handle, title = excluded.title, description = excluded.description`,
        [tail(c.id), c.handle, c.title, c.description],
      );
      await client.query('delete from commerce.collection_products where collection_id = $1', [tail(c.id)]);
      for (const [position, handle] of c.productHandles.entries()) {
        await client.query(
          'insert into commerce.collection_products (collection_id, product_id, position) values ($1,$2,$3)',
          [tail(c.id), idByHandle.get(handle), position],
        );
      }
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = new pg.Pool(poolConfig(process.env, { direct: true }));
  try {
    await seedCatalog(pool);
    console.log(`[db:seed] seeded ${catalogSeed.products.length} sample products`);
  } catch (error) {
    console.error('[db:seed] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
