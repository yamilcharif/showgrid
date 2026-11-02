-- ShowGrid: owners curate their gear (photos, category, hidden items) and anyone can send suggestions.
-- Run once in the Supabase SQL Editor after 0005_company_page.sql.

-- The owner's own choices win over what the sync brings in, and the sync never overwrites them.
alter table items add column photo_url text;             -- uploaded on ShowGrid; shown instead of image_url
alter table items add column custom_category gear_category; -- set on ShowGrid; shown instead of category

-- gear photos: public to view, only the company owner can add or change files in their folder (<company id>/...)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gear-photos', 'gear-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "owners add gear photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'gear-photos'
    and (storage.foldername(name))[1] in (select id::text from companies where owner_id = auth.uid()));
create policy "owners change gear photos" on storage.objects for update to authenticated
  using (bucket_id = 'gear-photos'
    and (storage.foldername(name))[1] in (select id::text from companies where owner_id = auth.uid()));
create policy "owners remove gear photos" on storage.objects for delete to authenticated
  using (bucket_id = 'gear-photos'
    and (storage.foldername(name))[1] in (select id::text from companies where owner_id = auth.uid()));

-- suggestions: anyone can send one; only the ShowGrid team reads them (Supabase dashboard)
create table feedback (
  id bigint generated always as identity primary key,
  profile_id uuid references profiles on delete set null,
  name text check (name is null or char_length(name) <= 120),
  email text check (email is null or char_length(email) <= 200),
  message text not null check (char_length(message) between 3 and 4000),
  created_at timestamptz not null default now()
);
alter table feedback enable row level security;
create policy "anyone can send feedback" on feedback for insert
  with check (profile_id is null or profile_id = auth.uid());
