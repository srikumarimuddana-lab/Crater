-- Sales tax by ship-to province, new stock-adjustment reasons (docs/tax.md).
--
-- The shopper picks a ship-to province in the bag (carts.buyer_province); checkout freezes it with the expected
-- tax lines (checkouts.tax_province / tax_lines); the webhook records what Stripe actually charged
-- (orders.tax_lines, per rate) plus the province of the address Stripe collected (orders.shipping_province).
-- Conventions as in 0001/0004: schema-qualified, idempotent, no BEGIN/COMMIT (the runner wraps the file), RLS
-- already on for these tables (no policies, nothing new granted).

alter table commerce.carts add column if not exists buyer_province text
  check (buyer_province is null or buyer_province in ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'));

alter table commerce.checkouts add column if not exists tax_province text
  check (tax_province is null or tax_province in ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'));
alter table commerce.checkouts add column if not exists tax_lines jsonb not null default '[]'::jsonb;

alter table commerce.orders add column if not exists tax_lines jsonb not null default '[]'::jsonb;
alter table commerce.orders add column if not exists tax_province text
  check (tax_province is null or tax_province in ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'));
alter table commerce.orders add column if not exists shipping_province text
  check (shipping_province is null or length(shipping_province) <= 100);

-- Stock-adjustment reasons: EXPIRED, SAMPLES_GIFTS and LOST_STOLEN join the original five (+ ORDER_PAID).
alter table commerce.inventory_movements drop constraint if exists inventory_movements_reason_check;
alter table commerce.inventory_movements add constraint inventory_movements_reason_check
  check (reason in ('RECEIVED', 'COUNT_CORRECTION', 'DAMAGED', 'EXPIRED', 'RETURN_RESTOCK', 'SAMPLES_GIFTS', 'LOST_STOLEN', 'OTHER', 'ORDER_PAID'));
