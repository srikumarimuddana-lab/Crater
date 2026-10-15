-- Stock stays physical/sellable inventory until confirmed payment. Active checkout
-- holds reduce what another checkout may reserve, without writing stock movements.
alter table commerce.checkouts add column if not exists reservation_expires_at timestamptz;
create table if not exists commerce.stock_reservations (
  checkout_id text not null references commerce.checkouts(id) on delete cascade,
  variant_id integer not null,
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','released','consumed')),
  primary key (checkout_id, variant_id)
);
create index if not exists stock_reservations_available_idx
  on commerce.stock_reservations(variant_id, expires_at) where status = 'active';
alter table commerce.stock_reservations enable row level security;
revoke all on commerce.stock_reservations from public;

-- Pricing is snapshotted so later rule edits cannot change an active checkout.
alter table commerce.checkouts
  add column if not exists shipping_minor integer check (shipping_minor >= 0),
  add column if not exists shipping_name text,
  add column if not exists discount_minor integer not null default 0 check (discount_minor >= 0),
  add column if not exists discount_code text;
alter table commerce.orders
  add column if not exists discount_minor integer not null default 0 check (discount_minor >= 0),
  add column if not exists discount_code text;
alter table commerce.order_lines
  add column if not exists original_unit_minor integer check (original_unit_minor >= 0);
