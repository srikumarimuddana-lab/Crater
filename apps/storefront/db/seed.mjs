#!/usr/bin/env node
// Upserts the sample catalog into commerce.* from src/lib/commerce/catalog-seed.ts
// (loaded through Node's built-in type stripping). Re-running refreshes content and
// prices but preserves existing inventory_quantity so it never undoes recorded sales.
//
// Retiring old sample data. Anything the seed no longer lists is removed from the live catalog so a
// reseeded database matches the seed, and re-running changes nothing:
//   * Sample products (sample = true) missing from the seed are DELETED, with their variants and
//     collection memberships, unless an order line, a checkout snapshot or an inventory movement still
//     points at one of their variants. Those are ARCHIVED instead (status = 'ARCHIVED' and archived_at
//     set, which migration 0004 keeps in lockstep; collection memberships removed): the row
//     stays for the financial record, but the storefront lists and sells nothing from it.
//   * Every seeded sample product is set ACTIVE (status = 'ACTIVE'), which also re-activates a sample
//     product staff drafted or archived in the admin. Variant cost and low-stock threshold are staff
//     data: the seed never overwrites them.
//   * Variants missing from the seed but belonging to a seeded product are deleted when unreferenced,
//     otherwise made unavailable (inventory 0, parked after the live positions).
//   * Sample collections (description starting "Sample collection") missing from the seed are deleted.
//     Collections hold no financial references. Rows not marked as samples are never touched.
//   * Carts have no foreign key to variants: a cart line that points at a retired variant simply stops
//     resolving and the shopper sees it as unavailable. New seed rows use fresh ids so such a line can
//     never resolve to a different product.
//
// Connection: DIRECT_DATABASE_URL if set, else DATABASE_URL.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { catalogSeed } from '../src/lib/commerce/catalog-seed.ts';
import { poolConfig } from './migrate.mjs';

const tail = (gid) => Number(String(gid).split('/').pop());
const json = (value) => JSON.stringify(value);

const VARIANT_GID = "'gid://crater/ProductVariant/' || v.id::text";
/** SQL predicate on alias v (commerce.variants): an order line or a checkout snapshot references it. */
const VARIANT_REFERENCED = `(
  exists (select 1 from commerce.order_lines ol where ol.variant_id = ${VARIANT_GID})
  or exists (select 1 from commerce.checkouts ch, jsonb_array_elements(ch.lines) l where l ->> 'variantId' = ${VARIANT_GID})
  or exists (select 1 from commerce.inventory_movements im where im.variant_id = v.id)
)`;

/**
 * Removes or archives sample rows that are not in `catalog`. Runs inside the seed transaction.
 * @param {import('pg').PoolClient} client
 */
async function retireStaleRows(client, catalog) {
  const productIds = catalog.products.map((p) => tail(p.id));
  const variantIds = catalog.products.flatMap((p) => p.variants.map((v) => tail(v.id)));
  const collectionIds = catalog.collections.map((c) => tail(c.id));
  const report = { productsDeleted: 0, productsArchived: 0, variantsDeleted: 0, variantsParked: 0, collectionsDeleted: 0 };

  // Whole sample products that left the seed. Already-archived rows stay archived (no-op on re-run).
  const stale = (
    await client.query(
      `select p.id, p.archived_at,
              exists (select 1 from commerce.variants v where v.product_id = p.id and ${VARIANT_REFERENCED}) as referenced
         from commerce.products p
        where p.sample and p.id <> all($1::int[])`,
      [productIds],
    )
  ).rows;
  for (const row of stale) {
    if (!row.referenced) {
      await client.query('delete from commerce.products where id = $1', [row.id]); // cascades variants and memberships
      report.productsDeleted += 1;
      continue;
    }
    await client.query('delete from commerce.collection_products where product_id = $1', [row.id]);
    if (row.archived_at === null) {
      await client.query("update commerce.products set status = 'ARCHIVED', archived_at = now() where id = $1", [row.id]);
      report.productsArchived += 1;
    }
  }

  // Variants that left a product which is still in the seed.
  const staleVariants = (
    await client.query(
      `select v.id, v.inventory_quantity, v.position, ${VARIANT_REFERENCED} as referenced
         from commerce.variants v
        where v.product_id = any($1::int[]) and v.id <> all($2::int[])`,
      [productIds, variantIds],
    )
  ).rows;
  for (const row of staleVariants) {
    if (!row.referenced) {
      await client.query('delete from commerce.variants where id = $1', [row.id]);
      report.variantsDeleted += 1;
    } else if (row.inventory_quantity !== 0 || row.position < 1000) {
      // Unavailable, and out of the way of the positions the seed is about to claim.
      await client.query('update commerce.variants set inventory_quantity = 0, position = 1000 + id where id = $1', [row.id]);
      report.variantsParked += 1;
    }
  }

  const gone = await client.query(
    `delete from commerce.collections where description like 'Sample collection%' and id <> all($1::int[])`,
    [collectionIds],
  );
  report.collectionsDeleted = gone.rowCount ?? 0;
  return report;
}

/** @param {import('pg').Pool} pool */
export async function seedCatalog(pool, catalog = catalogSeed) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Retire first: freed handles, SKUs and positions are then available to the rows upserted below.
    const retired = await retireStaleRows(client, catalog);
    for (const p of catalog.products) {
      await client.query(
        `insert into commerce.products
           (id, handle, title, description, vendor, product_type, tags, options, featured_image, images, details, sample, created_at, updated_at, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,'ACTIVE')
         on conflict (id) do update set
           handle = excluded.handle, title = excluded.title, description = excluded.description,
           vendor = excluded.vendor, product_type = excluded.product_type, tags = excluded.tags,
           options = excluded.options, featured_image = excluded.featured_image, images = excluded.images,
           details = excluded.details, sample = excluded.sample, updated_at = excluded.updated_at,
           status = 'ACTIVE', archived_at = null`,
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
    return retired;
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
    const r = await seedCatalog(pool);
    console.log(
      `[db:seed] seeded ${catalogSeed.products.length} sample products, ${catalogSeed.collections.length} collections; ` +
        `retired: ${r.productsDeleted} products deleted, ${r.productsArchived} archived, ` +
        `${r.variantsDeleted} variants deleted, ${r.variantsParked} made unavailable, ${r.collectionsDeleted} collections deleted`,
    );
  } catch (error) {
    console.error('[db:seed] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
