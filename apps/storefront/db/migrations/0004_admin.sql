-- Admin Slice 1 (docs/admin/plan.md): staff sign-in, audit log, product status, cost and thresholds,
-- order fulfilment and shipping address, inventory movements, webhook event log.
--
-- Conventions as in 0001: every object is schema-qualified; row level security is ON for every table with
-- NO policies (the API roles read and write nothing; the app connects as the owner, which bypasses RLS);
-- no session state, so it is safe behind a transaction pooler. Idempotent: safe to re-run by hand. The
-- migration runner wraps this file in one transaction; do not BEGIN/COMMIT here.
--
-- PRODUCT STATUS vs archived_at (one source of truth): products.status is authoritative (DRAFT | ACTIVE |
-- ARCHIVED) and the storefront lists and sells ACTIVE products only. archived_at (0003) is kept as the
-- timestamp of archiving and a CHECK constraint ties the two together: archived_at is set if and only if
-- status = 'ARCHIVED'. Code that archives a product sets both; nothing reads archived_at to decide visibility.

create schema if not exists admin;

-- ---------------------------------------------------------------------------------------------------------
-- admin schema

create table if not exists admin.staff_users (
  id              integer generated always as identity primary key,
  -- Stored lower-cased; compared case-insensitively by always lower-casing at the edge.
  email           text not null unique check (email = lower(email) and length(email) between 3 and 254),
  name            text not null check (length(name) between 1 and 120),
  role            text not null check (role in ('OWNER', 'ADMIN', 'FULFILMENT', 'BOOKKEEPER', 'SUPPORT')),
  status          text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  -- Built-in provider only. NULL once another provider owns the credentials (Supabase Auth later).
  password_hash   text,
  -- AES-256-GCM envelope (v1.iv.ciphertext.tag) under ADMIN_SECRET_KEY. Never plaintext.
  totp_secret_enc text,
  mfa_enrolled_at timestamptz,
  -- Highest TOTP time-step already accepted (RFC 6238 replay guard): a code is only valid for a larger step.
  last_totp_step  bigint,
  -- Supabase migration: maps to auth.users.id once that provider is enabled.
  auth_subject    text unique,
  created_at      timestamptz not null default now(),
  last_sign_in_at timestamptz,
  check ((totp_secret_enc is null) = (mfa_enrolled_at is null))
);

-- Only the SHA-256 of the 256-bit cookie token is stored.
create table if not exists admin.staff_sessions (
  id                   bigint generated always as identity primary key,
  staff_id             integer not null references admin.staff_users (id) on delete cascade,
  token_hash           text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at           timestamptz not null,
  last_seen_at         timestamptz not null,
  absolute_expires_at  timestamptz not null,
  stepped_up_at        timestamptz
);
create index if not exists staff_sessions_staff_idx on admin.staff_sessions (staff_id);
create index if not exists staff_sessions_expiry_idx on admin.staff_sessions (absolute_expires_at);

-- Password accepted, second factor still to come. Short-lived; keyed by the hash of a pending cookie token.
create table if not exists admin.pending_sign_ins (
  token_hash        text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  staff_id          integer not null references admin.staff_users (id) on delete cascade,
  kind              text not null check (kind in ('MFA_REQUIRED', 'MFA_ENROL')),
  -- Encrypted candidate TOTP secret while enrolling; moved to staff_users on confirmation.
  enrol_secret_enc  text,
  attempts          integer not null default 0,
  created_at        timestamptz not null,
  expires_at        timestamptz not null
);
create index if not exists pending_sign_ins_expiry_idx on admin.pending_sign_ins (expires_at);

-- Rate limiting by SHA-256 of the normalised email or IP (no raw identifiers stored).
create table if not exists admin.login_attempts (
  kind            text not null check (kind in ('email', 'ip')),
  key_hash        text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  failures        integer not null default 0,
  last_failure_at timestamptz,
  locked_until    timestamptz,
  primary key (kind, key_hash)
);

-- Append-only (enforced by triggers below). No foreign keys: history outlives staff rows.
create table if not exists admin.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    integer,
  actor_email text,
  action      text not null check (length(action) between 1 and 80),
  target_type text,
  target_id   text,
  -- { field: { from, to } }. Never PII or secrets.
  changes     jsonb not null default '{}',
  -- Truncated client address (IPv4 /24, IPv6 /48).
  ip_trunc    text
);
create index if not exists audit_log_at_idx on admin.audit_log (at desc, id desc);
create index if not exists audit_log_action_idx on admin.audit_log (action);

create or replace function admin.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_schema || '.' || tg_table_name using errcode = '42501';
end
$$;

drop trigger if exists audit_log_append_only on admin.audit_log;
create trigger audit_log_append_only before update or delete on admin.audit_log
  for each row execute function admin.forbid_mutation();
drop trigger if exists audit_log_no_truncate on admin.audit_log;
create trigger audit_log_no_truncate before truncate on admin.audit_log
  for each statement execute function admin.forbid_mutation();

-- ---------------------------------------------------------------------------------------------------------
-- commerce additions

alter table commerce.products add column if not exists status text not null default 'ACTIVE';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_status_check' and conrelid = 'commerce.products'::regclass) then
    alter table commerce.products add constraint products_status_check check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED'));
  end if;
