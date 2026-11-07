alter table public.items add column archived_at timestamptz;
alter table public.items add constraint items_archived_unavailable
  check (archived_at is null or not is_available);
grant update (category) on public.items to authenticated;

create function borrowbuddy_private.archive_listing(p_item_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  listing public.items;
begin
  if not borrowbuddy_private.is_verified_student() then
    raise exception 'A verified CIT email is required.' using errcode = '42501';
  end if;

  select * into listing from public.items where id = p_item_id for update;
  if not found or listing.owner_id <> (select auth.uid()) then
    raise exception 'Only the listing owner can remove this item.' using errcode = '42501';
  end if;
  if listing.archived_at is not null then
    return;
  end if;
  if exists (select 1 from public.borrow_requests where item_id = p_item_id and status = 'accepted') then
    raise exception 'Mark the item returned before removing the listing.';
  end if;

  update public.borrow_requests set status = 'declined'
    where item_id = p_item_id and status = 'pending';
  update public.items set archived_at = now(), is_available = false where id = p_item_id;
end;
$$;

create function public.archive_listing(p_item_id uuid)
returns void
language sql
set search_path = ''
as $$
  select borrowbuddy_private.archive_listing(p_item_id);
$$;

revoke execute on function borrowbuddy_private.archive_listing(uuid), public.archive_listing(uuid)
  from public, anon, authenticated;
grant execute on function borrowbuddy_private.archive_listing(uuid), public.archive_listing(uuid)
  to authenticated;
