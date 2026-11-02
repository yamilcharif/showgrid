-- ShowGrid initial schema (Supabase / Postgres).
-- Not applied yet: run with `supabase db push` once the Supabase project is linked.

create extension if not exists postgis;
create extension if not exists pg_trgm;

-- ---------- accounts ----------

create type account_kind as enum ('company', 'tech');
create type inventory_source as enum ('rentman', 'flex', 'manual');

-- one row per signed-in user (auth.users is managed by Supabase Auth)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  kind account_kind not null,
  display_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  name text not null,
  city_label text not null,
  country_code char(2) not null,
  location geography(point) not null,
  currency char(3) not null,
  -- set by an admin after checking business registration
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index companies_location_idx on companies using gist (location);

-- encrypted credentials for Rentman / Flex; never readable from the browser
create table inventory_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  source inventory_source not null,
  -- store via Supabase Vault (vault.create_secret); keep only the secret's id here
  secret_id uuid,
  flex_base_url text,
  last_synced_at timestamptz,
  last_error text,
  unique (company_id, source)
);

create table techs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  name text not null,
  role text not null,
  skills text[] not null default '{}',
  years_experience int not null default 0,
  city_label text not null,
  country_code char(2) not null,
  location geography(point) not null,
  currency char(3) not null,
  day_rate numeric(12, 2),
  available boolean not null default true,
  created_at timestamptz not null default now()
);
create index techs_location_idx on techs using gist (location);

-- ---------- inventory ----------

create type gear_category as enum ('Lighting', 'Audio', 'Video', 'Rigging', 'Power', 'Staging', 'Backline', 'Effects');

create table items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  -- id of the item in Rentman/Flex, so syncs update instead of duplicating
  external_id text,
  name text not null,
  category gear_category not null,
  spec text,
  tags text,
  quantity_owned int not null check (quantity_owned >= 0),
  -- day rate in the company's currency, from the linked software
  day_rate numeric(12, 2),
  listed boolean not null default true,
  public_price boolean not null default true,
  search tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(tags, '') || ' ' || coalesce(spec, ''))
  ) stored,
  updated_at timestamptz not null default now(),
  unique (company_id, external_id)
);
create index items_search_idx on items using gin (search);
create index items_name_trgm_idx on items using gin (name gin_trgm_ops);

-- units already committed elsewhere, per day, from Rentman/Flex
create table item_bookings (
  item_id uuid not null references items on delete cascade,
  day date not null,
  quantity_booked int not null check (quantity_booked >= 0),
  primary key (item_id, day)
);

create table tech_busy_days (
  tech_id uuid not null references techs on delete cascade,
  day date not null,
  primary key (tech_id, day)
);

-- ---------- messaging and gear-list requests ----------

create table conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table conversation_members (
  conversation_id uuid not null references conversations on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  last_read_at timestamptz,
  primary key (conversation_id, profile_id)
);

create type request_status as enum ('pending', 'confirmed', 'declined');

create table rental_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations on delete cascade,
  from_profile uuid not null references profiles,
  company_id uuid references companies,
  tech_id uuid references techs,
  start_day date not null,
  end_day date not null check (end_day >= start_day),
  -- estimate shown to the renter at send time; the company confirms the real price
  estimate numeric(12, 2),
  currency char(3),
  status request_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table rental_request_lines (
  request_id uuid not null references rental_requests on delete cascade,
  item_id uuid not null references items,
  quantity int not null check (quantity > 0),
  day_rate_at_send numeric(12, 2),
  primary key (request_id, item_id)
);

create table messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references conversations on delete cascade,
  sender_id uuid not null references profiles,
  body text,
  request_id uuid references rental_requests,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at);

-- ---------- row level security ----------
-- Public can browse listed gear and crew; only members see their conversations.

alter table profiles enable row level security;
alter table companies enable row level security;
alter table inventory_connections enable row level security;
alter table techs enable row level security;
alter table items enable row level security;
alter table item_bookings enable row level security;
alter table tech_busy_days enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table rental_requests enable row level security;
alter table rental_request_lines enable row level security;
alter table messages enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());

create policy "browse companies" on companies for select using (true);
create policy "own company" on companies for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- inventory_connections: no policies, so only the server (service role) can read the secrets

create policy "browse techs" on techs for select using (true);
create policy "own tech profile" on techs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "browse listed items" on items for select
  using (listed or company_id in (select id from companies where owner_id = auth.uid()));
create policy "own items" on items for update
  using (company_id in (select id from companies where owner_id = auth.uid()));

create policy "browse bookings" on item_bookings for select using (true);
create policy "browse busy days" on tech_busy_days for select using (true);

-- security definer so policies on conversation_members don't recurse into themselves
create function is_member(conv uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from conversation_members where conversation_id = conv and profile_id = auth.uid())
  $$;

create policy "member conversations" on conversations for select using (is_member(id));
create policy "member rows" on conversation_members for select using (is_member(conversation_id));
create policy "member messages" on messages for select using (is_member(conversation_id));
create policy "send as self" on messages for insert
  with check (sender_id = auth.uid() and is_member(conversation_id));
create policy "member requests" on rental_requests for select using (is_member(conversation_id));
create policy "member request lines" on rental_request_lines for select
  using (request_id in (select id from rental_requests)); -- inherits rental_requests visibility
