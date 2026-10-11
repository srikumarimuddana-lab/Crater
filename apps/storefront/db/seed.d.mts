import type { Pool } from 'pg';
import type { CatalogSeed } from '../src/lib/commerce/records';

export type SeedRetirementReport = {
  productsDeleted: number;
  productsArchived: number;
  variantsDeleted: number;
  variantsParked: number;
  collectionsDeleted: number;
};

export function seedCatalog(pool: Pool, catalog?: CatalogSeed): Promise<SeedRetirementReport>;
