alter table public.profiles rename column display_name to full_name;

alter table public.profiles
  add column student_id_number text unique
    check (student_id_number = btrim(student_id_number)
      and char_length(student_id_number) between 1 and 64),
  add column role text not null default 'student' check (role = 'student'),
  add column program text check (char_length(btrim(program)) between 1 and 120),
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

alter policy profiles_read on public.profiles
  using ((select borrowbuddy_private.is_verified_student()) and id = (select auth.uid()));

alter policy profiles_create on public.profiles
  with check (
    (select borrowbuddy_private.is_verified_student())
    and id = (select auth.uid())
    and student_id_number is not null
    and program is not null
  );

alter policy profiles_edit on public.profiles
  with check (
    (select borrowbuddy_private.is_verified_student())
    and id = (select auth.uid())
    and student_id_number is not null
    and program is not null
  );

grant insert (student_id_number, program), update (student_id_number, program)
  on public.profiles to authenticated;

create function borrowbuddy_private.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function borrowbuddy_private.set_profile_updated_at()
  from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function borrowbuddy_private.set_profile_updated_at();

-- Expose the name used on listings without exposing the rest of the profile.
create function borrowbuddy_private.get_profile_name(p_profile_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select full_name
  from public.profiles
  where id = p_profile_id and (select borrowbuddy_private.is_verified_student());
$$;

create function public.get_profile_name(p_profile_id uuid)
returns text
language sql stable
set search_path = ''
as $$
  select borrowbuddy_private.get_profile_name(p_profile_id);
$$;

revoke execute on function borrowbuddy_private.get_profile_name(uuid),
  public.get_profile_name(uuid) from public, anon, authenticated;
grant execute on function borrowbuddy_private.get_profile_name(uuid),
  public.get_profile_name(uuid) to authenticated;
