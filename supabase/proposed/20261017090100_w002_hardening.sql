-- PROPOSED, NOT APPLIED. W002 database hardening for issues W-010, W-012, W-013, W-026.
-- Apply only with owner approval, after a backup, on a Supabase branch first, then
-- production. Rollback: supabase/proposed/20261017090100_w002_hardening.rollback.sql
begin;

-- W-012: remove privileges no policy needs. Row operations stay governed by RLS.
revoke truncate, references, trigger on public.profiles, public.projects, public.devices,
  public.community_posts, public.community_comments from anon, authenticated;
revoke all on public.profiles, public.projects, public.devices from anon;
revoke insert, update, delete on public.community_posts, public.community_comments from anon;
revoke execute on function public.set_updated_at() from anon, authenticated, public;

-- W-013: bound private project size (1 MB of JSON; Studio files are typically well under 100 KB).
alter table public.projects add constraint projects_data_size check (octet_length(project_data::text) <= 1048576) not valid;

-- W-010: a new account's display name never defaults to part of the email address.
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

-- W-026: published avatars must come from this project's own avatar bucket.
alter table public.creator_publications add constraint creator_publications_avatar_own_storage
  check (avatar_url is null or avatar_url like 'https://fczxcvlyydcqdhjkejmd.supabase.co/storage/v1/object/public/hauntsync-avatars/%') not valid;

commit;
