-- Artwork Hub — configurable approval workflows (run once in Supabase SQL Editor)

create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_default boolean not null default false,
  active boolean not null default true,
  allowed_roles app_role[] not null default '{}',   -- empty = everyone can use it
  created_by uuid references profiles default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_default_workflow on workflows (is_default) where is_default;

create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows on delete cascade,
  position int not null,
  name text not null,
  role app_role,                                   -- team that can sign (optional)
  assignee_ids uuid[] not null default '{}',       -- specific people who can sign (optional)
  unique (workflow_id, position)
);

alter table artworks add column if not exists workflow_id uuid references workflows on delete set null;
alter table approval_steps add column if not exists assignee_ids uuid[] not null default '{}';
alter table approval_steps alter column role drop not null;

-- Seed the standard workflow once
do $$ declare w uuid; begin
  if not exists (select 1 from workflows) then
    insert into workflows (name, description, is_default) values
      ('Standard artwork approval', 'Design → Regulatory → Export → Customer → QA', true) returning id into w;
    insert into workflow_steps (workflow_id, position, name, role) values
      (w, 1, 'Design Review', 'designer'), (w, 2, 'Regulatory Review', 'regulatory'),
      (w, 3, 'Export Review', 'export'), (w, 4, 'Customer Approval', 'export'), (w, 5, 'Final Approval', 'qa');
  end if;
end $$;

