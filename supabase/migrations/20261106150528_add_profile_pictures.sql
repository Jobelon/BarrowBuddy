alter table public.profiles
  add column avatar_path text
  check (avatar_path is null or avatar_path = id::text || '/avatar');

grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-pictures', 'profile-pictures', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy profile_pictures_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (select borrowbuddy_private.is_verified_student())
  );

create policy profile_pictures_manage_own on storage.objects
  for all to authenticated
  using (
    bucket_id = 'profile-pictures'
    and name = (select auth.uid())::text || '/avatar'
    and (select borrowbuddy_private.is_verified_student())
  )
  with check (
    bucket_id = 'profile-pictures'
    and name = (select auth.uid())::text || '/avatar'
    and (select borrowbuddy_private.is_verified_student())
  );
