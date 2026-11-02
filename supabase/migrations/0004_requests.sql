-- ShowGrid gear-list requests: send a list to a company, and confirm or decline it.
-- Run once in the Supabase SQL Editor after 0003_rentman.sql.

alter table rental_requests add column note text check (note is null or char_length(note) <= 2000);
-- the name at send time, so the request still reads right if the item changes or is unlisted later
alter table rental_request_lines add column item_name text;

-- status changes show up live in open conversations (Realtime still applies RLS)
alter publication supabase_realtime add table rental_requests;

-- Send one company the caller's list for a date range. Prices come from the database, not the browser,
-- and private day rates are left out of the estimate. Returns the conversation id.
create function send_rental_request(p_company uuid, p_start date, p_end date, p_lines jsonb, p_note text default null)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  owner uuid;
  cur char(3);
  conv uuid;
  req uuid;
  days int;
  total numeric := 0;
  n int := 0;
  line jsonb;
  it record;
  qty int;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception 'finish your profile first'; end if;
  select owner_id, currency into owner, cur from companies where id = p_company;
  if owner is null then raise exception 'unknown company'; end if;
  if owner = me then raise exception 'cannot request your own gear'; end if;
  if p_end < p_start or p_start < current_date - 1 or p_end - p_start > 365 then raise exception 'check the dates'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 200 then raise exception 'empty list'; end if;
  days := p_end - p_start + 1;

  conv := start_conversation(owner);
  insert into rental_requests (conversation_id, from_profile, company_id, start_day, end_day, currency, note)
  values (conv, me, p_company, p_start, p_end, cur, nullif(trim(p_note), ''))
  returning id into req;

  for line in select * from jsonb_array_elements(p_lines) loop
    qty := (line->>'qty')::int;
    select id, name, day_rate, public_price into it
    from items where id = (line->>'item')::uuid and company_id = p_company and listed;
    if not found or qty is null or qty not between 1 and 100000 then raise exception 'an item is no longer available'; end if;
    insert into rental_request_lines (request_id, item_id, quantity, day_rate_at_send, item_name)
    values (req, it.id, qty, case when it.public_price then it.day_rate end, it.name);
    if it.public_price and it.day_rate is not null then total := total + it.day_rate * qty * days; end if;
    n := n + 1;
  end loop;

  update rental_requests set estimate = nullif(total, 0) where id = req;
  insert into messages (conversation_id, sender_id, body, request_id)
  values (conv, me,
    'Gear request: ' || n || case when n = 1 then ' item, ' else ' items, ' end
      || to_char(p_start, 'Mon FMDD') || ' – ' || to_char(p_end, 'Mon FMDD'),
    req);
  return conv;
end $$;
revoke execute on function send_rental_request(uuid, date, date, jsonb, text) from public, anon;
grant execute on function send_rental_request(uuid, date, date, jsonb, text) to authenticated;

-- The company that received a request confirms or declines it; a message records the answer.
create function respond_rental_request(p_request uuid, p_status request_status) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r rental_requests;
begin
  select * into r from rental_requests where id = p_request;
  if not found or not exists (select 1 from companies where id = r.company_id and owner_id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  if p_status = 'pending' then raise exception 'choose confirmed or declined'; end if;
  update rental_requests set status = p_status where id = p_request;
  insert into messages (conversation_id, sender_id, body)
  values (r.conversation_id, auth.uid(),
    case p_status when 'confirmed' then 'Confirmed the gear request for ' else 'Declined the gear request for ' end
      || to_char(r.start_day, 'Mon FMDD') || ' – ' || to_char(r.end_day, 'Mon FMDD') || '.');
end $$;
revoke execute on function respond_rental_request(uuid, request_status) from public, anon;
grant execute on function respond_rental_request(uuid, request_status) to authenticated;
