-- HauntSync community library: voluntary published SHDO v2 templates only.
-- Private Showduino projects remain in public.projects and are never auto-published.
create table if not exists public.shared_shows (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_label text not null default 'HauntSync creator' check (char_length(author_label) between 1 and 60),
  title text not null check (char_length(title) between 3 and 100),
  summary text not null default '' check (char_length(summary) <= 500),
  license text not null check (license in ('cc-by-4.0','cc0-1.0')),
  is_listed boolean not null default true,
  category text not null default 'other'
    check (category in ('ambience','lighting','pixels','interactive','props','other')),
  document jsonb not null check (
    jsonb_typeof(document) = 'object'
    and document->>'schema' = 'showduino-production-v2'
    and document#>>'{package,format}' = 'showduino-production'
    and document#>>'{package,version}' = '2'
    and document#>>'{safety,policy}' = 'firmware-authoritative'
    and document#>>'{safety,emergency,pixelOverride}' = 'all-white'
    and document#>>'{safety,emergency,stopTimeline}' = 'true'
    and document#>>'{safety,emergency,requiresManualClear}' = 'true'
    and document#>>'{safety,emergency,autoResume}' = 'false'
    and document#>>'{safety,emergency,productionCannotDisable}' = 'true'
    and document#>>'{metadata,communityTemplate}' = 'true'
    and document->'assets' = '[]'::jsonb
    and document->'globalSettings' = '{}'::jsonb
    and not jsonb_path_exists(document, '$.devices[*].binding.nodeId')
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
  for select to anon, authenticated using (is_listed = true);
create policy "shared_shows_publish_own" on public.shared_shows
  for insert to authenticated with check ((select auth.uid()) = author_id and is_listed = true);
create policy "shared_shows_remove_own" on public.shared_shows
  for delete to authenticated using ((select auth.uid()) = author_id);

-- Administrators can hide or delete inappropriate publications from the service role.
-- Client users cannot update visibility or any other field.
-- Deny database writes from unsigned visitors and refuse any update by default.
revoke all on table public.shared_shows from anon, authenticated;
grant select on table public.shared_shows to anon, authenticated;
grant insert, delete on table public.shared_shows to authenticated;
