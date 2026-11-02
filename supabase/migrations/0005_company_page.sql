-- ShowGrid public company pages: show-grid.com/c/<slug> with the full inventory and photos.
-- Run once in the Supabase SQL Editor after 0004_requests.sql.

-- photo from the linked software (Rentman files are public, non-expiring URLs)
alter table items add column image_url text;

alter table companies add column slug text unique;
alter table companies add column about text check (about is null or char_length(about) <= 1000);

-- "YC3 Design" → "yc3-design"; adds a short suffix if the name is taken
create function company_slug(p_name text, p_id uuid) returns text
  language plpgsql set search_path = public as $$
declare
  base text := coalesce(nullif(trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')), ''), 'company');
  candidate text := left(base, 60);
begin
  while exists (select 1 from companies where slug = candidate and id <> p_id) loop
    candidate := left(base, 55) || '-' || substr(md5(random()::text), 1, 4);
  end loop;
  return candidate;
end $$;

create function set_company_slug() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.slug is null then new.slug := company_slug(new.name, new.id); end if;
  return new;
end $$;

create trigger companies_slug before insert on companies for each row execute function set_company_slug();

update companies set slug = company_slug(name, id) where slug is null;
alter table companies alter column slug set not null;
