begin;
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.memberships (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check(role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key(household_id,user_id)
);
create unique index one_owner on public.memberships(household_id) where role='owner';
create index memberships_user on public.memberships(user_id);
create table private.invitations (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households on delete cascade,
  token_hash text not null unique, email text, role text not null check(role in ('admin','member')),
  created_by uuid references auth.users on delete set null, created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days', used_at timestamptz
);
create function private.household_role(h uuid) returns text language sql stable security definer set search_path='' as $$
  select role from public.memberships where household_id=h and user_id=(select auth.uid())
$$;
revoke all on function private.household_role(uuid) from public;
grant execute on function private.household_role(uuid) to authenticated;
alter table public.households enable row level security;
alter table public.memberships enable row level security;
create policy household_read on public.households for select to authenticated using(private.household_role(id) is not null);
create policy members_read on public.memberships for select to authenticated using(private.household_role(household_id) is not null);
revoke all on public.households, public.memberships from public,anon,authenticated;
grant select on public.households, public.memberships to authenticated;

create function public.create_household(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.memberships where user_id=auth.uid())>=20 then raise exception 'LIMIT'; end if;
  insert into public.households(name) values(btrim(p_name)) returning id into h;
  insert into public.memberships values(h,auth.uid(),'owner',now());
  return h;
end $$;
create function public.create_invitation(p_household uuid,p_email text default null,p_role text default 'member') returns text language plpgsql security definer set search_path='' as $$
declare token text; caller text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household::text,0));
  caller:=private.household_role(p_household);
  if caller is null or caller not in ('owner','admin') or p_role not in ('member','admin') or (p_role='admin' and caller<>'owner') then raise exception 'FORBIDDEN'; end if;
  if p_email is not null and (length(p_email)>254 or p_email !~ '^[^ @]+@[^ @]+\.[^ @]+$') then raise exception 'INVALID_EMAIL'; end if;
  if (select count(*) from private.invitations where household_id=p_household and created_at>now()-interval '1 day')>=50 then raise exception 'LIMIT'; end if;
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into private.invitations(household_id,token_hash,email,role,created_by) values(p_household,encode(sha256(convert_to(token,'UTF8')),'hex'),lower(nullif(btrim(p_email),'')),p_role,auth.uid());
  return token;
end $$;
create function public.accept_invitation(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare inv private.invitations; address text;
begin
  if auth.uid() is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INVITATION'; end if;
  select * into inv from private.invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then raise exception 'INVALID_INVITATION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(inv.household_id::text,0));
  select * into inv from private.invitations where id=inv.id for update;
  if inv.used_at is not null or inv.expires_at<=now() or not exists(select 1 from public.memberships where household_id=inv.household_id and user_id=inv.created_by and role in ('owner','admin')) then raise exception 'INVALID_INVITATION'; end if;
  select lower(email) into address from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if address is null or (inv.email is not null and inv.email<>address) then raise exception 'INVALID_INVITATION'; end if;
  if (select count(*) from public.memberships where household_id=inv.household_id)>=50 then raise exception 'LIMIT'; end if;
  insert into public.memberships(household_id,user_id,role) values(inv.household_id,auth.uid(),inv.role) on conflict do nothing;
  update private.invitations set used_at=now() where id=inv.id;
  return inv.household_id;
end $$;
create function public.manage_member(p_household uuid,p_user uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare caller text; target text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household::text,0));
  caller:=private.household_role(p_household);
  select role into target from public.memberships where household_id=p_household and user_id=p_user;
  if caller is null or target is null then raise exception 'FORBIDDEN'; end if;
  if p_action='leave' and p_user=auth.uid() and target<>'owner' then
    delete from public.memberships where household_id=p_household and user_id=p_user;
  elsif caller='owner' and p_user<>auth.uid() and p_action in ('admin','member') then
    update public.memberships set role=p_action where household_id=p_household and user_id=p_user;
  elsif caller='owner' and p_user<>auth.uid() and p_action='transfer' then
    update public.memberships set role='admin' where household_id=p_household and user_id=auth.uid();
    update public.memberships set role='owner' where household_id=p_household and user_id=p_user;
  elsif p_action='remove' and target<>'owner' and (caller='owner' or (caller='admin' and target='member')) then
    delete from public.memberships where household_id=p_household and user_id=p_user;
  else raise exception 'FORBIDDEN'; end if;
end $$;
create function public.delete_household(p_household uuid,p_name text) returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household::text,0));
  if private.household_role(p_household) is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.households where id=p_household and name=p_name) then raise exception 'CONFIRMATION'; end if;
  delete from public.households where id=p_household;
end $$;
revoke all on function public.create_household(text),public.create_invitation(uuid,text,text),public.accept_invitation(text),public.manage_member(uuid,uuid,text),public.delete_household(uuid,text) from public;
grant execute on function public.create_household(text),public.create_invitation(uuid,text,text),public.accept_invitation(text),public.manage_member(uuid,uuid,text),public.delete_household(uuid,text) to authenticated;
commit;
