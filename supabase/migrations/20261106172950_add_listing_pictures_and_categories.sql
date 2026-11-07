alter table public.items
  add column category text not null default 'Other'
    check (category in ('Electronics', 'Books & Notes', 'School Supplies', 'Tools & Equipment', 'Sports & Recreation', 'Other')),
  add column image_path text
    check (image_path is null or image_path = owner_id::text || '/' || id::text);

grant insert (id, category, image_path) on public.items to authenticated;

create index items_available_category_idx
  on public.items (category, created_at desc, id) where is_available;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-pictures', 'listing-pictures', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy listing_pictures_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'listing-pictures'
    and (select borrowbuddy_private.is_verified_student())
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or exists (select 1 from public.items where image_path = objects.name)
    )
  );

create policy listing_pictures_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-pictures'
    and (select borrowbuddy_private.is_verified_student())
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
  );

create policy listing_pictures_retry on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-pictures'
    and (select borrowbuddy_private.is_verified_student())
    and split_part(name, '/', 1) = (select auth.uid())::text
    and not exists (select 1 from public.items where image_path = objects.name)
  )
  with check (
    bucket_id = 'listing-pictures'
    and (select borrowbuddy_private.is_verified_student())
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
    and not exists (select 1 from public.items where image_path = objects.name)
  );
