-- W005: community protection (W5-07, W5-08, W5-11, W5-14).
--
-- * Impersonation: reserved-name check now folds Unicode look-alikes, accents, full-width
--   letters, zero-width characters and digit substitutions before matching.
-- * Quotas: per-account limits on cloud projects, devices, avatars and post images, all
--   enforced in the database. Suspended members cannot upload avatars.
-- * Moderation: members cannot delete their own posts, comments or shared shows once the
--   owner has hidden or removed them; image file removals by the owner are written to
--   moderation_log through admin_record_file_removal().
-- * Less public information: public_name() no longer returns a private profile name for
--   other people, and member_state() shows other people's 'restricted' state as 'active'.
--
-- Founder ownership (app_owner, is_owner) is unchanged. Every limit exempts the owner.
-- Rollback: supabase/rollback/20261023090000_w005_community_protection.rollback.sql
-- Tests: supabase/tests/w005_community_protection.sql (tools/db-test-local.sh).
begin;

-- ============================================================================================
-- 1. Impersonation (W5-07)
-- ============================================================================================
-- Folds a name to plain a-z: NFKD splits accents from letters (and maps full-width forms),
-- common Cyrillic and Greek look-alikes become their Latin twins, digits and symbols used
-- as letters are mapped, and everything else (spaces, punctuation, zero-width) is dropped.
-- p_one_as is the letter '1' and '|' stand for: 'i' or 'l'.
create or replace function public.name_fold(p_name text, p_one_as text default 'i') returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
    translate(
      lower(translate(normalize(coalesce(p_name, ''), NFKD),
        -- capitals first: Greek capital Eta looks like H, but lower-case eta looks like n
        'АВЕКМНОРСТУХІЈЅΑΒΕΗΙΚΜΝΟΡΤΥΧΖ',
        'ABEKMHOPCTYXIJSABEHIKMNOPTYXZ')),
      'аеорсухкмнвтіјѕԁһӏѵԛԝοαρτυνικμεηχβ0345789@$!|1',
      'aeopcyxkmhbtijsdhlvqwoaptuvikmenxboeastbgasi' ||
        case when p_one_as = 'l' then 'il' else 'li' end),
    '[^a-z]', '', 'g');
$$;

create or replace function public.name_is_reserved(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  select p_name is not null and exists (
    select 1 from (values (public.name_fold(p_name, 'i')), (public.name_fold(p_name, 'l'))) f(s)
    where f.s ~ '(admin|founder|moderator|official|showduino|hauntsync|staff)'
       or f.s in ('mod', 'mods', 'root', 'system', 'owner', 'support', 'help', 'security'));
$$;
revoke all on function public.name_fold(text, text) from public, anon, authenticated;
grant execute on function public.name_fold(text, text), public.name_is_reserved(text) to anon, authenticated;

-- ============================================================================================
-- 2. Smaller public surface (W5-14)
-- ============================================================================================
-- Other people's 'restricted' state is private; 'suspended' stays visible because a
-- suspended creator's public content already disappears. Policies only test <> 'suspended'
-- for other people, and the owner and the member themselves still see the real state.
create or replace function public.member_state(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_user = (select auth.uid()) or public.is_owner() then s.status
    when s.status = 'suspended' then 'suspended'
    else 'active' end
  from (select coalesce((select m.status from public.member_status m where m.user_id = p_user), 'active') as status) s;
$$;

-- A private profile name is shown only to its owner (and the site owner). Everyone else
-- sees the published creator name or the generic label.
create or replace function public.public_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.display_name from public.creator_publications c where c.creator_id = p_user),
    (select p.display_name from public.profiles p
      where p.id = p_user and (p_user = (select auth.uid()) or public.is_owner())),
    'Showduino Creator');
$$;

-- ============================================================================================
-- 3. Quotas (W5-08)
-- ============================================================================================
create table public.account_limits (
  kind text primary key,
  max_total integer not null check (max_total > 0),
  max_per_day integer check (max_per_day is null or max_per_day > 0),
  note text not null default ''
);
alter table public.account_limits enable row level security;
revoke all on public.account_limits from public, anon, authenticated;
grant select on public.account_limits to anon, authenticated;
create policy account_limits_read on public.account_limits for select to anon, authenticated using (true);
insert into public.account_limits (kind, max_total, max_per_day, note) values
  ('project', 100, 50, 'Private cloud shows (each up to 1 MB)'),
  ('device', 200, 100, 'Private hardware inventory rows'),
  ('avatar', 5, 10, 'Profile photos kept in storage (2 MB each)'),
  ('post_image', 200, 20, 'Community post images (3 MB each)');

