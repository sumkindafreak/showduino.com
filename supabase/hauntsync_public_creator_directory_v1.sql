-- HauntSync public creator directory (opt-in only).
-- This is intentionally separate from public.profiles. That table and all
-- private projects/devices remain owner-scoped and must NEVER get public SELECT.
-- No existing creator is published by this migration.
create table if not exists public.creator_publications (
  creator_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_-]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 500),
  creator_focus text not null default '' check (char_length(creator_focus) <= 60),
  website_url text check (website_url is null or
    (char_length(website_url) <= 240 and website_url ~ '^https://')),
  avatar_url text check (avatar_url is null or
    (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://')),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creator_publications_updated_idx
  on public.creator_publications(updated_at desc);
alter table public.creator_publications enable row level security;

-- Every row is a voluntarily published public snapshot. Private profile
-- fields, email, devices, and private projects are never part of this table.
create policy "creator_publications_read_public" on public.creator_publications
  for select to anon, authenticated using (true);
create policy "creator_publications_insert_own" on public.creator_publications
  for insert to authenticated with check ((select auth.uid()) = creator_id);
create policy "creator_publications_update_own" on public.creator_publications
  for update to authenticated using ((select auth.uid()) = creator_id)
  with check ((select auth.uid()) = creator_id);
create policy "creator_publications_delete_own" on public.creator_publications
  for delete to authenticated using ((select auth.uid()) = creator_id);
revoke all on public.creator_publications from anon, authenticated;
grant select on public.creator_publications to anon, authenticated;
grant insert, update, delete on public.creator_publications to authenticated;
