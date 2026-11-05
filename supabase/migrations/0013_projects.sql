-- ShowGrid: projects for the tools. Each member keeps their own; a project holds the rider, truck pack,
-- test patterns and labels made for one show, so they can come back to it or download it all at once.
-- Run once in the Supabase SQL Editor after 0012_contact_terms.sql.

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  -- one key per tool: {"rider": {...}, "truck": {...}, "pattern": {...}, "labels": {...}}
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner on projects (owner_id, updated_at desc);

alter table projects enable row level security;
create policy "own projects" on projects for select to authenticated using (owner_id = auth.uid());
create policy "add projects" on projects for insert to authenticated with check (owner_id = auth.uid());
create policy "edit projects" on projects for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete projects" on projects for delete to authenticated using (owner_id = auth.uid());

-- Saves one tool's part without touching the others, so two tools open at once don't overwrite each other.
-- Runs as the caller, so the policies above still decide what can be changed.
create function save_project_part(p_project uuid, p_key text, p_value jsonb) returns void
  language sql security invoker set search_path = public as $$
  update projects
  set data = jsonb_set(data, array[p_key], p_value, true), updated_at = now()
  where id = p_project and p_key in ('rider', 'truck', 'pattern', 'labels');
$$;
revoke execute on function save_project_part(uuid, text, jsonb) from public, anon;
grant execute on function save_project_part(uuid, text, jsonb) to authenticated;
