create table public.listing_threads (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id),
  borrower_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (item_id, borrower_id)
);

create index listing_threads_borrower_idx on public.listing_threads (borrower_id);

create table public.listing_messages (
  id uuid primary key,
  thread_id uuid not null references public.listing_threads(id),
  sender_id uuid not null default auth.uid() references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index listing_messages_thread_idx on public.listing_messages (thread_id, created_at desc, id);
create index listing_messages_sender_idx on public.listing_messages (sender_id);

alter table public.listing_threads enable row level security;
alter table public.listing_messages enable row level security;

revoke all on public.listing_threads, public.listing_messages from public, anon, authenticated;
grant select on public.listing_threads, public.listing_messages to authenticated;
grant insert (item_id, borrower_id) on public.listing_threads to authenticated;
grant insert (id, thread_id, body) on public.listing_messages to authenticated;

create policy listing_threads_read on public.listing_threads
  for select to authenticated using (
    (select borrowbuddy_private.is_verified_student()) and (
      borrower_id = (select auth.uid())
      or exists (select 1 from public.items where id = item_id and owner_id = (select auth.uid()))
    )
  );

create policy listing_threads_create on public.listing_threads
  for insert to authenticated with check (
    (select borrowbuddy_private.is_verified_student())
    and borrower_id = (select auth.uid())
    and exists (select 1 from public.items where id = item_id and owner_id <> (select auth.uid()))
  );

create policy listing_messages_read on public.listing_messages
  for select to authenticated using (
    exists (select 1 from public.listing_threads where id = thread_id)
  );

create policy listing_messages_send on public.listing_messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.listing_threads where id = thread_id)
  );

create function public.send_listing_message(p_item_id uuid, p_borrower_id uuid, p_message_id uuid, p_body text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  conversation_id uuid;
begin
  select id into conversation_id from public.listing_threads
    where item_id = p_item_id and borrower_id = p_borrower_id;

  if conversation_id is null then
    insert into public.listing_threads (item_id, borrower_id)
      values (p_item_id, p_borrower_id)
      on conflict (item_id, borrower_id) do nothing;

    select id into strict conversation_id from public.listing_threads
      where item_id = p_item_id and borrower_id = p_borrower_id;
  end if;

  insert into public.listing_messages (id, thread_id, body)
    values (p_message_id, conversation_id, btrim(p_body))
    on conflict (id) do nothing;
end;
$$;

revoke execute on function public.send_listing_message(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.send_listing_message(uuid, uuid, uuid, text) to authenticated;
