create table if not exists admin.content_documents (
  key text primary key,
  version integer not null default 0 check (version >= 0),
  draft jsonb, published jsonb
);
create table if not exists admin.content_revisions (
  key text not null references admin.content_documents(key),
  version integer not null,
  data jsonb not null,
  action text not null check (action in ('save','publish')),
  actor text not null,
  created_at timestamptz not null default now(),
  primary key (key,version)
);
create table if not exists admin.media_assets (
  id uuid primary key,
  name text not null,
  alt text not null,
  mime text not null check (mime='image/webp'),
  width integer not null,
  height integer not null,
  content bytea not null check (octet_length(content) <= 10485760),
  published boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table admin.content_documents enable row level security;
alter table admin.content_revisions enable row level security;
alter table admin.media_assets enable row level security;
revoke all on admin.content_documents, admin.content_revisions, admin.media_assets from public;
