-- ShowGrid: owners rename and describe synced items without the nightly sync overwriting it.
-- Run once in the Supabase SQL Editor after 0009_manual_items.sql.

alter table items add column custom_name text check (custom_name is null or char_length(custom_name) <= 200);
alter table items add column custom_spec text check (custom_spec is null or char_length(custom_spec) <= 300);
