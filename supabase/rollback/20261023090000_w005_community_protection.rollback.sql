-- Rollback for 20261023090000_w005_community_protection.sql: restores the W004 definitions.
-- moderation_log is append-only, so its 'migration_applied' entry stays; a rollback entry is added.
begin;

drop trigger if exists projects_account_limit on public.projects;
drop trigger if exists devices_account_limit on public.devices;
drop function if exists public.enforce_account_limit();

drop policy if exists hauntsync_avatar_insert_own on storage.objects;
create policy hauntsync_avatar_insert_own on storage.objects for insert to authenticated with check (
  bucket_id = 'hauntsync-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar-[a-f0-9-]+[.](jpg|png|webp)$'));
drop policy if exists community_images_insert_own on storage.objects;
create policy community_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'community-images'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and name ~ ('^' || (select auth.uid())::text || '/post-[0-9a-f-]{36}[.](jpg|png|webp)$')
              and public.can_participate());

drop function if exists public.my_usage();
drop function if exists public.within_limit(text);
drop function if exists public.usage_count(text, uuid, timestamptz);
drop table if exists public.account_limits;

drop policy if exists community_posts_delete_own on public.community_posts;
create policy community_posts_delete_own on public.community_posts for delete to authenticated
  using (author_id = (select auth.uid()));
drop policy if exists community_comments_delete_own on public.community_comments;
create policy community_comments_delete_own on public.community_comments for delete to authenticated
  using (author_id = (select auth.uid()));
drop policy if exists shared_shows_remove_own on public.shared_shows;
create policy shared_shows_remove_own on public.shared_shows for delete to authenticated
  using ((select auth.uid()) = author_id);

drop function if exists public.admin_record_file_removal(text, text, text);

create or replace function public.member_state(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.status from public.member_status s where s.user_id = p_user), 'active');
$$;
create or replace function public.public_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.display_name from public.creator_publications c where c.creator_id = p_user),
    (select p.display_name from public.profiles p where p.id = p_user),
    'Showduino Creator');
$$;
create or replace function public.name_is_reserved(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  select p_name is not null and (
    regexp_replace(lower(p_name), '[^a-z0-9]', '', 'g') ~ '(admin|founder|moderator|official|showduino|hauntsync|staff)'
    or regexp_replace(lower(p_name), '[^a-z0-9]', '', 'g') in ('mod', 'mods', 'root', 'system', 'owner', 'support', 'help', 'security')
  );
$$;
drop function if exists public.name_fold(text, text);

insert into public.moderation_log (actor_id, action, target_type, target_id, reason)
values (null, 'migration_rolled_back', 'database', 'w005_community_protection', 'W005 community protection rolled back.');

commit;
