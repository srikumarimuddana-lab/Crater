-- Private operational ledger. Mode mutex serializes financial limits and period changes.
create table if not exists commerce.finance_locks (mode text primary key check(mode in ('test','live')));
insert into commerce.finance_locks values ('test'),('live') on conflict do nothing;
create or replace function commerce.finance_balanced(data jsonb) returns boolean language plpgsql immutable as $$
declare l jsonb; debit numeric; credit numeric; total_debit numeric := 0; total_credit numeric := 0;
begin
 if coalesce(jsonb_typeof(data->'lines'),'') <> 'array' then return false; end if;
 if jsonb_array_length(data->'lines') < 2 then return false; end if;
 for l in select value from jsonb_array_elements(data->'lines') loop
  if coalesce(l->>'account','') not in ('stripe_clearing','bank','inventory','supplier_payable','product_revenue','shipping_revenue','sales_returns','tax_payable','cost_of_goods','payment_fees','inventory_adjustments','suspense') then return false; end if;
  if coalesce(jsonb_typeof(l->'debit'),'') <> 'number' or coalesce(jsonb_typeof(l->'credit'),'') <> 'number' then return false; end if;
  debit := (l->>'debit')::numeric; credit := (l->>'credit')::numeric;
  if debit < 0 or credit < 0 or debit <> trunc(debit) or credit <> trunc(credit) or debit > 9007199254740991 or credit > 9007199254740991 or ((debit=0) = (credit=0)) then return false; end if;
  total_debit := total_debit+debit; total_credit := total_credit+credit;
 end loop;
 return total_debit=total_credit and total_debit <= 9007199254740991;
exception when others then return false;
end $$;
create table if not exists commerce.finance_payments (
 mode text not null references commerce.finance_locks, id text not null, data jsonb not null,
 primary key(mode,id), check(data->>'mode'=mode), check((data->>'totalMinor')::bigint>=0)
);
create table if not exists commerce.finance_refunds (
 mode text not null references commerce.finance_locks, id text not null, data jsonb not null,
 primary key(mode,id), check(data->>'mode'=mode), check((data->>'amountMinor')::bigint>0),
 check(data->>'status' in ('requested','submitted','pending','unknown','succeeded','failed'))
);
create unique index if not exists finance_refunds_provider on commerce.finance_refunds(mode,(data->>'providerId')) where data->>'providerId' is not null;
create table if not exists commerce.finance_journals (
 mode text not null references commerce.finance_locks, id text not null, data jsonb not null,
 primary key(mode,id), check(data->>'mode'=mode), check(commerce.finance_balanced(data))
);
create table if not exists commerce.finance_periods (mode text not null references commerce.finance_locks,id text not null,data jsonb not null,primary key(mode,id));
create table if not exists commerce.finance_audit (mode text not null references commerce.finance_locks,id text not null,data jsonb not null,primary key(mode,id));
create or replace function commerce.finance_immutable() returns trigger language plpgsql as $$ begin raise exception 'Posted finance records are immutable; post a reversal'; end $$;
drop trigger if exists finance_journal_immutable on commerce.finance_journals;
create trigger finance_journal_immutable before update or delete on commerce.finance_journals for each row execute function commerce.finance_immutable();
drop trigger if exists finance_audit_immutable on commerce.finance_audit;
create trigger finance_audit_immutable before update or delete on commerce.finance_audit for each row execute function commerce.finance_immutable();
alter table commerce.finance_locks enable row level security;
alter table commerce.finance_payments enable row level security;
alter table commerce.finance_refunds enable row level security;
alter table commerce.finance_journals enable row level security;
alter table commerce.finance_periods enable row level security;
alter table commerce.finance_audit enable row level security;
create table if not exists commerce.finance_reconciliation (mode text not null references commerce.finance_locks,id text not null,data jsonb not null,primary key(mode,id));
alter table commerce.finance_reconciliation enable row level security;
