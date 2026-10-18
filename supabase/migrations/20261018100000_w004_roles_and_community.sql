-- W004: exclusive founder ownership, member roles, HauntSync community and moderation.
--
-- * Exactly one owner: the founder's Supabase Auth user, pinned by UUID. Ownership is never
--   derived from a name, username, email or any field a user can edit, and cannot be granted
--   through the API. Changing it needs a new migration (see app_owner_guard).
-- * Every other account is a member. Members cannot change roles, statuses or moderation fields:
--   those columns are not granted to them, and all owner actions go through SECURITY DEFINER
--   functions that check public.is_owner() in the database and write public.moderation_log.
-- * Includes the W002 hardening proposed in supabase/proposed/20261017090100_w002_hardening.sql.
--
-- Rollback: supabase/rollback/20261018100000_w004_roles_and_community.rollback.sql
-- Tested by supabase/tests/w004_roles_community.sql (tools/db-test-local.sh).
begin;

-- ============================================================================================
-- 0. W002 hardening (W-010, W-012, W-013, W-026)
-- ============================================================================================
revoke truncate, references, trigger on public.profiles, public.projects, public.devices,
  public.community_posts, public.community_comments from anon, authenticated;
revoke all on public.profiles, public.projects, public.devices from anon;
revoke insert, update, delete on public.community_posts, public.community_comments from anon;
revoke execute on function public.set_updated_at() from anon, authenticated, public;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_data_size') then
    alter table public.projects add constraint projects_data_size
      check (octet_length(project_data::text) <= 1048576) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'creator_publications_avatar_own_storage') then
    alter table public.creator_publications add constraint creator_publications_avatar_own_storage
      check (avatar_url is null or avatar_url like 'https://fczxcvlyydcqdhjkejmd.supabase.co/storage/v1/object/public/hauntsync-avatars/%') not valid;
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 60), ''), 'Showduino Creator'))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ============================================================================================
-- 1. Owner (exactly one, pinned by UUID)
-- ============================================================================================
create table public.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by text not null default current_user,
  note text not null default '',
  -- The founder's account, confirmed by the founder on 2026-10-18 (W004). Changing the owner
  -- requires a new, reviewed migration that replaces this constraint.
  constraint app_owner_pinned check (user_id = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea'::uuid)
);
-- RLS on with no policies: no API role can read or write it. Only SECURITY DEFINER functions
-- owned by the table owner (below) can read it.
alter table public.app_owner enable row level security;
revoke all on public.app_owner from public, anon, authenticated, service_role;

create function public.app_owner_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('showduino.owner_change', true), '') <> 'approved-by-migration' then
    raise exception 'The Showduino owner can only be changed by a reviewed database migration.'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger app_owner_guard before insert or update or delete on public.app_owner
  for each row execute function public.app_owner_guard();
create trigger app_owner_no_truncate before truncate on public.app_owner
  for each statement execute function public.app_owner_guard();

select set_config('showduino.owner_change', 'approved-by-migration', true);
insert into public.app_owner (user_id, note)
  values ('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea', 'Founder account, confirmed by the founder (W004).');
select set_config('showduino.owner_change', '', true);

create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_owner o where o.user_id = (select auth.uid()));
$$;

create function public.community_founder_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.app_owner limit 1;
$$;

create function public.require_owner() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'Only the Showduino owner can do this.' using errcode = '42501';
  end if;
end;
$$;

-- ============================================================================================
-- 2. Member status (active / restricted / suspended)
-- ============================================================================================
create table public.member_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'restricted', 'suspended')),
  reason text not null default '' check (char_length(reason) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.member_status enable row level security;
revoke all on public.member_status from public, anon, authenticated;
grant select on public.member_status to authenticated;
create policy member_status_read_own_or_owner on public.member_status for select to authenticated
  using (user_id = (select auth.uid()) or public.is_owner());

create function public.member_status_protect_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' and exists (select 1 from public.app_owner o where o.user_id = new.user_id) then
    raise exception 'The Showduino owner account cannot be restricted or suspended.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger member_status_protect_owner before insert or update on public.member_status
  for each row execute function public.member_status_protect_owner();

create function public.member_state(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.status from public.member_status s where s.user_id = p_user), 'active');
$$;

