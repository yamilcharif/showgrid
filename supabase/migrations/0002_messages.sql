-- ShowGrid messaging: public names, starting a conversation, inbox, realtime.
-- Run once in the Supabase SQL Editor after 0001_init.sql.

-- Names are public (they're on listings anyway); email stays private via column grants.
create policy "browse profiles" on profiles for select using (true);
revoke select on profiles from anon, authenticated;
grant select (id, kind, display_name, created_at) on profiles to anon, authenticated;

-- members can mark their own conversations as read
create policy "update own membership" on conversation_members for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

alter table messages add constraint messages_body_len check (body is null or char_length(body) between 1 and 4000);

-- Find the one-to-one conversation between the caller and another profile, or create it.
-- security definer because members can't insert other people's membership rows themselves.
create function start_conversation(other uuid) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if other = me then raise exception 'cannot message yourself'; end if;
  if not exists (select 1 from profiles where id = other) then raise exception 'unknown profile'; end if;

  select a.conversation_id into conv
  from conversation_members a
  join conversation_members b on b.conversation_id = a.conversation_id and b.profile_id = other
  where a.profile_id = me
    and (select count(*) from conversation_members c where c.conversation_id = a.conversation_id) = 2
  limit 1;

  if conv is null then
    insert into conversations default values returning id into conv;
    insert into conversation_members (conversation_id, profile_id) values (conv, me), (conv, other);
  end if;
  return conv;
end $$;
revoke execute on function start_conversation(uuid) from public, anon;
grant execute on function start_conversation(uuid) to authenticated;

-- Inbox for the caller: the other person, last message and unread count. Runs with the caller's RLS.
create function my_conversations()
  returns table (id uuid, other_id uuid, other_name text, other_kind account_kind, last_body text, last_at timestamptz, last_from_me boolean, unread int)
  language sql stable set search_path = public as $$
  select c.id, o.profile_id, p.display_name, p.kind, m.body, coalesce(m.created_at, c.created_at), m.sender_id = auth.uid(),
    (select count(*)::int from messages x
      where x.conversation_id = c.id and x.sender_id <> auth.uid() and x.created_at > coalesce(me.last_read_at, '-infinity'))
  from conversation_members me
  join conversations c on c.id = me.conversation_id
  join conversation_members o on o.conversation_id = c.id and o.profile_id <> me.profile_id
  join profiles p on p.id = o.profile_id
  left join lateral (
    select body, created_at, sender_id from messages where conversation_id = c.id order by created_at desc limit 1
  ) m on true
  where me.profile_id = auth.uid()
  order by 6 desc
$$;

-- new messages are pushed to open conversations (Realtime still applies RLS)
alter publication supabase_realtime add table messages;