end
$$;
-- Existing rows keep selling (ACTIVE) except those 0003 archived.
update commerce.products set status = 'ARCHIVED' where archived_at is not null and status <> 'ARCHIVED';
-- A product archived by status always carries a timestamp, and a timestamp always means ARCHIVED.
update commerce.products set archived_at = now() where status = 'ARCHIVED' and archived_at is null;
update commerce.products set archived_at = null where status <> 'ARCHIVED' and archived_at is not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_status_archived_at_check' and conrelid = 'commerce.products'::regclass) then
    alter table commerce.products add constraint products_status_archived_at_check check ((status = 'ARCHIVED') = (archived_at is not null));
  end if;
end
$$;
-- New products start as drafts: nothing half-finished goes live.
alter table commerce.products alter column status set default 'DRAFT';
create index if not exists products_status_idx on commerce.products (status);

alter table commerce.variants add column if not exists cost_minor integer check (cost_minor is null or cost_minor >= 0);
alter table commerce.variants add column if not exists low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0);

alter table commerce.orders add column if not exists fulfilment_status text not null default 'UNFULFILLED'
  check (fulfilment_status in ('UNFULFILLED', 'FULFILLED'));
alter table commerce.orders add column if not exists shipping_address jsonb;
alter table commerce.orders add column if not exists packing_instructions text check (packing_instructions is null or length(packing_instructions) <= 2000);
alter table commerce.orders add column if not exists internal_notes text check (internal_notes is null or length(internal_notes) <= 4000);
create index if not exists orders_fulfilment_idx on commerce.orders (fulfilment_status, processed_at);

-- One fulfilment per order in Slice 1 (the unique key makes "mark fulfilled" idempotent under retries).
create table if not exists commerce.order_fulfilments (
  id              integer generated always as identity primary key,
  order_id        integer not null unique references commerce.orders (id) on delete cascade,
  carrier         text not null check (length(carrier) between 1 and 60),
  tracking_number text not null check (length(tracking_number) between 1 and 60),
  fulfilled_at    timestamptz not null,
  staff_id        integer references admin.staff_users (id)
);

-- Append-only stock ledger. variant_id has no foreign key on purpose: history survives catalogue edits
-- (sku is snapshotted). available_after is the variants.inventory_quantity value after the change.
create table if not exists commerce.inventory_movements (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  variant_id      integer not null,
  sku             text not null,
  delta           integer not null check (delta <> 0),
  reason          text not null check (reason in ('RECEIVED', 'COUNT_CORRECTION', 'DAMAGED', 'RETURN_RESTOCK', 'OTHER', 'ORDER_PAID')),
  note            text check (note is null or length(note) <= 500),
  staff_id        integer,
  order_id        integer references commerce.orders (id),
  available_after integer not null check (available_after >= 0)
);
create index if not exists inventory_movements_variant_idx on commerce.inventory_movements (variant_id, id desc);
create index if not exists inventory_movements_at_idx on commerce.inventory_movements (id desc);
-- A replayed paid-order event can never write the same sale twice.
create unique index if not exists inventory_movements_order_paid_uq on commerce.inventory_movements (order_id, variant_id) where reason = 'ORDER_PAID';

drop trigger if exists inventory_movements_append_only on commerce.inventory_movements;
create trigger inventory_movements_append_only before update or delete on commerce.inventory_movements
  for each row execute function admin.forbid_mutation();
drop trigger if exists inventory_movements_no_truncate on commerce.inventory_movements;
create trigger inventory_movements_no_truncate before truncate on commerce.inventory_movements
  for each statement execute function admin.forbid_mutation();

-- Outcome of each verified Stripe event we act on (the dedupe table stays processed_webhook_events).
-- Metadata only: no payload, no PII.
create table if not exists commerce.webhook_events (
  id          bigint generated always as identity primary key,
  event_id    text not null,
  event_type  text not null,
  outcome     text not null check (outcome in ('PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED')),
  received_at timestamptz not null default now()
);
create index if not exists webhook_events_received_idx on commerce.webhook_events (id desc);

-- ---------------------------------------------------------------------------------------------------------
-- Lock the API roles out: RLS on, no policies, no grants.

alter table admin.staff_users                 enable row level security;
alter table admin.staff_sessions              enable row level security;
alter table admin.pending_sign_ins            enable row level security;
alter table admin.login_attempts              enable row level security;
alter table admin.audit_log                   enable row level security;
alter table commerce.order_fulfilments        enable row level security;
alter table commerce.inventory_movements      enable row level security;
alter table commerce.webhook_events           enable row level security;

revoke update, delete, truncate on admin.audit_log from public;
revoke update, delete, truncate on commerce.inventory_movements from public;

do $$
declare
  api_role text;
  schema_name text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      foreach schema_name in array array['admin', 'commerce'] loop
        execute format('revoke all on schema %I from %I', schema_name, api_role);
        execute format('revoke all on all tables in schema %I from %I', schema_name, api_role);
        execute format('revoke all on all sequences in schema %I from %I', schema_name, api_role);
        execute format('revoke all on all functions in schema %I from %I', schema_name, api_role);
        execute format('alter default privileges in schema %I revoke all on tables from %I', schema_name, api_role);
        execute format('alter default privileges in schema %I revoke all on sequences from %I', schema_name, api_role);
        execute format('alter default privileges in schema %I revoke all on functions from %I', schema_name, api_role);
      end loop;
    end if;
  end loop;
end
$$;
