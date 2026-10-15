-- Anonymous, consented traffic. Financial values always come from commerce orders.
create table if not exists commerce.analytics_events (
  id uuid primary key,
  session_id uuid not null,
  name text not null check (name in ('page_view','product_view','collection_view','cta_click','add_to_cart','begin_checkout','purchase')),
  path text not null check (length(path) <= 200 and path not like '/admin%'),
  click_id text,
  device text not null check (device in ('mobile','tablet','desktop')),
  source text not null check (source in ('direct','search','social','email','referral','internal')),
  mode text not null check (mode in ('fixture','stripe-test','stripe-live')),
  occurred_at timestamptz not null,
  order_id integer unique references commerce.orders(id)
);
create index if not exists analytics_events_time_idx on commerce.analytics_events(mode,occurred_at);
create index if not exists analytics_events_session_idx on commerce.analytics_events(session_id,occurred_at);
create table if not exists commerce.analytics_daily (
  day date not null, mode text not null, name text not null, path text not null,
  click_id text not null default '', device text not null, source text not null, event_count bigint not null,
  primary key(day,mode,name,path,click_id,device,source)
);
create table if not exists commerce.analytics_checkout_attribution (
  checkout_id text primary key references commerce.checkouts(id),
  session_id uuid not null, mode text not null, created_at timestamptz not null default now()
);
create index if not exists analytics_attribution_session_idx on commerce.analytics_checkout_attribution(session_id);
create table if not exists commerce.analytics_rate_buckets (
  bucket text primary key, starts_at timestamptz not null, count integer not null
);
alter table commerce.analytics_events enable row level security;
alter table commerce.analytics_daily enable row level security;
alter table commerce.analytics_checkout_attribution enable row level security;
alter table commerce.analytics_rate_buckets enable row level security;
revoke all on commerce.analytics_events, commerce.analytics_daily, commerce.analytics_checkout_attribution, commerce.analytics_rate_buckets from public;
