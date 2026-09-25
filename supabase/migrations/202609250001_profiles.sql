begin;
create schema if not exists private;
create function private.valid_time_zone(value text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = value)
$$;
revoke all on function private.valid_time_zone(text) from public;
grant usage on schema private to authenticated;
grant execute on function private.valid_time_zone(text) to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default 'Mon profil' check (length(first_name) between 1 and 60 and first_name = btrim(first_name) and first_name !~ '[[:cntrl:]]'),
  avatar text not null default 'profile' check (avatar in ('profile', 'sun', 'leaf', 'home')),
  time_zone text not null default 'UTC' check (length(time_zone) <= 100 and private.valid_time_zone(time_zone)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, avatar, time_zone) on public.profiles to authenticated;
create policy read_own_profile on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy update_own_profile on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare candidate text := btrim(new.raw_user_meta_data ->> 'first_name');
begin
  if candidate is null or length(candidate) not between 1 and 60 or candidate ~ '[[:cntrl:]]' then candidate := 'Mon profil'; end if;
  insert into public.profiles (id, first_name, time_zone) values (new.id, candidate, case when private.valid_time_zone(new.raw_user_meta_data->>'time_zone') and length(new.raw_user_meta_data->>'time_zone')<=100 then new.raw_user_meta_data->>'time_zone' else 'UTC' end);
  return new;
end $$;
revoke all on function private.create_profile() from public;
create trigger create_user_profile after insert on auth.users for each row execute function private.create_profile();

create function private.touch_profile() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function private.touch_profile() from public;
create trigger touch_profile before update on public.profiles for each row execute function private.touch_profile();

-- Raccordement possible à un projet possédant déjà des comptes.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
commit;
