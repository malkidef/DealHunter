-- DealHunter — shared database foundation
-- Run this file in the Supabase SQL Editor on a new project.
-- Matching and deal creation are server-side only; never expose the service-role key.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 160),
  registration_number text,
  country_code text not null default 'FR' check (country_code ~ '^[A-Z]{2}$'),
  city text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_listings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_name text not null check (length(trim(product_name)) between 2 and 200),
  category text not null,
  description text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null default 'piece',
  unit_price numeric(14,2) not null check (unit_price >= 0),
  currency char(3) not null default 'EUR',
  city text,
  country_code text not null default 'FR' check (country_code ~ '^[A-Z]{2}$'),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'closed')),
  available_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buyer_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_name text not null check (length(trim(product_name)) between 2 and 200),
  category text not null,
  description text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null default 'piece',
  max_unit_price numeric(14,2) check (max_unit_price is null or max_unit_price >= 0),
  currency char(3) not null default 'EUR',
  city text,
  country_code text not null default 'FR' check (country_code ~ '^[A-Z]{2}$'),
  status text not null default 'open'
    check (status in ('draft', 'open', 'paused', 'fulfilled', 'cancelled')),
  needed_by timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.seller_listings(id) on delete cascade,
  request_id uuid not null references public.buyer_requests(id) on delete cascade,
  compatibility_score numeric(5,2) not null check (compatibility_score between 0 and 100),
  status text not null default 'suggested'
    check (status in ('suggested', 'seller_notified', 'buyer_notified', 'accepted', 'declined', 'expired', 'converted')),
  created_at timestamptz not null default now(),
  unique (listing_id, request_id)
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id),
  status text not null default 'awaiting_confirmation'
    check (status in ('awaiting_confirmation', 'accepted', 'completed', 'cancelled', 'disputed', 'refunded')),
  agreed_quantity numeric(14,3) not null check (agreed_quantity > 0),
  agreed_unit_price numeric(14,2) not null check (agreed_unit_price >= 0),
  currency char(3) not null default 'EUR',
  commission_rate numeric(5,4) not null default 0.0500
    check (commission_rate >= 0 and commission_rate <= 0.2000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seller_listings_active_idx
  on public.seller_listings (category, country_code, status) where status = 'active';
create index if not exists buyer_requests_open_idx
  on public.buyer_requests (category, country_code, status) where status = 'open';
create index if not exists seller_listings_company_idx on public.seller_listings(company_id);
create index if not exists buyer_requests_company_idx on public.buyer_requests(company_id);
create index if not exists matches_listing_idx on public.matches(listing_id);
create index if not exists matches_request_idx on public.matches(request_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at before update on public.companies
for each row execute function public.set_updated_at();
drop trigger if exists seller_listings_set_updated_at on public.seller_listings;
create trigger seller_listings_set_updated_at before update on public.seller_listings
for each row execute function public.set_updated_at();
drop trigger if exists buyer_requests_set_updated_at on public.buyer_requests;
create trigger buyer_requests_set_updated_at before update on public.buyer_requests
for each row execute function public.set_updated_at();
drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at before update on public.deals
for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.seller_listings enable row level security;
alter table public.buyer_requests enable row level security;
alter table public.matches enable row level security;
alter table public.deals enable row level security;

-- A signed-in user can manage only companies they own.
drop policy if exists "Owners read their companies" on public.companies;
create policy "Owners read their companies" on public.companies
for select to authenticated using (owner_id = auth.uid());
drop policy if exists "Users create pending companies" on public.companies;
create policy "Users create pending companies" on public.companies
for insert to authenticated with check (owner_id = auth.uid() and verification_status = 'pending');
drop policy if exists "Owners update pending companies" on public.companies;
create policy "Owners update pending companies" on public.companies
for update to authenticated using (owner_id = auth.uid() and verification_status = 'pending')
with check (owner_id = auth.uid() and verification_status = 'pending');

-- Listing and request access is limited to the owning company.
drop policy if exists "Company owners manage listings" on public.seller_listings;
create policy "Company owners manage listings" on public.seller_listings
for all to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()))
with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()));

drop policy if exists "Company owners manage requests" on public.buyer_requests;
create policy "Company owners manage requests" on public.buyer_requests
for all to authenticated
using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()))
with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()));

-- Matches and deals are intentionally read-only for normal client sessions.
-- Trusted server functions using the Supabase service role create/update them.
drop policy if exists "Involved companies read matches" on public.matches;
create policy "Involved companies read matches" on public.matches
for select to authenticated using (
  exists (
    select 1
    from public.seller_listings l
    join public.companies c on c.id = l.company_id
    where l.id = listing_id and c.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.buyer_requests r
    join public.companies c on c.id = r.company_id
    where r.id = request_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "Involved companies read deals" on public.deals;
create policy "Involved companies read deals" on public.deals
for select to authenticated using (
  exists (
    select 1
    from public.matches m
    join public.seller_listings l on l.id = m.listing_id
    join public.companies c on c.id = l.company_id
    where m.id = match_id and c.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.matches m
    join public.buyer_requests r on r.id = m.request_id
    join public.companies c on c.id = r.company_id
    where m.id = match_id and c.owner_id = auth.uid()
  )
);

-- No anonymous/public policies are created. Do not put service-role credentials in the browser.