-- A creator is publicly visible when they have published a creator profile and are not suspended.
create function public.author_is_public(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.creator_publications c where c.creator_id = p_user)
     and public.member_state(p_user) <> 'suspended';
$$;

-- Posting, commenting, sharing and reporting need a signed-in, active member with a published
-- creator profile (so every public contribution has a public, accountable identity).
create function public.can_participate() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and public.member_state((select auth.uid())) = 'active'
     and exists (select 1 from public.creator_publications c where c.creator_id = (select auth.uid()));
$$;

create function public.public_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.display_name from public.creator_publications c where c.creator_id = p_user),
    (select p.display_name from public.profiles p where p.id = p_user),
    'Showduino Creator');
$$;

-- ============================================================================================
-- 3. Reserved names (no impersonation of the founder or of Showduino)
-- ============================================================================================
create function public.name_is_reserved(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  select p_name is not null and (
    regexp_replace(lower(p_name), '[^a-z0-9]', '', 'g') ~ '(admin|founder|moderator|official|showduino|hauntsync|staff)'
    or regexp_replace(lower(p_name), '[^a-z0-9]', '', 'g') in ('mod', 'mods', 'root', 'system', 'owner', 'support', 'help', 'security')
  );
$$;

create function public.reserved_names_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  -- Server-side writes (migrations, the auth signup trigger) have no auth.uid().
  if uid is null or public.is_owner() then return new; end if;
  if tg_table_name = 'profiles' then
    if public.name_is_reserved(new.username) and new.username is distinct from (case when tg_op = 'UPDATE' then old.username end) then
      raise exception 'That username is reserved.' using errcode = '23514';
    end if;
    if public.name_is_reserved(new.display_name) and new.display_name is distinct from (case when tg_op = 'UPDATE' then old.display_name end) then
      raise exception 'That display name is reserved for Showduino.' using errcode = '23514';
    end if;
  else
    if public.name_is_reserved(new.username) or public.name_is_reserved(new.display_name) then
      raise exception 'That name is reserved for Showduino.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_reserved_names before insert or update of username, display_name on public.profiles
  for each row execute function public.reserved_names_guard();
create trigger creator_publications_reserved_names before insert or update on public.creator_publications
  for each row execute function public.reserved_names_guard();

-- Suspended members' creator profiles are hidden; they cannot publish while suspended.
drop policy if exists creator_publications_read_public on public.creator_publications;
create policy creator_publications_read_public on public.creator_publications for select to anon, authenticated
  using (public.member_state(creator_id) <> 'suspended' or creator_id = (select auth.uid()) or public.is_owner());
drop policy if exists creator_publications_insert_own on public.creator_publications;
create policy creator_publications_insert_own on public.creator_publications for insert to authenticated
  with check ((select auth.uid()) = creator_id and public.member_state(creator_id) <> 'suspended');
drop policy if exists creator_publications_update_own on public.creator_publications;
create policy creator_publications_update_own on public.creator_publications for update to authenticated
  using ((select auth.uid()) = creator_id)
  with check ((select auth.uid()) = creator_id and public.member_state(creator_id) <> 'suspended');

-- ============================================================================================
-- 4. Rate limits
-- ============================================================================================
create function public.rate_limit_check(p_kind text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n_short int; n_day int;
begin
  if p_user is null or public.is_owner() then return; end if;
  if p_kind = 'post' then
    select count(*) filter (where created_at > now() - interval '10 minutes'), count(*) filter (where created_at > now() - interval '1 day')
      into n_short, n_day from public.community_posts where author_id = p_user and created_at > now() - interval '1 day';
    if n_short >= 5 or n_day >= 20 then raise exception 'You are posting too quickly. Please wait a few minutes.' using errcode = '54000'; end if;
  elsif p_kind = 'comment' then
    select count(*) filter (where created_at > now() - interval '10 minutes'), count(*) filter (where created_at > now() - interval '1 day')
      into n_short, n_day from public.community_comments where author_id = p_user and created_at > now() - interval '1 day';
    if n_short >= 20 or n_day >= 150 then raise exception 'You are commenting too quickly. Please wait a few minutes.' using errcode = '54000'; end if;
  elsif p_kind = 'show' then
    select count(*) into n_day from public.shared_shows where author_id = p_user and created_at > now() - interval '1 day';
    if n_day >= 5 then raise exception 'You can share up to 5 shows a day.' using errcode = '54000'; end if;
  elsif p_kind = 'report' then
    select count(*) into n_short from public.content_reports where reporter_id = p_user and created_at > now() - interval '1 hour';
    if n_short >= 10 then raise exception 'You have sent many reports recently. Please wait an hour.' using errcode = '54000'; end if;
  elsif p_kind = 'follow' then
    select count(*) into n_short from public.creator_follows where follower_id = p_user and created_at > now() - interval '1 hour';
    if n_short >= 100 then raise exception 'You are following too quickly. Please wait.' using errcode = '54000'; end if;
  end if;
end;
$$;

-- ============================================================================================
-- 5. Categories
-- ============================================================================================
create table public.community_categories (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 200),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.community_categories enable row level security;
revoke all on public.community_categories from public, anon, authenticated;
grant select on public.community_categories to anon, authenticated;
create policy community_categories_read on public.community_categories for select to anon, authenticated
  using (is_active or public.is_owner());
insert into public.community_categories (slug, name, description, sort_order) values
  ('show-control', 'Show control', 'Showduino Director, Studio, timelines, triggers and cues.', 10),
  ('lighting', 'Lighting', 'Lamps, pixels, DMX and lighting design.', 20),
  ('audio', 'Audio', 'Soundscapes, Audio Node, speakers and amplification.', 30),
  ('animatronics', 'Animatronics', 'Motion, servos, pneumatics and figures.', 40),
  ('effects', 'Effects', 'Fog, wind, scares and special effects.', 50),
  ('electronics', 'Electronics', 'Wiring, power, ESP32 and sensors.', 60),
  ('3d-printing', '3D printing', 'Printed props, enclosures and parts.', 70),
  ('general', 'General discussion', 'Everything else.', 90);

-- ============================================================================================
-- 6. Posts
-- ============================================================================================
update public.community_posts set category = case category
  when 'lighting-audio' then 'lighting' when 'props-fx' then 'effects'
  when 'code-control' then 'show-control' when 'show-design' then 'show-control'
  else 'general' end
  where category not in (select slug from public.community_categories);
alter table public.community_posts drop constraint if exists community_posts_category_check;
alter table public.community_posts
  add constraint community_posts_category_fkey foreign key (category) references public.community_categories(slug) on update cascade,
  add column kind text not null default 'discussion' check (kind in ('discussion', 'build_log', 'showcase', 'question')),
  add column image_path text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/post-[0-9a-f-]{36}\.(jpg|png|webp)$'),
  add column shared_show_id uuid references public.shared_shows(id) on delete set null,
  add column status text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  add column is_featured boolean not null default false,
  add column moderation_reason text not null default '' check (char_length(moderation_reason) <= 500),
  add column moderated_at timestamptz,
  add column moderated_by uuid references auth.users(id) on delete set null,
  add column edited_at timestamptz;
create index community_posts_visible_recent_idx on public.community_posts (created_at desc) where status = 'visible';
create index community_posts_featured_idx on public.community_posts (created_at desc) where is_featured and status = 'visible';

create function public.community_posts_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.rate_limit_check('post', new.author_id);
    new.status := 'visible'; new.is_featured := false; new.moderation_reason := '';
    new.moderated_at := null; new.moderated_by := null; new.edited_at := null;
    new.created_at := now(); new.updated_at := now();
  elsif (new.title, new.content, new.category, new.kind, new.image_path, new.shared_show_id)
        is distinct from (old.title, old.content, old.category, old.kind, old.image_path, old.shared_show_id) then
    new.edited_at := now();
  end if;
  if (tg_op = 'INSERT' or new.category is distinct from old.category) and not public.is_owner()
     and not exists (select 1 from public.community_categories c where c.slug = new.category and c.is_active) then
    raise exception 'That category is not open for posts.' using errcode = '23514';
  end if;
  -- The public name always comes from the server, never from the browser.
  new.author_name := left(public.public_name(new.author_id), 60);
  new.author_haunt := null;
  if new.image_path is not null and split_part(new.image_path, '/', 1) <> new.author_id::text then
    raise exception 'Post images must be uploaded to your own folder.' using errcode = '42501';
  end if;
  if new.shared_show_id is not null and not exists (
       select 1 from public.shared_shows s where s.id = new.shared_show_id and s.author_id = new.author_id) then
    raise exception 'You can only attach your own shared shows.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger community_posts_before_write before insert or update on public.community_posts
  for each row execute function public.community_posts_before_write();

revoke all on public.community_posts from anon, authenticated;
grant select on public.community_posts to anon, authenticated;
grant insert (id, author_id, title, content, category, kind, image_path, shared_show_id) on public.community_posts to authenticated;
grant update (title, content, category, kind, image_path, shared_show_id) on public.community_posts to authenticated;
grant delete on public.community_posts to authenticated;

drop policy if exists community_posts_public_read on public.community_posts;
drop policy if exists community_posts_insert_own on public.community_posts;
drop policy if exists community_posts_update_own on public.community_posts;
drop policy if exists community_posts_delete_own on public.community_posts;
create policy community_posts_read on public.community_posts for select to anon, authenticated
  using ((status = 'visible' and public.author_is_public(author_id)) or author_id = (select auth.uid()) or public.is_owner());
create policy community_posts_insert_own on public.community_posts for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_participate());
create policy community_posts_update_own on public.community_posts for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.can_participate());
create policy community_posts_delete_own on public.community_posts for delete to authenticated
  using (author_id = (select auth.uid()));

