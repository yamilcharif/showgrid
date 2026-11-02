-- ShowGrid: owners set their own price and quantity on synced items; the sync never overwrites them.
-- Run once in the Supabase SQL Editor after 0010_item_edits.sql.

alter table items add column custom_day_rate numeric(12, 2) check (custom_day_rate is null or custom_day_rate >= 0);
alter table items add column custom_quantity int check (custom_quantity is null or custom_quantity >= 0);

-- requests use the owner's price and title when they've set their own
create or replace function send_rental_request(p_company uuid, p_start date, p_end date, p_lines jsonb, p_note text default null)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  owner uuid;
  cur char(3);
  rule jsonb;
  conv uuid;
  req uuid;
  factor numeric;
  total numeric := 0;
  n int := 0;
  line jsonb;
  it record;
  qty int;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception 'finish your profile first'; end if;
  select owner_id, currency, price_rule into owner, cur, rule from companies where id = p_company;
  if owner is null then raise exception 'unknown company'; end if;
  if owner = me then raise exception 'cannot request your own gear'; end if;
  if p_end < p_start or p_start < current_date - 1 or p_end - p_start > 365 then raise exception 'check the dates'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 200 then raise exception 'empty list'; end if;
  factor := rental_factor(rule, p_end - p_start + 1);

  conv := start_conversation(owner);
  insert into rental_requests (conversation_id, from_profile, company_id, start_day, end_day, currency, note)
  values (conv, me, p_company, p_start, p_end, cur, nullif(trim(p_note), ''))
  returning id into req;

  for line in select * from jsonb_array_elements(p_lines) loop
    qty := (line->>'qty')::int;
    select id, coalesce(custom_name, name) as name, coalesce(custom_day_rate, day_rate) as day_rate, public_price into it
    from items where id = (line->>'item')::uuid and company_id = p_company and listed;
    if not found or qty is null or qty not between 1 and 100000 then raise exception 'an item is no longer available'; end if;
    insert into rental_request_lines (request_id, item_id, quantity, day_rate_at_send, item_name)
    values (req, it.id, qty, case when it.public_price then it.day_rate end, it.name);
    if it.public_price and it.day_rate is not null then total := total + it.day_rate * qty * factor; end if;
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