-- Counts the caller's own rows or stored files. SECURITY DEFINER so it can see storage
-- rows that RLS would hide; it only ever counts, for the account given.
create or replace function public.usage_count(p_kind text, p_user uuid, p_since timestamptz default null)
returns bigint language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'project' then (select count(*) from public.projects x where x.user_id = p_user and (p_since is null or x.created_at > p_since))
    when 'device' then (select count(*) from public.devices x where x.user_id = p_user and (p_since is null or x.created_at > p_since))
    when 'avatar' then (select count(*) from storage.objects o where o.bucket_id = 'hauntsync-avatars'
                          and (storage.foldername(o.name))[1] = p_user::text and (p_since is null or o.created_at > p_since))
    when 'post_image' then (select count(*) from storage.objects o where o.bucket_id = 'community-images'
                          and (storage.foldername(o.name))[1] = p_user::text and (p_since is null or o.created_at > p_since))
  end;
$$;

-- True while the caller may add one more item of this kind. The owner is never limited.
create or replace function public.within_limit(p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    public.is_owner() or exists (
      select 1 from public.account_limits l
      where l.kind = p_kind
        and public.usage_count(p_kind, (select auth.uid())) < l.max_total
        and (l.max_per_day is null or public.usage_count(p_kind, (select auth.uid()), now() - interval '1 day') < l.max_per_day)));
$$;

-- What the account page can show: used and allowed, for the caller only.
create or replace function public.my_usage() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then null else (
    select jsonb_object_agg(l.kind, jsonb_build_object(
      'used', public.usage_count(l.kind, (select auth.uid())), 'max', l.max_total, 'per_day', l.max_per_day))
    from public.account_limits l) end;
$$;

revoke all on function public.usage_count(text, uuid, timestamptz), public.within_limit(text), public.my_usage()
  from public, anon, authenticated;
grant execute on function public.within_limit(text), public.my_usage() to authenticated;

-- Table rows: a trigger, so the limit holds for every insert path.
create or replace function public.enforce_account_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if; -- migrations and service tasks
  if not public.within_limit(tg_argv[0]) then
    raise exception 'You have reached the limit for %. Delete some first, or contact Showduino support.',
      case tg_argv[0] when 'project' then 'cloud shows' when 'device' then 'registered devices' else tg_argv[0] end
      using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_account_limit() from public, anon, authenticated;
create trigger projects_account_limit before insert on public.projects
  for each row execute function public.enforce_account_limit('project');
create trigger devices_account_limit before insert on public.devices
  for each row execute function public.enforce_account_limit('device');

-- Storage: the insert policies gain the limit; avatars also refuse suspended members.
drop policy if exists hauntsync_avatar_insert_own on storage.objects;
create policy hauntsync_avatar_insert_own on storage.objects for insert to authenticated with check (
  bucket_id = 'hauntsync-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar-[a-f0-9-]+[.](jpg|png|webp)$')
  and public.member_state((select auth.uid())) <> 'suspended'
  and public.within_limit('avatar'));
drop policy if exists community_images_insert_own on storage.objects;
create policy community_images_insert_own on storage.objects for insert to authenticated with check (
  bucket_id = 'community-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/post-[0-9a-f-]{36}[.](jpg|png|webp)$')
  and public.can_participate()
  and public.within_limit('post_image'));

-- ============================================================================================
-- 4. Moderation evidence and file removal (W5-11)
-- ============================================================================================
-- Members may delete their own content only while it is visible; once the owner has hidden
-- or removed it, it stays for the record. The owner acts only through the logged
-- admin_moderate() function (restore, hide, remove), never by deleting rows.
drop policy if exists community_posts_delete_own on public.community_posts;
create policy community_posts_delete_own on public.community_posts for delete to authenticated
  using (author_id = (select auth.uid()) and status = 'visible');
drop policy if exists community_comments_delete_own on public.community_comments;
create policy community_comments_delete_own on public.community_comments for delete to authenticated
  using (author_id = (select auth.uid()) and status = 'visible');
drop policy if exists shared_shows_remove_own on public.shared_shows;
create policy shared_shows_remove_own on public.shared_shows for delete to authenticated
  using ((select auth.uid()) = author_id and status = 'visible');

-- Storage files can only be deleted through the Storage API (Supabase blocks SQL deletes),
-- so the owner's dashboard deletes the file there and then records it here.
create or replace function public.admin_record_file_removal(p_bucket text, p_path text, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_owner();
  if p_bucket not in ('community-images', 'hauntsync-avatars') then
    raise exception 'Unknown storage bucket.' using errcode = '22023';
  end if;
  if p_path is null or p_path !~ '^[0-9a-f-]{36}/(post|avatar)-[0-9a-f-]+[.](jpg|png|webp)$' then
    raise exception 'That is not a Showduino community file path.' using errcode = '22023';
  end if;
  perform public.log_moderation('file_removed', 'file', p_bucket || '/' || p_path, p_reason,
    jsonb_build_object('still_stored', exists (select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_path)));
end;
$$;
revoke all on function public.admin_record_file_removal(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_record_file_removal(text, text, text) to authenticated;

insert into public.moderation_log (actor_id, action, target_type, target_id, reason)
values (null, 'migration_applied', 'database', 'w005_community_protection',
        'W005: look-alike name folding, account limits, moderation evidence, smaller public surface.');

commit;
