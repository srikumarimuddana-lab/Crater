import type { Pool } from 'pg';
import type { CatalogSeed } from '../src/lib/commerce/records';

export function seedCatalog(pool: Pool, catalog?: CatalogSeed): Promise<void>;