-- ============================================================================================
-- 7. Comments and replies
-- ============================================================================================
alter table public.community_comments
  add column parent_id uuid references public.community_comments(id) on delete cascade,
  add column status text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  add column moderation_reason text not null default '' check (char_length(moderation_reason) <= 500),
  add column moderated_at timestamptz,
  add column moderated_by uuid references auth.users(id) on delete set null,
  add column edited_at timestamptz;
create index community_comments_parent_idx on public.community_comments (parent_id);

create function public.community_comments_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  parent record;
begin
  if tg_op = 'INSERT' then
    perform public.rate_limit_check('comment', new.author_id);
    new.status := 'visible'; new.moderation_reason := ''; new.moderated_at := null; new.moderated_by := null;
    new.edited_at := null; new.created_at := now(); new.updated_at := now();
    if new.parent_id is not null then
      select c.post_id, c.parent_id into parent from public.community_comments c where c.id = new.parent_id;
      if not found or parent.post_id <> new.post_id then
        raise exception 'A reply must belong to the same post.' using errcode = '23514';
      end if;
      -- One level of replies: a reply to a reply joins the same thread.
      if parent.parent_id is not null then new.parent_id := parent.parent_id; end if;
    end if;
  elsif new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  new.author_name := left(public.public_name(new.author_id), 60);
  return new;
