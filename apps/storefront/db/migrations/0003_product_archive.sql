-- Retire products without deleting history. A product that financial records (order lines or
-- checkout snapshots) still point at cannot be deleted, so db/seed.mjs archives it instead: the
-- row stays for the record, and the storefront no longer lists it, sells it or resolves its variants.
-- Idempotent and safe to re-run by hand. The migration runner wraps this file in one transaction.

alter table commerce.products
  add column if not exists archived_at timestamptz;

create index if not exists products_archived_idx on commerce.products (archived_at) where archived_at is not null;

-- RLS is already enabled on commerce.products (0001); adding a column does not change it.
