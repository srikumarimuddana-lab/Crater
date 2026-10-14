-- Private, transaction-locked module state. All dedupe keys, customer consent,
-- snapshots, delivery receipts, leases and audit events commit atomically.
-- This single-merchant implementation serializes short state mutations; network
-- calls never run under its lock. Split into aggregate rows before high volume.
create table if not exists commerce.communications_state (
  id integer primary key check(id=1),
  data jsonb not null check(jsonb_typeof(data)='object'),
  updated_at timestamptz not null default now()
);
alter table commerce.communications_state enable row level security;
revoke all on commerce.communications_state from public;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('revoke all on commerce.communications_state from %I',r);
    end if;
  end loop;
end $$;