end;
$$;
create trigger community_comments_before_write before insert or update on public.community_comments
  for each row execute function public.community_comments_before_write();

revoke all on public.community_comments from anon, authenticated;
grant select on public.community_comments to anon, authenticated;
grant insert (id, post_id, author_id, content, parent_id) on public.community_comments to authenticated;
grant update (content) on public.community_comments to authenticated;
grant delete on public.community_comments to authenticated;

drop policy if exists community_comments_public_read on public.community_comments;
drop policy if exists community_comments_insert_own on public.community_comments;
drop policy if exists community_comments_update_own on public.community_comments;
drop policy if exists community_comments_delete_own on public.community_comments;
-- The post subquery is itself filtered by the posts policy, so comments on hidden posts are hidden.
create policy community_comments_read on public.community_comments for select to anon, authenticated
  using (((status = 'visible' and public.author_is_public(author_id)
          and exists (select 1 from public.community_posts p where p.id = post_id))
         or author_id = (select auth.uid()) or public.is_owner()));
create policy community_comments_insert_own on public.community_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_participate()
              and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'visible'));
create policy community_comments_update_own on public.community_comments for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.can_participate());
create policy community_comments_delete_own on public.community_comments for delete to authenticated
  using (author_id = (select auth.uid()));

-- ============================================================================================
-- 8. Shared .shdo shows: moderation, server-side attribution, rate limit
-- ============================================================================================
alter table public.shared_shows
  add column status text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  add column is_featured boolean not null default false,
  add column moderation_reason text not null default '' check (char_length(moderation_reason) <= 500),
  add column moderated_at timestamptz,
  add column moderated_by uuid references auth.users(id) on delete set null;

