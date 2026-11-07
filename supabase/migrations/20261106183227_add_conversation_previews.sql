create function public.list_listing_conversations(p_offset integer default 0, p_limit integer default 20)
returns table (
  id uuid, item_id uuid, borrower_id uuid, item jsonb, other_name text,
  last_message text, activity_at timestamptz, total_count bigint
)
language sql stable
set search_path = ''
as $$
  select page.id, page.item_id, page.borrower_id,
    jsonb_build_object('name', page.item_name, 'owner_id', page.owner_id,
      'category', page.category, 'description', page.description, 'is_available', page.is_available),
    public.get_profile_name(case when page.borrower_id = (select auth.uid())
      then page.owner_id else page.borrower_id end),
    page.last_message, page.activity_at, page.total_count
  from (
    select t.id, t.item_id, t.borrower_id, i.name as item_name, i.owner_id, i.category, i.description,
      i.is_available, latest.body as last_message, coalesce(latest.created_at, t.created_at) as activity_at,
      count(*) over () as total_count
    from public.listing_threads t
    join public.items i on i.id = t.item_id
    left join lateral (
      select m.body, m.created_at from public.listing_messages m
      where m.thread_id = t.id
      order by m.created_at desc, m.id
      limit 1
    ) latest on true
    order by activity_at desc, t.id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) page
  order by page.activity_at desc, page.id;
$$;

revoke execute on function public.list_listing_conversations(integer, integer) from public, anon, authenticated;
grant execute on function public.list_listing_conversations(integer, integer) to authenticated;
