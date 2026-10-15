create table if not exists commerce.interaction_documents(key text primary key, data jsonb not null);
create table if not exists commerce.interaction_limits(key text primary key,start_ms bigint not null,count integer not null check(count>0));
alter table commerce.interaction_documents enable row level security;
alter table commerce.interaction_limits enable row level security;
revoke all on commerce.interaction_documents,commerce.interaction_limits from public;
do $$ declare r text; begin foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on commerce.interaction_documents,commerce.interaction_limits from %I',r); end if; end loop; end $$;