create function public.shared_shows_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.rate_limit_check('show', new.author_id);
    new.status := 'visible'; new.is_featured := false; new.moderation_reason := '';
    new.moderated_at := null; new.moderated_by := null; new.created_at := now();
  end if;
  new.author_label := left(public.public_name(new.author_id), 60);
  return new;
end;
$$;
create trigger shared_shows_before_write before insert or update on public.shared_shows
  for each row execute function public.shared_shows_before_write();

revoke all on public.shared_shows from anon, authenticated;
grant select on public.shared_shows to anon, authenticated;
grant insert (author_id, title, summary, category, license, document, is_listed) on public.shared_shows to authenticated;
grant delete on public.shared_shows to authenticated;

drop policy if exists shared_shows_read_public on public.shared_shows;
drop policy if exists shared_shows_publish_own on public.shared_shows;
create policy shared_shows_read_public on public.shared_shows for select to anon, authenticated
  using ((is_listed and status = 'visible' and public.author_is_public(author_id))
         or author_id = (select auth.uid()) or public.is_owner());
create policy shared_shows_publish_own on public.shared_shows for insert to authenticated
  with check ((select auth.uid()) = author_id and is_listed = true and public.can_participate());

-- ============================================================================================
-- 9. Following
-- ============================================================================================
create table public.creator_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index creator_follows_followee_idx on public.creator_follows (followee_id);
alter table public.creator_follows enable row level security;
revoke all on public.creator_follows from public, anon, authenticated;
grant select on public.creator_follows to anon, authenticated;
grant insert (follower_id, followee_id), delete on public.creator_follows to authenticated;

create function public.creator_follows_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.rate_limit_check('follow', new.follower_id);
  new.created_at := now();
  return new;
end;
$$;
create trigger creator_follows_before_insert before insert on public.creator_follows
  for each row execute function public.creator_follows_before_insert();

-- A follow is public only when both sides have published profiles; members always see their own.
create policy creator_follows_read on public.creator_follows for select to anon, authenticated
  using ((public.author_is_public(followee_id) and public.author_is_public(follower_id))
         or follower_id = (select auth.uid()) or public.is_owner());
create policy creator_follows_insert_own on public.creator_follows for insert to authenticated
  with check (follower_id = (select auth.uid()) and public.member_state(follower_id) <> 'suspended'
              and public.author_is_public(followee_id));
create policy creator_follows_delete_own on public.creator_follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- ============================================================================================
-- 10. Reports
-- ============================================================================================
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('post', 'comment', 'shared_show', 'creator')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'hateful', 'sexual', 'violence', 'dangerous', 'impersonation', 'copyright', 'unsafe_show', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text not null default '' check (char_length(resolution_note) <= 1000),
  unique (reporter_id, target_type, target_id)
);
create index content_reports_open_idx on public.content_reports (created_at desc) where status = 'open';
create index content_reports_target_idx on public.content_reports (target_type, target_id);
alter table public.content_reports enable row level security;
revoke all on public.content_reports from public, anon, authenticated;
grant select on public.content_reports to authenticated;
grant insert (id, reporter_id, target_type, target_id, reason, details) on public.content_reports to authenticated;

create function public.content_reports_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  found_target boolean;
begin
  perform public.rate_limit_check('report', new.reporter_id);
  new.status := 'open'; new.resolved_at := null; new.resolved_by := null; new.resolution_note := '';
  new.created_at := now();
  found_target := case new.target_type
    when 'post' then exists (select 1 from public.community_posts where id = new.target_id)
    when 'comment' then exists (select 1 from public.community_comments where id = new.target_id)
    when 'shared_show' then exists (select 1 from public.shared_shows where id = new.target_id)
    when 'creator' then exists (select 1 from public.creator_publications where creator_id = new.target_id)
  end;
  if not found_target then raise exception 'That item no longer exists.' using errcode = '23503'; end if;
  return new;
end;
$$;
create trigger content_reports_before_insert before insert on public.content_reports
  for each row execute function public.content_reports_before_insert();

