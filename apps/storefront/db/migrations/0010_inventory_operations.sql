-- Operational records; commerce owns stock. Every receipt and physical return is
-- committed in the same transaction as its stock movements.
create table if not exists commerce.suppliers (
 id text primary key, name text not null, email text not null default '', created_at timestamptz not null default now()
);
create table if not exists commerce.purchase_orders (
 id text primary key, supplier_id text not null references commerce.suppliers(id), reference text not null,
 lines jsonb not null, created_at timestamptz not null default now()
);
create table if not exists commerce.stock_receipts (
 request_key text primary key, purchase_order_id text not null references commerce.purchase_orders(id),
 lines jsonb not null, mode text not null check(mode in ('test','live')), staff_id integer, received_at timestamptz not null default now()
);
create table if not exists commerce.shipments (
 request_key text primary key, order_id integer not null references commerce.orders(id),
 lines jsonb not null, cost_snapshot jsonb not null default '[]', carrier text not null, tracking_number text not null, staff_id integer,
 created_at timestamptz not null default now()
);
create index if not exists shipments_order_idx on commerce.shipments(order_id);
create table if not exists commerce.physical_returns (
 request_key text primary key, order_id integer not null references commerce.orders(id),
 lines jsonb not null, cost_snapshot jsonb not null default '[]', restock boolean not null, reason text not null, staff_id integer,
 received_at timestamptz not null default now()
);
create index if not exists physical_returns_order_idx on commerce.physical_returns(order_id);
create table if not exists commerce.pricing_rules (
 id text primary key, kind text not null check(kind in ('shipping','discount')), version integer not null default 1,
 data jsonb not null, updated_at timestamptz not null default now()
);
alter table commerce.collections add column if not exists version integer not null default 1;
-- IDs in the original catalogue are supplied by the seed. Counters reserve new IDs atomically.
insert into commerce.counters(name,value) select 'product_id',coalesce(max(id),0) from commerce.products on conflict do nothing;
insert into commerce.counters(name,value) select 'variant_id',coalesce(max(id),0) from commerce.variants on conflict do nothing;
insert into commerce.counters(name,value) select 'collection_id',coalesce(max(id),0) from commerce.collections on conflict do nothing;
alter table commerce.suppliers enable row level security;
alter table commerce.purchase_orders enable row level security;
alter table commerce.stock_receipts enable row level security;
alter table commerce.shipments enable row level security;
alter table commerce.physical_returns enable row level security;
alter table commerce.pricing_rules enable row level security;
do $$ declare t text; begin
 foreach t in array array['stock_receipts','shipments','physical_returns'] loop
 execute format('drop trigger if exists operational_append_only on commerce.%I',t);
 execute format('create trigger operational_append_only before update or delete on commerce.%I for each row execute function admin.forbid_mutation()',t);
 end loop;
end $$;
