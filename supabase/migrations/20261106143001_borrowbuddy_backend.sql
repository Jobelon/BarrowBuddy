create schema borrowbuddy_private;
revoke all on schema borrowbuddy_private from public, anon, authenticated;
grant usage on schema borrowbuddy_private to authenticated;

create function borrowbuddy_private.is_cit_email(email text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(email ~* '^[^@[:space:]]+@cit[.]edu$', false);
$$;

create function borrowbuddy_private.enforce_cit_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not borrowbuddy_private.is_cit_email(new.email) then
    raise exception 'Use your CIT institutional email (@cit.edu).' using errcode = '23514';
  end if;
  return new;
end;
$$;

grant usage on schema borrowbuddy_private to supabase_auth_admin;
grant execute on function borrowbuddy_private.is_cit_email(text) to supabase_auth_admin;
grant execute on function borrowbuddy_private.enforce_cit_email() to supabase_auth_admin;

create trigger borrowbuddy_cit_signup
before insert on auth.users
for each row execute function borrowbuddy_private.enforce_cit_email();

create trigger borrowbuddy_cit_email_change
before update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function borrowbuddy_private.enforce_cit_email();

create function borrowbuddy_private.is_verified_student()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = (select auth.uid())
      and email_confirmed_at is not null
      and borrowbuddy_private.is_cit_email(email)
      and not is_anonymous
  );
$$;

create table public.profiles (
  id uuid primary key default auth.uid() references auth.users(id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.borrow_requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id),
  borrower_id uuid not null references public.profiles(id),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'returned')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  returned_at timestamptz
);

create index items_owner_idx on public.items (owner_id);
create index items_available_idx on public.items (created_at desc) where is_available;
create index borrow_requests_item_idx on public.borrow_requests (item_id);
create index borrow_requests_borrower_idx on public.borrow_requests (borrower_id);
create unique index borrow_requests_one_pending_idx
  on public.borrow_requests (item_id, borrower_id) where status = 'pending';
create unique index borrow_requests_one_active_idx
  on public.borrow_requests (item_id) where status = 'accepted';

alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.borrow_requests enable row level security;

revoke all on public.profiles, public.items, public.borrow_requests from public, anon, authenticated;
grant select on public.profiles, public.items, public.borrow_requests to authenticated;
grant insert (display_name), update (display_name) on public.profiles to authenticated;
grant insert (name, description), update (name, description) on public.items to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using ((select borrowbuddy_private.is_verified_student()));
create policy profiles_create on public.profiles for insert to authenticated
  with check ((select borrowbuddy_private.is_verified_student()) and id = (select auth.uid()));
create policy profiles_edit on public.profiles for update to authenticated
  using ((select borrowbuddy_private.is_verified_student()) and id = (select auth.uid()))
  with check ((select borrowbuddy_private.is_verified_student()) and id = (select auth.uid()));

create policy items_read on public.items for select to authenticated
  using ((select borrowbuddy_private.is_verified_student()));
create policy items_create on public.items for insert to authenticated
  with check ((select borrowbuddy_private.is_verified_student()) and owner_id = (select auth.uid()));
create policy items_edit on public.items for update to authenticated
  using ((select borrowbuddy_private.is_verified_student()) and owner_id = (select auth.uid()))
  with check ((select borrowbuddy_private.is_verified_student()) and owner_id = (select auth.uid()));

create policy borrow_requests_read on public.borrow_requests for select to authenticated
  using (
    (select borrowbuddy_private.is_verified_student())
    and (
      borrower_id = (select auth.uid())
      or exists (
        select 1 from public.items
        where id = borrow_requests.item_id and owner_id = (select auth.uid())
      )
    )
  );

-- Serialize all request operations for an item using the item's row lock.
create function borrowbuddy_private.request_item(p_item_id uuid)
returns public.borrow_requests
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.items;
  request public.borrow_requests;
