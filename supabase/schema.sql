-- =====================================================================
-- WC Artwork Hub — Supabase schema
-- Run this whole file ONCE in Supabase → SQL Editor → New query → Run.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Types ----------
do $$ begin
  create type app_role as enum ('regulatory','designer','management','export','qa','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type artwork_status as enum ('draft','under_review','correction','pending_approval','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type step_state as enum ('pending','current','done');
exception when duplicate_object then null; end $$;

-- ---------- Tables ----------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  email text,
  role app_role not null default 'designer',
  created_at timestamptz not null default now()
);

create table if not exists countries (
  code text primary key,
  name text not null
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text references countries,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  strength text,
  dosage_form text,
  brand text,
  plant text,
  created_at timestamptz not null default now()
);

create sequence if not exists artwork_seq;

create table if not exists artworks (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('ART-' || to_char(now(),'YYYY') || '-' || lpad(nextval('artwork_seq')::text, 4, '0')),
  product_id uuid not null references products,
  country_code text not null references countries,
  customer_id uuid references customers,
  artwork_type text not null,
  pack_size text,
  language text not null default 'English',
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  due_date date,
  status artwork_status not null default 'draft',
  current_version_id uuid,
  notes text,
  created_by uuid references profiles default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists artwork_versions (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references artworks on delete cascade,
  version_label text not null,
  change_note text,
  file_path text not null,
  file_name text,
  mime_type text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references profiles default auth.uid(),
  created_at timestamptz not null default now()
);

do $$ begin
  alter table artworks add constraint fk_current_version
    foreign key (current_version_id) references artwork_versions(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists approval_steps (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references artworks on delete cascade,
  position int not null,
  name text not null,
  role app_role not null,
  state step_state not null default 'pending',
  completed_by uuid references profiles,
  completed_at timestamptz,
  remarks text,
  unique (artwork_id, position)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references artworks on delete cascade,
  version_id uuid references artwork_versions on delete cascade,
  parent_id uuid references comments on delete cascade,
  pin_number int,
  page int not null default 1,
  x numeric,
  y numeric,
  body text not null,
  resolved boolean not null default false,
  resolved_by uuid references profiles,
  resolved_at timestamptz,
  author_id uuid references profiles default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references artworks on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references profiles default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  title text not null,
  body text,
  artwork_id uuid references artworks on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id bigserial primary key,
  artwork_id uuid references artworks on delete set null,
  actor_id uuid references profiles,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade default auth.uid(),
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_artworks_status on artworks(status);
create index if not exists idx_versions_artwork on artwork_versions(artwork_id);
create index if not exists idx_comments_artwork on comments(artwork_id);
create index if not exists idx_steps_artwork on approval_steps(artwork_id);
create index if not exists idx_notif_user on notifications(user_id, read);
create index if not exists idx_audit_artwork on audit_events(artwork_id);

-- ---------- Helpers ----------
create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function notify_role(p_role app_role, p_title text, p_body text, p_artwork uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, title, body, artwork_id)
  select id, p_title, p_body, p_artwork from profiles
  where (role = p_role or role = 'admin') and id is distinct from auth.uid();
end $$;

create or replace function artwork_title(p_artwork uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.name || coalesce(' ' || p.strength, '') || ' · ' || c.name
  from artworks a join products p on p.id = a.product_id join countries c on c.code = a.country_code
  where a.id = p_artwork
$$;

-- New auth user → profile. The very first user becomes admin.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case when exists (select 1 from profiles) then 'designer'::app_role else 'admin'::app_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- New artwork → default 6-stage workflow
create or replace function create_default_steps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into approval_steps (artwork_id, position, name, role, state, completed_by, completed_at) values
    (new.id, 1, 'Artwork Created',   'designer',   'done',    new.created_by, now()),
    (new.id, 2, 'Design Review',     'designer',   'current', null, null),
    (new.id, 3, 'Regulatory Review', 'regulatory', 'pending', null, null),
    (new.id, 4, 'Export Review',     'export',     'pending', null, null),
    (new.id, 5, 'Customer Approval', 'export',     'pending', null, null),
    (new.id, 6, 'Final Approval',    'qa',         'pending', null, null);
  insert into audit_events (artwork_id, actor_id, action, detail)
    values (new.id, new.created_by, 'created', jsonb_build_object('code', new.code));
  return new;
end $$;

drop trigger if exists trg_artwork_steps on artworks;
create trigger trg_artwork_steps after insert on artworks
  for each row execute function create_default_steps();

-- New version → becomes current, artwork goes back into review
create or replace function on_version_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pos int;
begin
  select position into v_pos from approval_steps where artwork_id = new.artwork_id and state = 'current';
  update artworks set
    current_version_id = new.id,
    updated_at = now(),
    status = case
      when status in ('draft','correction','rejected','under_review','pending_approval') then
        case when coalesce(v_pos, 2) <= 2 then 'under_review'::artwork_status else 'pending_approval'::artwork_status end
      else status end
  where id = new.artwork_id;

  insert into audit_events (artwork_id, actor_id, action, detail)
    values (new.artwork_id, new.uploaded_by, 'version_uploaded',
            jsonb_build_object('version', new.version_label, 'note', new.change_note));

  perform notify_role(
    coalesce((select role from approval_steps where artwork_id = new.artwork_id and state = 'current'), 'designer'),
    'New version ' || new.version_label || ' to review', artwork_title(new.artwork_id), new.artwork_id);
  return new;
end $$;

drop trigger if exists trg_version_added on artwork_versions;
create trigger trg_version_added after insert on artwork_versions
  for each row execute function on_version_added();

-- Comments: auto pin numbers + notify artwork owner
create or replace function on_comment_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_name text;
begin
  if new.parent_id is null and new.x is not null and new.pin_number is null then
    select coalesce(max(pin_number), 0) + 1 into new.pin_number
    from comments where artwork_id = new.artwork_id and parent_id is null;
  end if;
  select created_by into v_owner from artworks where id = new.artwork_id;
  select full_name into v_name from profiles where id = new.author_id;
  if v_owner is not null and v_owner is distinct from new.author_id then
    insert into notifications (user_id, title, body, artwork_id)
      values (v_owner, coalesce(v_name, 'Someone') || ' commented', artwork_title(new.artwork_id), new.artwork_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_comment_insert on comments;
create trigger trg_comment_insert before insert on comments
  for each row execute function on_comment_insert();

-- The approval engine: approve / correction / reject on the current step
create or replace function decide_step(p_artwork uuid, p_decision text, p_remarks text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_step approval_steps%rowtype;
  v_next approval_steps%rowtype;
  v_role app_role := my_role();
  v_owner uuid;
  v_title text := artwork_title(p_artwork);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_step from approval_steps
  where artwork_id = p_artwork and state = 'current' for update;
  if not found then raise exception 'This artwork has no open approval step'; end if;

  if v_role is distinct from v_step.role and v_role <> 'admin' then
    raise exception 'Only the % team can sign the "%" step', initcap(v_step.role::text), v_step.name;
  end if;

  if not exists (select 1 from artwork_versions where artwork_id = p_artwork) then
    raise exception 'Upload an artwork file before deciding';
  end if;

  select created_by into v_owner from artworks where id = p_artwork;

  if p_decision = 'approve' then
    update approval_steps set state = 'done', completed_by = auth.uid(), completed_at = now(), remarks = p_remarks
    where id = v_step.id;

    select * into v_next from approval_steps
    where artwork_id = p_artwork and position > v_step.position order by position limit 1;

    if found then
      update approval_steps set state = 'current' where id = v_next.id;
      update artworks set status = 'pending_approval', updated_at = now() where id = p_artwork;
      perform notify_role(v_next.role, v_next.name || ' needed', v_title, p_artwork);
    else
      update artworks set status = 'approved', approved_at = now(), updated_at = now() where id = p_artwork;
      if v_owner is not null then
        insert into notifications (user_id, title, body, artwork_id) values (v_owner, 'Artwork approved', v_title, p_artwork);
      end if;
    end if;

  elsif p_decision = 'correction' then
    update artworks set status = 'correction', updated_at = now() where id = p_artwork;
    update approval_steps set remarks = p_remarks where id = v_step.id;
    perform notify_role('designer', 'Correction requested', v_title, p_artwork);
    if v_owner is not null and v_owner <> auth.uid()
       and not exists (select 1 from profiles where id = v_owner and role in ('designer','admin')) then
      insert into notifications (user_id, title, body, artwork_id) values (v_owner, 'Correction requested', v_title, p_artwork);
    end if;

  elsif p_decision = 'reject' then
    update artworks set status = 'rejected', updated_at = now() where id = p_artwork;
    update approval_steps set remarks = p_remarks where id = v_step.id;
    if v_owner is not null then
      insert into notifications (user_id, title, body, artwork_id) values (v_owner, 'Artwork rejected', v_title, p_artwork);
    end if;
  else
    raise exception 'Unknown decision %', p_decision;
  end if;

  insert into audit_events (artwork_id, actor_id, action, detail)
  values (p_artwork, auth.uid(), p_decision,
          jsonb_build_object('step', v_step.name, 'remarks', p_remarks));
end $$;

grant execute on function decide_step(uuid, text, text) to authenticated;

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table countries enable row level security;
alter table customers enable row level security;
alter table products enable row level security;
alter table artworks enable row level security;
alter table artwork_versions enable row level security;
alter table approval_steps enable row level security;
alter table comments enable row level security;
alter table attachments enable row level security;
alter table notifications enable row level security;
alter table audit_events enable row level security;
alter table saved_views enable row level security;

drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select to authenticated using (true);
drop policy if exists "update own name" on profiles;
create policy "update own name" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = my_role());
drop policy if exists "admin manages profiles" on profiles;
create policy "admin manages profiles" on profiles for update to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Master data: everyone reads, everyone signed-in can add, admin edits/deletes
do $$ declare t text; begin
  foreach t in array array['countries','customers','products'] loop
    execute format('drop policy if exists "read %1$s" on %1$s', t);
    execute format('create policy "read %1$s" on %1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists "add %1$s" on %1$s', t);
    execute format('create policy "add %1$s" on %1$s for insert to authenticated with check (true)', t);
    execute format('drop policy if exists "admin edit %1$s" on %1$s', t);
    execute format('create policy "admin edit %1$s" on %1$s for update to authenticated using (my_role() = ''admin'')', t);
    execute format('drop policy if exists "admin delete %1$s" on %1$s', t);
    execute format('create policy "admin delete %1$s" on %1$s for delete to authenticated using (my_role() = ''admin'')', t);
  end loop;
end $$;

drop policy if exists "read artworks" on artworks;
create policy "read artworks" on artworks for select to authenticated using (true);
drop policy if exists "create artworks" on artworks;
create policy "create artworks" on artworks for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "edit artworks" on artworks;
create policy "edit artworks" on artworks for update to authenticated
  using (created_by = auth.uid() or my_role() in ('admin','designer'));
drop policy if exists "admin delete artworks" on artworks;
create policy "admin delete artworks" on artworks for delete to authenticated using (my_role() = 'admin');

drop policy if exists "read versions" on artwork_versions;
create policy "read versions" on artwork_versions for select to authenticated using (true);
drop policy if exists "add versions" on artwork_versions;
create policy "add versions" on artwork_versions for insert to authenticated with check (uploaded_by = auth.uid());

drop policy if exists "read steps" on approval_steps;
create policy "read steps" on approval_steps for select to authenticated using (true);

drop policy if exists "read comments" on comments;
create policy "read comments" on comments for select to authenticated using (true);
drop policy if exists "add comments" on comments;
create policy "add comments" on comments for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "resolve comments" on comments;
create policy "resolve comments" on comments for update to authenticated using (true);
drop policy if exists "delete own comments" on comments;
create policy "delete own comments" on comments for delete to authenticated using (author_id = auth.uid());

drop policy if exists "read attachments" on attachments;
create policy "read attachments" on attachments for select to authenticated using (true);
drop policy if exists "add attachments" on attachments;
create policy "add attachments" on attachments for insert to authenticated with check (uploaded_by = auth.uid());

drop policy if exists "own notifications" on notifications;
create policy "own notifications" on notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "mark own notifications" on notifications;
create policy "mark own notifications" on notifications for update to authenticated using (user_id = auth.uid());

drop policy if exists "read audit" on audit_events;
create policy "read audit" on audit_events for select to authenticated using (true);

drop policy if exists "own views" on saved_views;
create policy "own views" on saved_views for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Storage (private bucket) ----------
insert into storage.buckets (id, name, public)
values ('artwork-files', 'artwork-files', false)
on conflict (id) do nothing;

drop policy if exists "wc read files" on storage.objects;
create policy "wc read files" on storage.objects for select to authenticated using (bucket_id = 'artwork-files');
drop policy if exists "wc upload files" on storage.objects;
create policy "wc upload files" on storage.objects for insert to authenticated with check (bucket_id = 'artwork-files');

-- ---------- Realtime ----------
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table artworks;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table comments;
exception when others then null; end $$;

-- ---------- Seed master data (edit freely) ----------
insert into countries (code, name) values
  ('PH','Philippines'),('KE','Kenya'),('TZ','Tanzania'),('UG','Uganda'),('MM','Myanmar'),
  ('VN','Vietnam'),('KH','Cambodia'),('NG','Nigeria'),('GH','Ghana'),('LK','Sri Lanka'),
  ('NP','Nepal'),('ET','Ethiopia'),('IN','India')
on conflict (code) do nothing;

insert into products (name, strength, dosage_form, plant)
select * from (values
  ('Rosuvastatin Tablets BP', '10 mg', 'Tablet', 'Vadavswami'),
  ('Rosuvastatin Tablets BP', '20 mg', 'Tablet', 'Vadavswami'),
  ('Dydrogesterone Tablets', '10 mg', 'Tablet', null),
  ('Estradiol Valerate Tablets', '2 mg', 'Tablet', null),
  ('Atorvastatin Tablets', '20 mg', 'Tablet', null)
) v(name, strength, dosage_form, plant)
where not exists (select 1 from products);
