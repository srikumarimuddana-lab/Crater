-- Price tracking (journey J6.2): remember the unit price the shopper was last shown for each
-- cart line, in integer minor units, so the cart can tell them when the catalog price moved.
-- Idempotent: safe to re-run by hand. The migration runner wraps this file in one transaction.

alter table commerce.cart_lines
  add column if not exists price_at_add_minor integer check (price_at_add_minor is null or price_at_add_minor >= 0);

-- Backfill existing lines from the current variant price (no change is reported for carts that
-- predate this migration). Lines whose variant is gone are not shown to shoppers; use 0.
update commerce.cart_lines cl
   set price_at_add_minor = coalesce(
         (select v.price_minor from commerce.variants v where v.id = cl.variant_id),
         0)
 where cl.price_at_add_minor is null;

alter table commerce.cart_lines alter column price_at_add_minor set not null;

-- RLS is already enabled on commerce.cart_lines (0001); adding a column does not change it.
