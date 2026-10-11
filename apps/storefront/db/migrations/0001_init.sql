-- Crater commerce schema, Supabase-ready.
--
-- * Everything lives in the dedicated `commerce` schema, never `public`, so Supabase's
--   auto-generated REST API (which exposes `public` by default) does not publish it.
-- * Row level security is enabled on every table with NO policies: the anon and
--   authenticated API roles can read and write nothing. The application connects
--   server-side as the database owner, which bypasses RLS, so app behaviour is unchanged.
-- * Money is integer minor units (cents). Carts store no prices.
-- * The migration runner wraps each file in one transaction; do not BEGIN/COMMIT here.

create schema if not exists commerce;

create table if not exists commerce.products (
  id            integer primary key,
  handle        text not null unique,
  title         text not null,
  description   text not null,
  vendor        text not null,
  product_type  text not null,
  tags          text[] not null default '{}',
  options       jsonb not null default '[]',
  featured_image jsonb,
  images        jsonb not null default '[]',
  details       jsonb not null,
  sample        boolean not null default false,
  created_at    timestamptz not null,
  updated_at    timestamptz not null
);

create table if not exists commerce.variants (
  id                 integer primary key,
  product_id         integer not null references commerce.products (id) on delete cascade,
  position           integer not null,
  sku                text not null unique,
  title              text not null,
  price_minor        integer not null check (price_minor >= 0),
  compare_at_minor   integer check (compare_at_minor is null or compare_at_minor >= 0),
  currency           char(3) not null default 'CAD' check (currency = 'CAD'),
  selected_options   jsonb not null,
  image              jsonb,
  -- Null means inventory is not tracked.
  inventory_quantity integer check (inventory_quantity is null or inventory_quantity >= 0),
  unique (product_id, position)
);

create table if not exists commerce.collections (
  id          integer primary key,
  handle      text not null unique,
  title       text not null,
  description text not null
);

create table if not exists commerce.collection_products (
  collection_id integer not null references commerce.collections (id) on delete cascade,
  product_id    integer not null references commerce.products (id) on delete cascade,
  position      integer not null,
  primary key (collection_id, product_id)
);

create table if not exists commerce.carts (
  id            text primary key check (id ~ '^gid://crater/Cart/[A-Za-z0-9_-]{32}$'),
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  completed_at  timestamptz,
  note          text,
  buyer_email   text,
  buyer_country char(2),
  attributes    jsonb not null default '[]',
  line_seq      integer not null default 0
);
create index if not exists carts_updated_at_idx on commerce.carts (updated_at);

-- No foreign key to variants: catalog edits must not silently delete shoppers' lines.
create table if not exists commerce.cart_lines (
  cart_id     text not null references commerce.carts (id) on delete cascade,
  line_number integer not null,
  variant_id  integer not null,
  quantity    integer not null check (quantity between 1 and 10),
  attributes  jsonb not null default '[]',
  position    integer not null,
  primary key (cart_id, line_number)
);

-- Checkout snapshots are financial records and outlive carts: no foreign key to carts.
create table if not exists commerce.checkouts (
  id                text primary key check (id ~ '^chk_[a-f0-9]{32}$'),
  cart_id           text not null,
  cart_ref          text not null,
  status            text not null check (status in ('created', 'session_created', 'awaiting_payment', 'completed', 'expired', 'payment_failed')),
  stripe_session_id text unique,
  fingerprint       text not null,
  subtotal_minor    integer not null check (subtotal_minor >= 0),
  buyer_email       text,
  lines             jsonb not null,
  created_at        timestamptz not null,
  updated_at        timestamptz not null
);
create index if not exists checkouts_cart_idx on commerce.checkouts (cart_id, fingerprint);

create table if not exists commerce.counters (
  name  text primary key,
  value integer not null
);
-- Last order number handed out; the next order is #1001. Bumped inside the order
-- transaction so a rollback never leaves a gap.
insert into commerce.counters (name, value) values ('order_number', 1000) on conflict (name) do nothing;

create table if not exists commerce.orders (
  id                integer generated always as identity primary key,
  order_number      integer not null unique,
  checkout_id       text not null unique references commerce.checkouts (id),
  stripe_session_id text not null unique,
  email             text,
  financial_status  text not null check (financial_status in ('PENDING', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED')),
  currency          char(3) not null default 'CAD',
  subtotal_minor    integer not null,
  shipping_minor    integer not null default 0,
  tax_minor         integer not null default 0,
  total_minor       integer not null,
  review_flags      text[] not null default '{}',
  processed_at      timestamptz not null
);

create table if not exists commerce.order_lines (
  id            integer generated always as identity primary key,
  order_id      integer not null references commerce.orders (id) on delete cascade,
  position      integer not null,
  variant_id    text not null,
  title         text not null,
  variant_title text not null,
  sku           text not null,
  quantity      integer not null check (quantity > 0),
  unit_minor    integer not null check (unit_minor >= 0)
);
create index if not exists order_lines_order_idx on commerce.order_lines (order_id);

create table if not exists commerce.processed_webhook_events (
  event_id     text primary key,
  event_type   text not null,
  processed_at timestamptz not null default now()
);

-- Lock the API roles out and turn on RLS (no policies = deny all for non-owners).
alter table commerce.products                enable row level security;
alter table commerce.variants                enable row level security;
alter table commerce.collections             enable row level security;
alter table commerce.collection_products     enable row level security;
alter table commerce.carts                   enable row level security;
alter table commerce.cart_lines              enable row level security;
alter table commerce.checkouts               enable row level security;
alter table commerce.counters                enable row level security;
alter table commerce.orders                  enable row level security;
alter table commerce.order_lines             enable row level security;
alter table commerce.processed_webhook_events enable row level security;

do $$
declare
  api_role text;
begin
  -- These roles exist on Supabase and not on plain Postgres.
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on schema commerce from %I', api_role);
      execute format('revoke all on all tables in schema commerce from %I', api_role);
      execute format('revoke all on all sequences in schema commerce from %I', api_role);
      execute format('revoke all on all functions in schema commerce from %I', api_role);
      execute format('alter default privileges in schema commerce revoke all on tables from %I', api_role);
      execute format('alter default privileges in schema commerce revoke all on sequences from %I', api_role);
      execute format('alter default privileges in schema commerce revoke all on functions from %I', api_role);
    end if;
  end loop;
end
$$;
