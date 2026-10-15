-- HauntSync creator profile fields for the existing Showduino Supabase project.
-- Apply ONLY after checking the live public.profiles table and its existing RLS policies.
-- No authentication schema, project data or existing profile records are deleted.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists creator_focus text not null default '';
alter table public.profiles add column if not exists website_url text;

create unique index if not exists profiles_username_ci_unique
  on public.profiles (lower(username)) where username is not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_creator_username_format' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_creator_username_format
      check (username is null or (username = lower(username) and username ~ '^[a-z0-9_-]{3,30}$'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_creator_bio_length' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_creator_bio_length check (char_length(bio) <= 500);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_creator_focus_length' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_creator_focus_length check (char_length(creator_focus) <= 60);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_creator_website_https' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_creator_website_https
      check (website_url is null or (char_length(website_url) <= 240 and website_url ~ '^https://'));
  end if;
end
$migration$;

-- SECURITY DEPLOY GATE:
-- Existing RLS must restrict profile UPDATE to auth.uid() = id.
-- Do NOT use a permissive public SELECT/UPDATE policy to launch profiles.
-- Public profile browsing and follows are deliberately deferred.
