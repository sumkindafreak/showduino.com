-- HauntSync creator avatar storage. No existing profiles or show records changed.
-- Public avatar files: anyone with the image URL can view it; profiles remain private in v1.
-- Store photos only: JPG, PNG or WebP, maximum 2 MB per object.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hauntsync-avatars', 'hauntsync-avatars', true, 2097152, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do nothing;

-- File names follow <signed-in-user-uuid>/avatar-<random-uuid>.<jpg|png|webp>.
-- No anonymous write/delete access, and no cross-account uploads or removals.
create policy "hauntsync_avatar_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'hauntsync-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar-[a-f0-9-]+[.](jpg|png|webp)$')
);

create policy "hauntsync_avatar_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'hauntsync-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "hauntsync_avatar_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'hauntsync-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- The public bucket's download endpoint serves images to people who know
-- the URL; storage.objects stays restricted for direct Storage API listings.