begin
  if not borrowbuddy_private.is_verified_student() then
    raise exception 'A verified CIT email is required.' using errcode = '42501';
  end if;

  select * into item from public.items where id = p_item_id for update;
  if not found or not item.is_available then
    raise exception 'This item is unavailable.';
  end if;
  if item.owner_id = (select auth.uid()) then
    raise exception 'You cannot borrow your own item.';
  end if;
  if not exists (select 1 from public.profiles where id = (select auth.uid())) then
    raise exception 'Create your profile before requesting an item.';
  end if;

  insert into public.borrow_requests (item_id, borrower_id)
  values (p_item_id, (select auth.uid()))
  on conflict (item_id, borrower_id) where status = 'pending' do nothing
  returning * into request;

  if not found then
    select * into request from public.borrow_requests
    where item_id = p_item_id and borrower_id = (select auth.uid()) and status = 'pending';
  end if;
  return request;
end;
$$;

create function borrowbuddy_private.update_borrow_request(p_request_id uuid, p_action text)
returns public.borrow_requests
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.items;
  request public.borrow_requests;
  actor uuid := auth.uid();
begin
  if not borrowbuddy_private.is_verified_student() then
    raise exception 'A verified CIT email is required.' using errcode = '42501';
  end if;

  select items.* into item from public.items
  join public.borrow_requests on borrow_requests.item_id = items.id
  where borrow_requests.id = p_request_id
    and (items.owner_id = actor or borrow_requests.borrower_id = actor)
  for update of items;
  if not found then
    raise exception 'Borrow request not found.';
  end if;

  select * into strict request from public.borrow_requests where id = p_request_id;
  if p_action = 'cancel' then
    if request.borrower_id <> actor or request.status <> 'pending' then
      raise exception 'Only the borrower can cancel a pending request.';
    end if;
    update public.borrow_requests set status = 'cancelled' where id = p_request_id;
  else
    if item.owner_id <> actor then
      raise exception 'Only the item owner can take this action.' using errcode = '42501';
    end if;

    case p_action
      when 'accept' then
        if request.status <> 'pending' or not item.is_available then
          raise exception 'Only a pending request for an available item can be accepted.';
        end if;
        update public.borrow_requests set status = 'accepted', accepted_at = now()
          where id = p_request_id;
        update public.borrow_requests set status = 'declined'
          where item_id = item.id and status = 'pending';
        update public.items set is_available = false where id = item.id;
      when 'decline' then
        if request.status <> 'pending' then
          raise exception 'Only a pending request can be declined.';
        end if;
        update public.borrow_requests set status = 'declined' where id = p_request_id;
      when 'return' then
        if request.status <> 'accepted' then
          raise exception 'Only an accepted request can be returned.';
        end if;
        update public.borrow_requests set status = 'returned', returned_at = now()
          where id = p_request_id;
        update public.items set is_available = true where id = item.id;
      else
        raise exception 'Unknown borrow request action.';
    end case;
  end if;

  select * into strict request from public.borrow_requests where id = p_request_id;
  return request;
end;
$$;

create function public.request_item(p_item_id uuid)
returns public.borrow_requests
language sql
set search_path = ''
as $$
  select borrowbuddy_private.request_item(p_item_id);
$$;

create function public.update_borrow_request(p_request_id uuid, p_action text)
returns public.borrow_requests
language sql
set search_path = ''
as $$
  select borrowbuddy_private.update_borrow_request(p_request_id, p_action);
$$;

revoke execute on all functions in schema borrowbuddy_private from public, anon, authenticated;
revoke execute on function public.request_item(uuid), public.update_borrow_request(uuid, text)
  from public, anon, authenticated;
grant execute on function borrowbuddy_private.is_verified_student(),
  borrowbuddy_private.request_item(uuid), borrowbuddy_private.update_borrow_request(uuid, text),
  public.request_item(uuid), public.update_borrow_request(uuid, text)
  to authenticated;
