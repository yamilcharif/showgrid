-- ShowGrid: public contact details on profiles, and recording when someone accepted the Terms of Use.
-- Run once in the Supabase SQL Editor after 0011_item_overrides.sql.

alter table companies add column phone text check (phone is null or char_length(phone) <= 40);
alter table companies add column contact_email text check (contact_email is null or char_length(contact_email) <= 200);
alter table companies add column address text check (address is null or char_length(address) <= 300);
alter table companies add column website text check (website is null or char_length(website) <= 300);
alter table companies add column instagram text check (instagram is null or char_length(instagram) <= 60);

alter table techs add column phone text check (phone is null or char_length(phone) <= 40);
alter table techs add column website text check (website is null or char_length(website) <= 300);
alter table techs add column instagram text check (instagram is null or char_length(instagram) <= 60);

-- which version of the Terms of Use the person agreed to, and when (set when the profile is created)
alter table profiles add column terms_accepted_at timestamptz;
alter table profiles add column terms_version text;
grant select (terms_accepted_at, terms_version) on profiles to authenticated;
