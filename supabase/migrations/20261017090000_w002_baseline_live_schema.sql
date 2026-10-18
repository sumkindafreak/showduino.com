-- W002 baseline: the live public schema of Supabase project "showduino"
-- (fczxcvlyydcqdhjkejmd), reconstructed on 2026-10-17 from read-only catalogue
-- queries (pg_attribute, pg_constraint, pg_indexes, pg_policies, pg_trigger,
-- pg_proc, information_schema.role_table_grants, storage.buckets).
--
-- It records what production ALREADY has. It is idempotent and must NOT be
-- "applied" to production. Before relying on it, confirm it with
--   supabase db dump --schema public,storage --data-only=false
-- and `supabase db diff` (both need the database password, which this audit did not use).
-- The older files supabase/hauntsync_*_v1.sql are kept as history.

-- ---------- functions ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Showduino Creator')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
-- Live ACL: handle_new_user executable by postgres and service_role only.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Showduino Creator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  haunt_name text,
  bio text,
  avatar_url text,
  username text,
  creator_focus text not null default '',
  website_url text,
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 60),
  constraint profiles_haunt_name_length check (haunt_name is null or char_length(haunt_name) <= 100),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 500),
  constraint profiles_creator_bio_length check (char_length(bio) <= 500),
  constraint profiles_creator_focus_length check (char_length(creator_focus) <= 60),
  constraint profiles_creator_username_format check (username is null or (username = lower(username) and username ~ '^[a-z0-9_-]{3,30}$')),
  constraint profiles_creator_website_https check (website_url is null or (char_length(website_url) <= 240 and website_url ~ '^https://'))
);
create unique index if not exists profiles_username_ci_unique on public.profiles (lower(username)) where username is not null;

create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Show',
  format text not null default 'showduino-production',
  format_version integer not null default 1 check (format_version > 0),
  project_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_updated_at_idx on public.projects (updated_at desc);
create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  device_type text not null check (char_length(device_type) between 1 and 60),
  identifier text not null check (char_length(identifier) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, identifier)
);
create index if not exists devices_user_created_idx on public.devices (user_id, created_at desc);

create table if not exists public.creator_publications (
  creator_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_-]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 500),
  creator_focus text not null default '' check (char_length(creator_focus) <= 60),
  website_url text check (website_url is null or (char_length(website_url) <= 240 and website_url ~ '^https://')),
  avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://')),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creator_publications_updated_idx on public.creator_publications (updated_at desc);

