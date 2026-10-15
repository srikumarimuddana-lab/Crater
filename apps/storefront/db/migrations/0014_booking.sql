create table if not exists commerce.booking_config(id integer primary key check(id=1),data jsonb not null);
create table if not exists commerce.booking_resources(id text primary key,data jsonb not null);
create table if not exists commerce.booking_services(id text primary key,data jsonb not null);
create table if not exists commerce.booking_records(id uuid primary key,resource_id text not null references commerce.booking_resources(id),service_id text not null references commerce.booking_services(id),starts_at timestamptz not null,ends_at timestamptz not null,status text not null check(status in ('confirmed','cancelled','completed','no_show')),data jsonb not null,check(ends_at>starts_at));
create index if not exists booking_resource_time on commerce.booking_records(resource_id,starts_at,ends_at) where status<>'cancelled';
create table if not exists commerce.booking_events(id text primary key,booking_id uuid references commerce.booking_records(id),data jsonb not null);
create table if not exists commerce.booking_requests(key text primary key,booking_id uuid references commerce.booking_records(id),data jsonb not null);
create table if not exists commerce.booking_audit(id bigserial primary key,data jsonb not null);
do $$ declare t text; r text; begin foreach t in array array['booking_config','booking_resources','booking_services','booking_records','booking_events','booking_requests','booking_audit'] loop execute format('alter table commerce.%I enable row level security',t);execute format('revoke all on commerce.%I from public',t);foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on commerce.%I from %I',t,r);end if;end loop;end loop;end $$;
