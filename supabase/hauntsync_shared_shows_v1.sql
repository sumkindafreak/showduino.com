-- HauntSync community library: voluntary published SHDO v2 templates only.
-- Private Showduino projects remain in public.projects and are never auto-published.
create table if not exists public.shared_shows (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 100),
  summary text not null default '' check (char_length(summary) <= 500),
  category text not null default 'other'
    check (category in ('ambience','lighting','pixels','interactive','props','other')),
  document jsonb not null check (
    jsonb_typeof(document) = 'object'
    and document->>'schema' = 'showduino-production-v2'
    and document#>>'{package,format}' = 'showduino-production'
    and document#>>'{package,version}' = '2'
    and document#>>'{safety,policy}' = 'firmware-authoritative'
    and document#>>'{safety,emergency,pixelOverride}' = 'all-white'
    and octet_length(document::text) <= 262144
  ),
  created_at timestamptz not null default now()
);
create index if not exists shared_shows_recent_idx on public.shared_shows(created_at desc);
create index if not exists shared_shows_author_idx on public.shared_shows(author_id);
alter table public.shared_shows enable row level security;

-- Published templates are intentionally public. Only a signed-in creator can
-- publish or unpublish their own work. UPDATE is not supported in this first release.
create policy "shared_shows_read_public" on public.shared_shows
  for select to anon, authenticated using (true);
create policy "shared_shows_publish_own" on public.shared_shows
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "shared_shows_remove_own" on public.shared_shows
  for delete to authenticated using ((select auth.uid()) = author_id);

-- Deny database writes from unsigned visitors and refuse any update by default.
revoke all on table public.shared_shows from anon, authenticated;
grant select on table public.shared_shows to anon, authenticated;
grant insert, delete on table public.shared_shows to authenticated;
