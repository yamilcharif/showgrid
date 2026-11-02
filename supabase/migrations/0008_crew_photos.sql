-- ShowGrid: profile photos for crew.
-- Run once in the Supabase SQL Editor after 0007_quotes.sql.

alter table techs add column photo_url text;

-- crew photos live in the public gear-photos bucket under crew/<their user id>/...
create policy "crew add own photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'gear-photos' and (storage.foldername(name))[1] = 'crew'
    and (storage.foldername(name))[2] = auth.uid()::text);
create policy "crew change own photo" on storage.objects for update to authenticated
  using (bucket_id = 'gear-photos' and (storage.foldername(name))[1] = 'crew'
    and (storage.foldername(name))[2] = auth.uid()::text);
create policy "crew remove own photo" on storage.objects for delete to authenticated
  using (bucket_id = 'gear-photos' and (storage.foldername(name))[1] = 'crew'
    and (storage.foldername(name))[2] = auth.uid()::text);
