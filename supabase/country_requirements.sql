-- WC Artwork Hub — Country Requirements (run once in Supabase SQL Editor)
create table if not exists country_requirements (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references countries on delete cascade,
  category text not null check (category in ('artwork','dossier')),
  module text check (module in ('M1','M2','M3','M4','M5')),
  title text not null,
  details text,
  mandatory boolean not null default true,
  created_by uuid references profiles default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_creq_country on country_requirements(country_code);

alter table country_requirements enable row level security;
drop policy if exists "read creq" on country_requirements;
create policy "read creq" on country_requirements for select to authenticated using (true);
drop policy if exists "edit creq" on country_requirements;
create policy "edit creq" on country_requirements for all to authenticated
  using (my_role() in ('admin','regulatory'))
  with check (my_role() in ('admin','regulatory'));

grant all on country_requirements to authenticated;
notify pgrst, 'reload schema';
