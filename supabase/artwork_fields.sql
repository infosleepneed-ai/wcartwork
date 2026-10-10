-- WC Artwork Hub — extra artwork request fields + dropdown lists (run once)
alter table artworks
  add column if not exists request_no text,
  add column if not exists brand_name text,
  add column if not exists marketing_person text,
  add column if not exists registration_no text,
  add column if not exists packaging_type text,
  add column if not exists packing_style text,
  add column if not exists mfg_site text,
  add column if not exists license_code text,
  add column if not exists change_type text,
  add column if not exists effective_date date,
  add column if not exists mfg_date date,
  add column if not exists exp_date date,
  add column if not exists batch_no text,
  add column if not exists regulatory_comments text;
create index if not exists idx_artworks_request on artworks(request_no);

-- Dropdown values (new values typed in the form are added automatically)
create table if not exists lookups (
  kind text not null,
  value text not null,
  created_at timestamptz not null default now(),
  primary key (kind, value)
);
alter table lookups enable row level security;
drop policy if exists "read lookups" on lookups;
create policy "read lookups" on lookups for select to authenticated using (true);
drop policy if exists "add lookups" on lookups;
create policy "add lookups" on lookups for insert to authenticated with check (true);
drop policy if exists "admin delete lookups" on lookups;
create policy "admin delete lookups" on lookups for delete to authenticated using (my_role() = 'admin');

insert into lookups (kind, value) values
  ('packaging_type','Blister'),('packaging_type','Alu-Alu'),('packaging_type','Strip'),('packaging_type','Bottle'),
  ('packaging_type','Tube'),('packaging_type','Sachet'),('packaging_type','Vial'),('packaging_type','Ampoule'),
  ('packing_style','1 x 10'),('packing_style','3 x 10'),('packing_style','10 x 10'),('packing_style','1 x 30'),
  ('change_type','New Artwork'),('change_type','Text Change'),('change_type','Design Change'),
  ('change_type','Regulatory Change'),('change_type','Customer Request'),('change_type','Address Change'),
  ('mfg_site','Vadavswami'),('mfg_site','Gota')
on conflict do nothing;

grant all on lookups to authenticated;
notify pgrst, 'reload schema';
