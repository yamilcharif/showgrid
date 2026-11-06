-- ShowGrid: projects keep the tour routing tool's work too.
-- Run once in the Supabase SQL Editor after 0013_projects.sql.

create or replace function save_project_part(p_project uuid, p_key text, p_value jsonb) returns void
  language sql security invoker set search_path = public as $$
  update projects
  set data = jsonb_set(data, array[p_key], p_value, true), updated_at = now()
  where id = p_project and p_key in ('rider', 'truck', 'pattern', 'labels', 'routing');
$$;
