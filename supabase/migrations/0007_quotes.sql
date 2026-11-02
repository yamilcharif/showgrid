-- ShowGrid: company logos, per-company rental pricing, formal quotes and chat attachments.
-- Run once in the Supabase SQL Editor after 0006_manage_gear.sql.

-- ---------- logo ----------
alter table companies add column logo_url text;

-- ---------- pricing ----------
-- How many day rates a rental costs, by length. {"tiers":[{"upTo":3,"factor":1},{"upTo":7,"factor":1.5}],"weekly":true}
-- means 1-3 days cost 1 day, 4-7 days cost 1.5 days, and longer rentals repeat the week. Null: every day is charged.
alter table companies add column price_rule jsonb;

-- YC3 Design: 1 day price up to 3 days, 1.5x for a full week
update companies set price_rule = '{"tiers":[{"upTo":3,"factor":1},{"upTo":7,"factor":1.5}],"weekly":true}'
where slug = 'yc3-design';

-- Same rule as rentalFactor() in src/lib/pricing.ts: keep the two in step.
create function rental_factor(rule jsonb, days int) returns numeric
  language plpgsql immutable as $$
declare
  t jsonb;
  max_up int;
  max_factor numeric;
begin
  if days < 1 then return 0; end if;
  if rule is null or jsonb_array_length(coalesce(rule->'tiers', '[]')) = 0 then return days; end if;
  for t in select value from jsonb_array_elements(rule->'tiers') order by (value->>'upTo')::int loop
    if days <= (t->>'upTo')::int then return (t->>'factor')::numeric; end if;
    max_up := (t->>'upTo')::int;
    max_factor := (t->>'factor')::numeric;
  end loop;
  if coalesce((rule->>'weekly')::boolean, false) then
    -- whole periods of the longest tier, then the rest priced by the same rule
    return (days / max_up) * max_factor + rental_factor(rule, days % max_up);
  end if;
  -- past the last tier, each extra day costs one day
  return max_factor + (days - max_up);
end $$;

-- the estimate on new requests uses the company's rule
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
    select id, name, day_rate, public_price into it
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

-- ---------- quotes ----------
alter type request_status add value if not exists 'quoted';

create table quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references rental_requests on delete cascade,
  created_by uuid not null references profiles,
  -- [{"name":"MAC Aura","qty":8,"rate":70}] day rates; [{"label":"Delivery","amount":150}] flat charges
  lines jsonb not null,
  extras jsonb not null default '[]',
  days int not null,
  factor numeric not null,
  total numeric not null,
  currency char(3) not null,
  note text check (note is null or char_length(note) <= 2000),
  valid_until date,
  created_at timestamptz not null default now()
);
alter table quotes enable row level security;
create policy "member quotes" on quotes for select
  using (request_id in (select id from rental_requests)); -- inherits rental_requests visibility
alter table rental_requests add column quote_id uuid references quotes;
alter table messages add column quote_id uuid references quotes;

-- The company that received a request sends (or revises) a formal quote. Totals are worked out here.
create function send_quote(p_request uuid, p_lines jsonb, p_extras jsonb, p_note text, p_valid_until date) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  r rental_requests;
  rule jsonb;
  days int;
  factor numeric;
  total numeric := 0;
  l jsonb;
  q uuid;
begin
  select * into r from rental_requests where id = p_request;
  if not found then raise exception 'not allowed'; end if;
  select price_rule into rule from companies where id = r.company_id and owner_id = auth.uid();
  if not found then raise exception 'not allowed'; end if;
  if r.status in ('confirmed', 'declined') then raise exception 'request is closed'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 300 then raise exception 'empty quote'; end if;
  if jsonb_typeof(coalesce(p_extras, '[]')) <> 'array' or jsonb_array_length(coalesce(p_extras, '[]')) > 50 then raise exception 'bad extras'; end if;

  days := r.end_day - r.start_day + 1;
  factor := rental_factor(rule, days);
  for l in select * from jsonb_array_elements(p_lines) loop
    if (l->>'qty')::numeric < 0 or (l->>'rate')::numeric < 0 then raise exception 'bad line'; end if;
    total := total + (l->>'qty')::numeric * (l->>'rate')::numeric * factor;
  end loop;
  for l in select * from jsonb_array_elements(coalesce(p_extras, '[]')) loop
    total := total + (l->>'amount')::numeric;
  end loop;

  insert into quotes (request_id, created_by, lines, extras, days, factor, total, currency, note, valid_until)
  values (p_request, auth.uid(), p_lines, coalesce(p_extras, '[]'), days, factor, round(total, 2), r.currency,
    nullif(trim(p_note), ''), p_valid_until)
  returning id into q;
  update rental_requests set status = 'quoted', quote_id = q where id = p_request;
  insert into messages (conversation_id, sender_id, body, request_id, quote_id)
  values (r.conversation_id, auth.uid(), 'Quote: ' || r.currency || ' ' || to_char(round(total, 2), 'FM999,999,990.00'), p_request, q);
  return q;
end $$;
revoke execute on function send_quote(uuid, jsonb, jsonb, text, date) from public, anon;
grant execute on function send_quote(uuid, jsonb, jsonb, text, date) to authenticated;

-- The person who asked accepts or declines the latest quote.
create function answer_quote(p_request uuid, p_accept boolean) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r rental_requests;
begin
  select * into r from rental_requests where id = p_request;
  if not found or r.from_profile <> auth.uid() or r.status::text <> 'quoted' then raise exception 'not allowed'; end if;
  update rental_requests set status = case when p_accept then 'confirmed'::request_status else 'declined'::request_status end
  where id = p_request;
  insert into messages (conversation_id, sender_id, body)
  values (r.conversation_id, auth.uid(), case when p_accept then 'Accepted the quote.' else 'Declined the quote.' end);
end $$;
revoke execute on function answer_quote(uuid, boolean) from public, anon;
grant execute on function answer_quote(uuid, boolean) to authenticated;

-- ---------- attachments ----------
alter table messages add column attachment_path text;
alter table messages add column attachment_name text check (attachment_name is null or char_length(attachment_name) <= 200);

-- private bucket: files live under <conversation id>/..., only members of that conversation can add or open them
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "members add chat files" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "members open chat files" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.is_member(((storage.foldername(name))[1])::uuid));