create table if not exists public.shared_shows (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_label text not null default 'HauntSync creator' check (char_length(author_label) between 1 and 60),
  title text not null check (char_length(title) between 3 and 100),
  summary text not null default '' check (char_length(summary) <= 500),
  license text not null check (license in ('cc-by-4.0','cc0-1.0')),
  is_listed boolean not null default true,
  category text not null default 'other' check (category in ('ambience','lighting','pixels','interactive','props','other')),
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
create index if not exists shared_shows_recent_idx on public.shared_shows (created_at desc);
create index if not exists shared_shows_author_idx on public.shared_shows (author_id);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  author_haunt text check (author_haunt is null or char_length(author_haunt) <= 100),
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 5000),
  category text not null default 'general' check (category in ('general','build-log','show-design','code-control','props-fx','lighting-audio','help-wanted','showcase')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_posts_author_idx on public.community_posts (author_id);
create index if not exists community_posts_created_idx on public.community_posts (created_at desc);
create index if not exists community_posts_category_created_idx on public.community_posts (category, created_at desc);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  content text not null check (char_length(content) between 1 and 2500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_comments_author_idx on public.community_comments (author_id);
create index if not exists community_comments_post_created_idx on public.community_comments (post_id, created_at);

-- ---------- triggers ----------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at before update on public.devices for each row execute function public.set_updated_at();
drop trigger if exists community_posts_set_updated_at on public.community_posts;
create trigger community_posts_set_updated_at before update on public.community_posts for each row execute function public.set_updated_at();
drop trigger if exists community_comments_set_updated_at on public.community_comments;
create trigger community_comments_set_updated_at before update on public.community_comments for each row execute function public.set_updated_at();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.devices enable row level security;
alter table public.creator_publications enable row level security;
alter table public.shared_shows enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;

do $policies$
declare p record;
begin
  for p in select * from (values
    ('profiles','profiles_select_own','select','authenticated','(select auth.uid()) = id',null),
    ('profiles','profiles_insert_own','insert','authenticated',null,'(select auth.uid()) = id'),
    ('profiles','profiles_update_own','update','authenticated','(select auth.uid()) = id','(select auth.uid()) = id'),
    ('projects','projects_select_own','select','authenticated','(select auth.uid()) = user_id',null),
    ('projects','projects_insert_own','insert','authenticated',null,'(select auth.uid()) = user_id'),
    ('projects','projects_update_own','update','authenticated','(select auth.uid()) = user_id','(select auth.uid()) = user_id'),
    ('projects','projects_delete_own','delete','authenticated','(select auth.uid()) = user_id',null),
    ('devices','devices_select_own','select','authenticated','(select auth.uid()) = user_id',null),
    ('devices','devices_insert_own','insert','authenticated',null,'(select auth.uid()) = user_id'),
    ('devices','devices_update_own','update','authenticated','(select auth.uid()) = user_id','(select auth.uid()) = user_id'),
    ('devices','devices_delete_own','delete','authenticated','(select auth.uid()) = user_id',null),
    ('creator_publications','creator_publications_read_public','select','anon, authenticated','true',null),
    ('creator_publications','creator_publications_insert_own','insert','authenticated',null,'(select auth.uid()) = creator_id'),
    ('creator_publications','creator_publications_update_own','update','authenticated','(select auth.uid()) = creator_id','(select auth.uid()) = creator_id'),
    ('creator_publications','creator_publications_delete_own','delete','authenticated','(select auth.uid()) = creator_id',null),
    ('shared_shows','shared_shows_read_public','select','anon, authenticated','is_listed = true',null),
    ('shared_shows','shared_shows_publish_own','insert','authenticated',null,'(select auth.uid()) = author_id and is_listed = true'),
    ('shared_shows','shared_shows_remove_own','delete','authenticated','(select auth.uid()) = author_id',null),
    ('community_posts','community_posts_public_read','select','anon, authenticated','true',null),
    ('community_posts','community_posts_insert_own','insert','authenticated',null,'(select auth.uid()) = author_id'),
    ('community_posts','community_posts_update_own','update','authenticated','(select auth.uid()) = author_id','(select auth.uid()) = author_id'),
    ('community_posts','community_posts_delete_own','delete','authenticated','(select auth.uid()) = author_id',null),
    ('community_comments','community_comments_public_read','select','anon, authenticated','true',null),
    ('community_comments','community_comments_insert_own','insert','authenticated',null,'(select auth.uid()) = author_id'),
    ('community_comments','community_comments_update_own','update','authenticated','(select auth.uid()) = author_id','(select auth.uid()) = author_id'),
    ('community_comments','community_comments_delete_own','delete','authenticated','(select auth.uid()) = author_id',null)
  ) as t(tbl, name, cmd, roles, using_expr, check_expr) loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.name) then
      execute format('create policy %I on public.%I for %s to %s%s%s', p.name, p.tbl, p.cmd, p.roles,
        case when p.using_expr is null then '' else ' using (' || p.using_expr || ')' end,
        case when p.check_expr is null then '' else ' with check (' || p.check_expr || ')' end);
    end if;
  end loop;
end
$policies$;

-- ---------- grants exactly as observed in production (see proposed hardening) ----------
revoke all on public.profiles, public.projects, public.devices, public.creator_publications,
  public.shared_shows, public.community_posts, public.community_comments from anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.profiles to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.projects to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.devices to anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.community_posts to anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.community_comments to anon, authenticated;
grant select on public.creator_publications to anon, authenticated;
grant insert, update, delete on public.creator_publications to authenticated;
grant select on public.shared_shows to anon, authenticated;
grant insert, delete on public.shared_shows to authenticated;

-- ---------- avatar storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hauntsync-avatars', 'hauntsync-avatars', true, 2097152, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do nothing;

do $storage$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='hauntsync_avatar_insert_own') then
    create policy hauntsync_avatar_insert_own on storage.objects for insert to authenticated with check (
      bucket_id = 'hauntsync-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
      and name ~ ('^' || (select auth.uid())::text || '/avatar-[a-f0-9-]+[.](jpg|png|webp)$'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='hauntsync_avatar_select_own') then
    create policy hauntsync_avatar_select_own on storage.objects for select to authenticated using (
      bucket_id = 'hauntsync-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='hauntsync_avatar_delete_own') then
    create policy hauntsync_avatar_delete_own on storage.objects for delete to authenticated using (
      bucket_id = 'hauntsync-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end
$storage$;
