-- ShowGrid inventory sync (Rentman first, Flex later).
-- Run once in the Supabase SQL Editor after 0002_messages.sql.

alter type gear_category add value if not exists 'Other';

-- where each item came from, so a sync only replaces its own rows
alter table items add column source inventory_source not null default 'manual';

-- owners can see their connection's status, never the secret
create policy "own connections" on inventory_connections for select
  using (company_id in (select id from companies where owner_id = auth.uid()));
revoke select on inventory_connections from anon, authenticated;
grant select (id, company_id, source, last_synced_at, last_error) on inventory_connections to authenticated;

-- Save (or replace) the company owner's API token in Supabase Vault, encrypted.
-- Only the secret's id is kept in inventory_connections.
create function save_inventory_token(p_source inventory_source, p_token text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  co uuid;
  sid uuid;
begin
  select id into co from companies where owner_id = auth.uid();
  if co is null then raise exception 'only rental companies can connect inventory'; end if;
  if length(coalesce(p_token, '')) < 20 then raise exception 'token looks too short'; end if;

  select secret_id into sid from inventory_connections where company_id = co and source = p_source;
  if sid is not null then
    perform vault.update_secret(sid, p_token);
  else
    sid := vault.create_secret(p_token, 'inventory:' || co || ':' || p_source, 'API token for inventory sync');
  end if;

  insert into inventory_connections (company_id, source, secret_id) values (co, p_source, sid)
  on conflict (company_id, source) do update set secret_id = excluded.secret_id, last_error = null;
  return co;
end $$;
revoke execute on function save_inventory_token(inventory_source, text) from public, anon;
grant execute on function save_inventory_token(inventory_source, text) to authenticated;

-- Read a token back, for the server-side sync job only (service role).
create function inventory_token(p_connection uuid) returns text
  language sql security definer set search_path = public as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  join inventory_connections c on c.secret_id = s.id
  where c.id = p_connection
$$;
revoke execute on function inventory_token(uuid) from public, anon, authenticated;
grant execute on function inventory_token(uuid) to service_role;
