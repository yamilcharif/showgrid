-- ShowGrid: owners add items by hand (not from Rentman/Flex) and can delete them.
-- Run once in the Supabase SQL Editor after 0008_crew_photos.sql.

create policy "owners add manual items" on items for insert
  with check (source = 'manual' and company_id in (select id from companies where owner_id = auth.uid()));

-- synced items come back on the next sync, so only hand-added ones can be deleted (synced ones are hidden instead)
create policy "owners delete manual items" on items for delete
  using (source = 'manual' and company_id in (select id from companies where owner_id = auth.uid()));