create policy content_reports_read_own_or_owner on public.content_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_owner());
create policy content_reports_insert_own on public.content_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.member_state(reporter_id) <> 'suspended');

-- ============================================================================================
-- 11. Moderation audit trail (append-only)
-- ============================================================================================
create table public.moderation_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index moderation_log_recent_idx on public.moderation_log (created_at desc);
create index moderation_log_target_idx on public.moderation_log (target_type, target_id);
alter table public.moderation_log enable row level security;
revoke all on public.moderation_log from public, anon, authenticated, service_role;
grant select on public.moderation_log to authenticated;
create policy moderation_log_owner_read on public.moderation_log for select to authenticated using (public.is_owner());

create function public.moderation_log_append_only() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'The moderation log is append-only.' using errcode = '42501';
end;
$$;
create trigger moderation_log_append_only before update or delete on public.moderation_log
  for each row execute function public.moderation_log_append_only();
create trigger moderation_log_no_truncate before truncate on public.moderation_log
  for each statement execute function public.moderation_log_append_only();

create function public.log_moderation(p_action text, p_target_type text, p_target_id text, p_reason text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.moderation_log (actor_id, action, target_type, target_id, reason, details)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, left(coalesce(p_reason, ''), 500), coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function public.log_moderation(text, text, text, text, jsonb) from public, anon, authenticated;

-- Log the owner assignment made above.
insert into public.moderation_log (actor_id, action, target_type, target_id, reason)
values (null, 'owner_assigned', 'account', 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea', 'W004 migration: founder account confirmed by the founder.');

-- ============================================================================================
-- 12. Owner functions (each checks is_owner() in the database and writes the audit trail)
-- ============================================================================================
create function public.admin_moderate(p_target_type text, p_target_id uuid, p_action text, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  new_status text := case p_action when 'hide' then 'hidden' when 'remove' then 'removed' when 'restore' then 'visible' end;
  featured boolean := case p_action when 'feature' then true when 'unfeature' then false end;
begin
  perform public.require_owner();
  if p_action not in ('hide', 'remove', 'restore', 'feature', 'unfeature') then
    raise exception 'Unknown moderation action.' using errcode = '22023';
  end if;
  if featured is not null and p_target_type = 'comment' then
    raise exception 'Comments cannot be featured.' using errcode = '22023';
  end if;
  if p_target_type = 'post' then
    if featured is null then
      update public.community_posts set status = new_status, moderation_reason = left(coalesce(p_reason, ''), 500),
        moderated_at = now(), moderated_by = (select auth.uid()), is_featured = case when new_status = 'visible' then is_featured else false end
      where id = p_target_id;
    else
      update public.community_posts set is_featured = featured where id = p_target_id and (status = 'visible' or not featured);
    end if;
  elsif p_target_type = 'comment' then
    update public.community_comments set status = new_status, moderation_reason = left(coalesce(p_reason, ''), 500),
      moderated_at = now(), moderated_by = (select auth.uid())
    where id = p_target_id;
  elsif p_target_type = 'shared_show' then
    if featured is null then
      update public.shared_shows set status = new_status, moderation_reason = left(coalesce(p_reason, ''), 500),
        moderated_at = now(), moderated_by = (select auth.uid()), is_featured = case when new_status = 'visible' then is_featured else false end
      where id = p_target_id;
    else
      update public.shared_shows set is_featured = featured where id = p_target_id and (status = 'visible' or not featured);
    end if;
  else
    raise exception 'Unknown content type.' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nothing was changed (the item does not exist, or cannot be featured while hidden).' using errcode = 'P0002'; end if;
  perform public.log_moderation(p_action, p_target_type, p_target_id::text, p_reason, '{}'::jsonb);
end;
$$;

create function public.admin_resolve_report(p_report_id uuid, p_resolution text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_owner();
  if p_resolution not in ('actioned', 'dismissed', 'open') then
    raise exception 'Resolution must be actioned, dismissed or open.' using errcode = '22023';
  end if;
  update public.content_reports
     set status = p_resolution, resolution_note = left(coalesce(p_note, ''), 1000),
         resolved_at = case when p_resolution = 'open' then null else now() end,
         resolved_by = case when p_resolution = 'open' then null else (select auth.uid()) end
   where id = p_report_id;
  if not found then raise exception 'Report not found.' using errcode = 'P0002'; end if;
  perform public.log_moderation('report_' || p_resolution, 'report', p_report_id::text, p_note, '{}'::jsonb);
end;
$$;

create function public.admin_set_member_status(p_user_id uuid, p_status text, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_owner();
  if p_status not in ('active', 'restricted', 'suspended') then
    raise exception 'Status must be active, restricted or suspended.' using errcode = '22023';
  end if;
  if exists (select 1 from public.app_owner o where o.user_id = p_user_id) then
    raise exception 'The Showduino owner account cannot be restricted or suspended.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  insert into public.member_status (user_id, status, reason, updated_at, updated_by)
  values (p_user_id, p_status, left(coalesce(p_reason, ''), 500), now(), (select auth.uid()))
  on conflict (user_id) do update set status = excluded.status, reason = excluded.reason,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform public.log_moderation('member_' || p_status, 'account', p_user_id::text, p_reason, '{}'::jsonb);
end;
$$;

create function public.admin_save_category(p_slug text, p_name text, p_description text default '', p_sort_order integer default 100, p_is_active boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_owner();
  insert into public.community_categories (slug, name, description, sort_order, is_active, updated_at)
  values (p_slug, p_name, coalesce(p_description, ''), coalesce(p_sort_order, 100), coalesce(p_is_active, true), now())
  on conflict (slug) do update set name = excluded.name, description = excluded.description,
    sort_order = excluded.sort_order, is_active = excluded.is_active, updated_at = now();
  perform public.log_moderation('category_saved', 'category', p_slug, '',
    jsonb_build_object('name', p_name, 'active', coalesce(p_is_active, true)));
end;
$$;

create function public.admin_clear_avatar(p_user_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_owner();
  update public.creator_publications set avatar_url = null, updated_at = now() where creator_id = p_user_id;
  update public.profiles set avatar_url = null where id = p_user_id;
  perform public.log_moderation('avatar_cleared', 'account', p_user_id::text, p_reason, '{}'::jsonb);
end;
$$;

create function public.admin_list_members(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (user_id uuid, display_name text, username text, published boolean, joined date,
               status text, status_reason text, is_owner boolean, posts bigint, comments bigint, shows bigint, open_reports bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.require_owner();
  return query
    select u.id, coalesce(c.display_name, p.display_name), coalesce(c.username, p.username), c.creator_id is not null,
           u.created_at::date, public.member_state(u.id), coalesce(s.reason, ''),
           exists (select 1 from public.app_owner o where o.user_id = u.id),
           (select count(*) from public.community_posts x where x.author_id = u.id),
           (select count(*) from public.community_comments x where x.author_id = u.id),
           (select count(*) from public.shared_shows x where x.author_id = u.id),
           (select count(*) from public.content_reports r where r.status = 'open' and (
              (r.target_type = 'creator' and r.target_id = u.id)
              or (r.target_type = 'post' and r.target_id in (select x.id from public.community_posts x where x.author_id = u.id))
              or (r.target_type = 'comment' and r.target_id in (select x.id from public.community_comments x where x.author_id = u.id))
              or (r.target_type = 'shared_show' and r.target_id in (select x.id from public.shared_shows x where x.author_id = u.id))))
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.creator_publications c on c.creator_id = u.id
      left join public.member_status s on s.user_id = u.id
     where coalesce(p_search, '') = ''
        or coalesce(c.display_name, p.display_name, '') ilike '%' || p_search || '%'
        or coalesce(c.username, p.username, '') ilike '%' || p_search || '%'
     order by u.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_owner();
  return jsonb_build_object(
    'members', (select count(*) from auth.users),
    'published_creators', (select count(*) from public.creator_publications),
    'restricted', (select count(*) from public.member_status where status = 'restricted'),
    'suspended', (select count(*) from public.member_status where status = 'suspended'),
    'posts', (select count(*) from public.community_posts),
    'posts_7d', (select count(*) from public.community_posts where created_at > now() - interval '7 days'),
    'posts_hidden', (select count(*) from public.community_posts where status <> 'visible'),
    'comments', (select count(*) from public.community_comments),
    'comments_7d', (select count(*) from public.community_comments where created_at > now() - interval '7 days'),
    'shared_shows', (select count(*) from public.shared_shows),
    'follows', (select count(*) from public.creator_follows),
    'open_reports', (select count(*) from public.content_reports where status = 'open'),
    'moderation_actions_30d', (select count(*) from public.moderation_log where created_at > now() - interval '30 days')
  );
end;
$$;

-- ============================================================================================
-- 13. Public helpers
-- ============================================================================================
create function public.creator_public_stats(p_creator uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.author_is_public(p_creator) then return null; end if;
  return jsonb_build_object(
    'joined', (select date_trunc('month', u.created_at)::date from auth.users u where u.id = p_creator),
    'posts', (select count(*) from public.community_posts where author_id = p_creator and status = 'visible'),
    'shows', (select count(*) from public.shared_shows where author_id = p_creator and status = 'visible' and is_listed),
    'followers', (select count(*) from public.creator_follows f where f.followee_id = p_creator and public.author_is_public(f.follower_id)),
    'following', (select count(*) from public.creator_follows f where f.follower_id = p_creator and public.author_is_public(f.followee_id)),
    'founder', exists (select 1 from public.app_owner o where o.user_id = p_creator)
  );
end;
$$;

create function public.my_community_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then jsonb_build_object('signed_in', false, 'role', 'visitor')
  else jsonb_build_object(
    'signed_in', true,
    'role', case when public.is_owner() then 'owner' else 'member' end,
    'status', public.member_state((select auth.uid())),
    'status_reason', coalesce((select s.reason from public.member_status s where s.user_id = (select auth.uid())), ''),
    'published', exists (select 1 from public.creator_publications c where c.creator_id = (select auth.uid())),
    'username', (select c.username from public.creator_publications c where c.creator_id = (select auth.uid())),
    'can_participate', public.can_participate()
  ) end;
$$;

-- Function privileges: nothing is callable unless granted here.
revoke all on function public.is_owner(), public.community_founder_id(), public.require_owner(),
  public.member_state(uuid), public.author_is_public(uuid), public.can_participate(), public.public_name(uuid),
  public.name_is_reserved(text), public.rate_limit_check(text, uuid),
  public.admin_moderate(text, uuid, text, text), public.admin_resolve_report(uuid, text, text),
  public.admin_set_member_status(uuid, text, text), public.admin_save_category(text, text, text, integer, boolean),
  public.admin_clear_avatar(uuid, text), public.admin_list_members(text, integer, integer), public.admin_stats(),
  public.creator_public_stats(uuid), public.my_community_status(),
  public.app_owner_guard(), public.member_status_protect_owner(), public.reserved_names_guard(),
  public.community_posts_before_write(), public.community_comments_before_write(), public.shared_shows_before_write(),
  public.creator_follows_before_insert(), public.content_reports_before_insert(), public.moderation_log_append_only()
  from public, anon, authenticated;
grant execute on function public.is_owner(), public.community_founder_id(), public.member_state(uuid),
  public.author_is_public(uuid), public.can_participate(), public.public_name(uuid), public.name_is_reserved(text),
  public.creator_public_stats(uuid), public.my_community_status() to anon, authenticated;
grant execute on function public.admin_moderate(text, uuid, text, text), public.admin_resolve_report(uuid, text, text),
  public.admin_set_member_status(uuid, text, text), public.admin_save_category(text, text, text, integer, boolean),
  public.admin_clear_avatar(uuid, text), public.admin_list_members(text, integer, integer), public.admin_stats()
  to authenticated;

-- ============================================================================================
-- 14. Storage: post images (public read; owner folder writes; owner can remove for moderation)
-- ============================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-images', 'community-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy community_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'community-images'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and name ~ ('^' || (select auth.uid())::text || '/post-[0-9a-f-]{36}[.](jpg|png|webp)$')
              and public.can_participate());
create policy community_images_select_own on storage.objects for select to authenticated
  using (bucket_id = 'community-images' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_owner()));
create policy community_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'community-images' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_owner()));
create policy hauntsync_avatar_owner_moderation_select on storage.objects for select to authenticated
  using (bucket_id = 'hauntsync-avatars' and public.is_owner());
create policy hauntsync_avatar_owner_moderation_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hauntsync-avatars' and public.is_owner());

commit;
