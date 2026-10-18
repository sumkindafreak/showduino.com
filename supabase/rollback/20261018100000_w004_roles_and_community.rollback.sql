-- Rollback for supabase/migrations/20261018100000_w004_roles_and_community.sql
--
-- Restores the schema, policies and grants that production had before W004 (as recorded in
-- 20261017090000_w002_baseline_live_schema.sql), including undoing the folded-in W002 hardening.
--
-- DATA WARNING: this drops the community tables W004 added (follows, reports, the moderation
-- log, categories, member status, owner) and the new post/comment/show columns. Export them
-- first (Supabase dashboard -> Table editor -> export CSV, or `supabase db dump --data-only`).
-- Empty the community-images bucket before running it (storage cannot drop a bucket with files).
begin;

-- storage
drop policy if exists community_images_insert_own on storage.objects;
drop policy if exists community_images_select_own on storage.objects;
drop policy if exists community_images_delete_own on storage.objects;
drop policy if exists hauntsync_avatar_owner_moderation_select on storage.objects;
drop policy if exists hauntsync_avatar_owner_moderation_delete on storage.objects;
delete from storage.buckets where id = 'community-images';

-- policies replaced or added by W004
drop policy if exists community_posts_read on public.community_posts;
drop policy if exists community_posts_insert_own on public.community_posts;
drop policy if exists community_posts_update_own on public.community_posts;
drop policy if exists community_posts_delete_own on public.community_posts;
drop policy if exists community_comments_read on public.community_comments;
drop policy if exists community_comments_insert_own on public.community_comments;
drop policy if exists community_comments_update_own on public.community_comments;
drop policy if exists community_comments_delete_own on public.community_comments;
drop policy if exists shared_shows_read_public on public.shared_shows;
drop policy if exists shared_shows_publish_own on public.shared_shows;
drop policy if exists creator_publications_read_public on public.creator_publications;
drop policy if exists creator_publications_insert_own on public.creator_publications;
drop policy if exists creator_publications_update_own on public.creator_publications;

-- triggers
drop trigger if exists community_posts_before_write on public.community_posts;
drop trigger if exists community_comments_before_write on public.community_comments;
drop trigger if exists shared_shows_before_write on public.shared_shows;
drop trigger if exists profiles_reserved_names on public.profiles;
drop trigger if exists creator_publications_reserved_names on public.creator_publications;

-- posts: back to the original category list
alter table public.community_posts drop constraint if exists community_posts_category_fkey;
update public.community_posts set category = case category
  when 'lighting' then 'lighting-audio' when 'audio' then 'lighting-audio'
  when 'effects' then 'props-fx' when 'animatronics' then 'props-fx' when '3d-printing' then 'props-fx'
  when 'show-control' then 'code-control' when 'electronics' then 'code-control'
  else 'general' end
  where category not in ('general','build-log','show-design','code-control','props-fx','lighting-audio','help-wanted','showcase');
alter table public.community_posts add constraint community_posts_category_check
  check (category in ('general','build-log','show-design','code-control','props-fx','lighting-audio','help-wanted','showcase'));
drop index if exists public.community_posts_visible_recent_idx;
drop index if exists public.community_posts_featured_idx;
alter table public.community_posts
  drop column if exists kind, drop column if exists image_path, drop column if exists shared_show_id,
  drop column if exists status, drop column if exists is_featured, drop column if exists moderation_reason,
  drop column if exists moderated_at, drop column if exists moderated_by, drop column if exists edited_at;
alter table public.community_comments
  drop column if exists parent_id, drop column if exists status, drop column if exists moderation_reason,
  drop column if exists moderated_at, drop column if exists moderated_by, drop column if exists edited_at;
alter table public.shared_shows
  drop column if exists status, drop column if exists is_featured, drop column if exists moderation_reason,
  drop column if exists moderated_at, drop column if exists moderated_by;

-- tables added by W004
drop table if exists public.moderation_log;
drop table if exists public.content_reports;
drop table if exists public.creator_follows;
drop table if exists public.community_categories;
drop table if exists public.member_status;
drop table if exists public.app_owner;

-- functions added by W004
drop function if exists public.admin_moderate(text, uuid, text, text);
drop function if exists public.admin_resolve_report(uuid, text, text);
drop function if exists public.admin_set_member_status(uuid, text, text);
drop function if exists public.admin_save_category(text, text, text, integer, boolean);
drop function if exists public.admin_clear_avatar(uuid, text);
drop function if exists public.admin_list_members(text, integer, integer);
drop function if exists public.admin_stats();
drop function if exists public.creator_public_stats(uuid);
drop function if exists public.my_community_status();
drop function if exists public.log_moderation(text, text, text, text, jsonb);
drop function if exists public.moderation_log_append_only();
drop function if exists public.content_reports_before_insert();
drop function if exists public.creator_follows_before_insert();
drop function if exists public.shared_shows_before_write();
drop function if exists public.community_comments_before_write();
drop function if exists public.community_posts_before_write();
drop function if exists public.rate_limit_check(text, uuid);
drop function if exists public.reserved_names_guard();
drop function if exists public.name_is_reserved(text);
drop function if exists public.public_name(uuid);
drop function if exists public.can_participate();
drop function if exists public.author_is_public(uuid);
drop function if exists public.member_state(uuid);
drop function if exists public.member_status_protect_owner();
drop function if exists public.require_owner();
drop function if exists public.community_founder_id();
drop function if exists public.is_owner();
drop function if exists public.app_owner_guard();

-- original policies (as observed in production before W004)
create policy community_posts_public_read on public.community_posts for select to anon, authenticated using (true);
create policy community_posts_insert_own on public.community_posts for insert to authenticated with check ((select auth.uid()) = author_id);
create policy community_posts_update_own on public.community_posts for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy community_posts_delete_own on public.community_posts for delete to authenticated using ((select auth.uid()) = author_id);
create policy community_comments_public_read on public.community_comments for select to anon, authenticated using (true);
create policy community_comments_insert_own on public.community_comments for insert to authenticated with check ((select auth.uid()) = author_id);
create policy community_comments_update_own on public.community_comments for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy community_comments_delete_own on public.community_comments for delete to authenticated using ((select auth.uid()) = author_id);
create policy shared_shows_read_public on public.shared_shows for select to anon, authenticated using (is_listed = true);
create policy shared_shows_publish_own on public.shared_shows for insert to authenticated with check (((select auth.uid()) = author_id) and (is_listed = true));
create policy creator_publications_read_public on public.creator_publications for select to anon, authenticated using (true);
create policy creator_publications_insert_own on public.creator_publications for insert to authenticated with check ((select auth.uid()) = creator_id);
create policy creator_publications_update_own on public.creator_publications for update to authenticated using ((select auth.uid()) = creator_id) with check ((select auth.uid()) = creator_id);

-- W002 hardening folded into W004
alter table public.creator_publications drop constraint if exists creator_publications_avatar_own_storage;
alter table public.projects drop constraint if exists projects_data_size;
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
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.set_updated_at() to public, anon, authenticated, service_role;   -- as on live

-- grants exactly as observed in production before W004
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

commit;
