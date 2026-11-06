-- ShowGrid: projects keep any tool's work (Show Call and the tools still to come), not just a fixed list.
-- Run once in the Supabase SQL Editor after 0014_project_routing.sql.

create or replace function save_project_part(p_project uuid, p_key text, p_value jsonb) returns void
  language sql security invoker set search_path = public as $$
  update projects
  set data = jsonb_set(data, array[p_key], p_value, true), updated_at = now()
  where id = p_project and p_key ~ '^[a-z][a-z0-9]{1,23}$';
$$;
