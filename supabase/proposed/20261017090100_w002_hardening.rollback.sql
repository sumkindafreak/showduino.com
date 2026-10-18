-- Rollback for supabase/proposed/20261017090100_w002_hardening.sql
begin;
alter table public.creator_publications drop constraint if exists creator_publications_avatar_own_storage;
alter table public.projects drop constraint if exists projects_data_size;
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Showduino Creator'))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.set_updated_at() to anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.profiles, public.projects to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.devices, public.community_posts, public.community_comments to anon, authenticated;
commit;