-- Who may sign a step
create or replace function can_sign(p_role app_role, p_assignees uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() = 'admin'
      or (p_role is not null and my_role() = p_role)
      or auth.uid() = any(coalesce(p_assignees, '{}'))
$$;

-- Notify everyone who can act on a step
create or replace function notify_step(p_step uuid, p_title text, p_artwork uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, title, body, artwork_id)
  select p.id, p_title, artwork_title(p_artwork), p_artwork
  from profiles p join approval_steps s on s.id = p_step
  where (p.role = 'admin' or (s.role is not null and p.role = s.role) or p.id = any(s.assignee_ids))
    and p.id is distinct from auth.uid();
end $$;

-- New artworks get the default workflow if none picked
create or replace function set_default_workflow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.workflow_id is null then
    select id into new.workflow_id from workflows where is_default and active limit 1;
  end if;
  return new;
end $$;
drop trigger if exists trg_artwork_default_wf on artworks;
create trigger trg_artwork_default_wf before insert on artworks for each row execute function set_default_workflow();

-- Copy the workflow's steps onto the artwork
create or replace function create_default_steps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into approval_steps (artwork_id, position, name, role, state, completed_by, completed_at)
    values (new.id, 1, 'Artwork Created', 'designer', 'done', new.created_by, now());

  if new.workflow_id is not null and exists (select 1 from workflow_steps where workflow_id = new.workflow_id) then
    insert into approval_steps (artwork_id, position, name, role, assignee_ids, state)
    select new.id, 1 + rn, name, role, assignee_ids, case when rn = 1 then 'current'::step_state else 'pending'::step_state end
    from (select *, row_number() over (order by position) as rn from workflow_steps where workflow_id = new.workflow_id) ws;
  else
    insert into approval_steps (artwork_id, position, name, role, state) values
      (new.id, 2, 'Design Review', 'designer', 'current'), (new.id, 3, 'Regulatory Review', 'regulatory', 'pending'),
      (new.id, 4, 'Export Review', 'export', 'pending'), (new.id, 5, 'Customer Approval', 'export', 'pending'),
      (new.id, 6, 'Final Approval', 'qa', 'pending');
  end if;

  insert into audit_events (artwork_id, actor_id, action, detail)
    values (new.id, new.created_by, 'created', jsonb_build_object('code', new.code));
  return new;
end $$;

create or replace function on_version_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_step approval_steps%rowtype;
begin
  select * into v_step from approval_steps where artwork_id = new.artwork_id and state = 'current';
  update artworks set
    current_version_id = new.id, updated_at = now(),
    status = case when status = 'approved' then status
                  when coalesce(v_step.position, 2) <= 2 then 'under_review'::artwork_status
                  else 'pending_approval'::artwork_status end
  where id = new.artwork_id;
  insert into audit_events (artwork_id, actor_id, action, detail)
    values (new.artwork_id, new.uploaded_by, 'version_uploaded', jsonb_build_object('version', new.version_label, 'note', new.change_note));
  if v_step.id is not null then
    perform notify_step(v_step.id, 'New version ' || new.version_label || ' to review', new.artwork_id);
  end if;
  return new;
end $$;

create or replace function decide_step(p_artwork uuid, p_decision text, p_remarks text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_step approval_steps%rowtype;
  v_next approval_steps%rowtype;
  v_owner uuid;
  v_title text := artwork_title(p_artwork);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_step from approval_steps where artwork_id = p_artwork and state = 'current' for update;
  if not found then raise exception 'This artwork has no open approval step'; end if;
  if not can_sign(v_step.role, v_step.assignee_ids) then
    raise exception 'You don''t have access to sign the "%" step', v_step.name;
  end if;
  if not exists (select 1 from artwork_versions where artwork_id = p_artwork) then
    raise exception 'Upload an artwork file before deciding';
  end if;
  select created_by into v_owner from artworks where id = p_artwork;

  if p_decision = 'approve' then
    update approval_steps set state = 'done', completed_by = auth.uid(), completed_at = now(), remarks = p_remarks where id = v_step.id;
    select * into v_next from approval_steps where artwork_id = p_artwork and position > v_step.position order by position limit 1;
    if found then
      update approval_steps set state = 'current' where id = v_next.id;
      update artworks set status = 'pending_approval', updated_at = now() where id = p_artwork;
      perform notify_step(v_next.id, v_next.name || ' needed', p_artwork);
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
  values (p_artwork, auth.uid(), p_decision, jsonb_build_object('step', v_step.name, 'remarks', p_remarks));
end $$;

-- Save a workflow and its steps in one go (admin only)
create or replace function save_workflow(p_id uuid, p_name text, p_description text, p_default boolean,
  p_active boolean, p_allowed_roles text[], p_steps jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; s jsonb; i int := 0;
begin
  if my_role() is distinct from 'admin' then raise exception 'Only admins can manage workflows'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Workflow name is required'; end if;
  if jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) = 0 then raise exception 'Add at least one step'; end if;
  if p_default and not p_active then raise exception 'The default workflow must be active'; end if;

  if p_default then update workflows set is_default = false where is_default and id is distinct from v_id; end if;
  if v_id is null then
    insert into workflows (name, description, is_default, active, allowed_roles, created_by)
    values (trim(p_name), p_description, p_default, p_active, coalesce(p_allowed_roles, '{}')::app_role[], auth.uid())
    returning id into v_id;
  else
    update workflows set name = trim(p_name), description = p_description, is_default = p_default, active = p_active,
      allowed_roles = coalesce(p_allowed_roles, '{}')::app_role[], updated_at = now() where id = v_id;
  end if;

  delete from workflow_steps where workflow_id = v_id;
  for s in select * from jsonb_array_elements(p_steps) loop
    i := i + 1;
    if coalesce(trim(s->>'name'), '') = '' then raise exception 'Step % needs a name', i; end if;
    if coalesce(s->>'role', '') = '' and jsonb_array_length(coalesce(s->'assignee_ids', '[]'::jsonb)) = 0 then
      raise exception 'Step "%" needs a team or at least one person', s->>'name';
    end if;
    insert into workflow_steps (workflow_id, position, name, role, assignee_ids)
    values (v_id, i, trim(s->>'name'), nullif(s->>'role', '')::app_role,
            coalesce(array(select jsonb_array_elements_text(coalesce(s->'assignee_ids', '[]'::jsonb)))::uuid[], '{}'));
  end loop;
  return v_id;
end $$;
grant execute on function save_workflow(uuid, text, text, boolean, boolean, text[], jsonb) to authenticated;

-- Security
alter table workflows enable row level security;
alter table workflow_steps enable row level security;
drop policy if exists "read workflows" on workflows;
create policy "read workflows" on workflows for select to authenticated using (true);
drop policy if exists "admin delete workflows" on workflows;
create policy "admin delete workflows" on workflows for delete to authenticated using (my_role() = 'admin' and not is_default);
drop policy if exists "read workflow steps" on workflow_steps;
create policy "read workflow steps" on workflow_steps for select to authenticated using (true);

grant all on workflows, workflow_steps to authenticated;
grant execute on all functions in schema public to authenticated;
notify pgrst, 'reload schema';
