-- FICHIER GÉNÉRÉ : node scripts/bundle-database.mjs
-- Installation initiale seulement, dans un projet dédié vide.
-- Les migrations individuelles restent la source de référence.
-- Les e-mails et la planification sont configurés séparément.

-- Migration : 202609250001_profiles.sql
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


-- Migration : 202609250002_households.sql
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


-- Migration : 202609250003_family_records.sql
begin;
create table public.family_records (
  id uuid primary key, household_id uuid not null references public.households on delete cascade,
  kind text not null check(kind in ('event','task','shopping','child','category')),
  payload jsonb not null, created_by uuid not null references auth.users on delete cascade,
  version integer not null default 1, deleted boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,household_id)
);
create index family_records_household on public.family_records(household_id,kind) where not deleted;
create table public.event_exceptions (
  id uuid primary key, household_id uuid not null, event_id uuid not null,
  original_start text not null, cancelled boolean not null, payload jsonb, version integer not null default 1,
  foreign key(event_id,household_id) references public.family_records(id,household_id) on delete cascade,
  unique(event_id,original_start)
);
create table private.mutations (
  user_id uuid references auth.users on delete cascade, id uuid, result jsonb not null, created_at timestamptz not null default now(), primary key(user_id,id)
);
create function private.can_read_record(r public.family_records) returns boolean language sql stable security definer set search_path='' as $$
  select private.household_role(r.household_id) is not null and (r.kind<>'event' or r.created_by=auth.uid() or r.payload->>'visibility'='household' or (r.payload->>'visibility'='selected' and r.payload->'viewers' ? auth.uid()::text))
$$;
revoke all on function private.can_read_record(public.family_records) from public;
grant execute on function private.can_read_record(public.family_records) to authenticated;
alter table public.family_records enable row level security;
alter table public.event_exceptions enable row level security;
create policy record_read on public.family_records for select to authenticated using(private.can_read_record(family_records));
create policy exception_read on public.event_exceptions for select to authenticated using(exists(select 1 from public.family_records r where r.id=event_id and not r.deleted));
revoke all on public.family_records,public.event_exceptions from public,anon,authenticated;
grant select on public.family_records,public.event_exceptions to authenticated;

create function private.validate_payload(h uuid,k text,p jsonb) returns void language plpgsql set search_path='' as $$
declare item jsonb; field text; start_at timestamp; end_at timestamp; rule jsonb;
begin
  if jsonb_typeof(p)<>'object' or octet_length(p::text)>24000 or jsonb_typeof(p->'title') is distinct from 'string' or length(btrim(p->>'title')) not between 1 and 120 then raise exception 'INVALID_DATA'; end if;
  if k not in ('event','task','shopping','child','category') then raise exception 'INVALID_DATA'; end if;
  if k='event' and (not (p ?& array['title','description','location','color','start','end','timeZone','allDay','visibility','viewers','people','childId','categoryId','custody','recurrence','reminders']) or p-array['title','description','location','color','start','end','timeZone','allDay','visibility','viewers','people','childId','categoryId','custody','recurrence','reminders']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='task' and (not (p ?& array['title','description','assignee','due','timeZone','priority','status','reminders']) or p-array['title','description','assignee','due','timeZone','priority','status','reminders']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='shopping' and (not (p ?& array['title','quantity','category','done']) or p-array['title','quantity','category','done']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='child' and (not (p ?& array['title','color','avatar']) or p-array['title','color','avatar']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='category' and (not (p ?& array['title','color']) or p-array['title','color']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  foreach field in array case k when 'event' then array['description','location','timeZone','color','start','end','visibility'] when 'task' then array['description','timeZone','priority','status'] when 'shopping' then array['quantity','category'] when 'child' then array['avatar','color'] else array['color'] end loop
    if jsonb_typeof(p->field) is distinct from 'string' then raise exception 'INVALID_DATA'; end if;
  end loop;
  if k in ('event','task') then
    if length(p->>'description')>4000 or not private.valid_time_zone(p->>'timeZone') then raise exception 'INVALID_DATA'; end if;
    if jsonb_typeof(p->'reminders') is distinct from 'array' or jsonb_array_length(p->'reminders')>5 then raise exception 'INVALID_DATA'; end if;
    for item in select * from jsonb_array_elements(p->'reminders') loop
      if jsonb_typeof(item)<>'number' or item::text !~ '^\d+$' or (item::text)::integer not between 0 and 43200 then raise exception 'INVALID_DATA'; end if;
    end loop;
  end if;
  if k in ('event','child','category') and (p->>'color' is null or p->>'color' !~ '^#[a-fA-F0-9]{6}$') then raise exception 'INVALID_DATA'; end if;
  if k='child' and (p->>'avatar' is null or p->>'avatar' not in ('profile','sun','leaf','home')) then raise exception 'INVALID_DATA'; end if;
  if k='shopping' and (jsonb_typeof(p->'done') is distinct from 'boolean' or length(p->>'quantity')>80 or length(p->>'category')>80) then raise exception 'INVALID_DATA'; end if;
  if k='task' then
    if p->>'priority' is null or p->>'priority' not in ('low','normal','high') or p->>'status' is null or p->>'status' not in ('todo','doing','done') then raise exception 'INVALID_DATA'; end if;
    if p->>'assignee' is not null and not exists(select 1 from public.memberships where household_id=h and user_id=(p->>'assignee')::uuid) then raise exception 'INVALID_MEMBER'; end if;
    if p->>'due' is not null then
      if p->>'due' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'INVALID_DATA'; end if;
      start_at:=(p->>'due')::timestamp;
    end if;
  end if;
  if k='event' then
    if p->>'start' is null or p->>'end' is null or p->>'start' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or p->>'end' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'INVALID_DATA'; end if;
    start_at:=(p->>'start')::timestamp; end_at:=(p->>'end')::timestamp;
    if end_at<=start_at or end_at-start_at>interval '366 days' or length(p->>'location')>300 or jsonb_typeof(p->'allDay') is distinct from 'boolean' or jsonb_typeof(p->'custody') is distinct from 'boolean' then raise exception 'INVALID_DATA'; end if;
    if (p->>'allDay')::boolean and (start_at::time<>'00:00'::time or end_at::time<>'00:00'::time) then raise exception 'INVALID_DATA'; end if;
    if p->>'visibility' is null or p->>'visibility' not in ('household','private','selected') then raise exception 'INVALID_DATA'; end if;
    foreach field in array array['viewers','people'] loop
      if jsonb_typeof(p->field) is distinct from 'array' or jsonb_array_length(p->field)>50 then raise exception 'INVALID_DATA'; end if;
      for item in select * from jsonb_array_elements(p->field) loop
        if not exists(select 1 from public.memberships where household_id=h and user_id=(item#>>'{}')::uuid) then raise exception 'INVALID_MEMBER'; end if;
      end loop;
    end loop;
    foreach field in array array['childId','categoryId'] loop
      if p->>field is not null and not exists(select 1 from public.family_records where id=(p->>field)::uuid and household_id=h and kind=case field when 'childId' then 'child' else 'category' end and not deleted) then raise exception 'INVALID_REFERENCE'; end if;
    end loop;
    if (p->>'custody')::boolean and p->>'childId' is null then raise exception 'INVALID_REFERENCE'; end if;
    rule:=p->'recurrence';
    if rule is not null and rule<>'null'::jsonb then
      if jsonb_typeof(rule)<>'object' or rule->>'frequency' is null or rule->>'frequency' not in ('daily','weekly','monthly','yearly') or rule->>'interval' is null or rule->>'interval' !~ '^\d+$' or (rule->>'interval')::integer not between 1 and 52 then raise exception 'INVALID_RECURRENCE'; end if;
      if rule->>'count' is not null and (rule->>'count' !~ '^\d+$' or (rule->>'count')::integer not between 1 and 10000) then raise exception 'INVALID_RECURRENCE'; end if;
      if rule->>'until' is not null and ((rule->>'until')::timestamp<start_at) then raise exception 'INVALID_RECURRENCE'; end if;
    end if;
  end if;
end $$;
revoke all on function private.validate_payload(uuid,text,jsonb) from public;

create function public.save_record(p_household uuid,p_id uuid,p_kind text,p_payload jsonb,p_version integer,p_mutation uuid,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.family_records; saved public.family_records; result jsonb; caller text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household::text,0));
  if p_version is null or p_version<0 or p_delete is null or p_mutation is null then raise exception 'INVALID_DATA'; end if;
  caller:=private.household_role(p_household);
  if caller is null then raise exception 'FORBIDDEN'; end if;
  select m.result into result from private.mutations m where user_id=auth.uid() and id=p_mutation;
  if found then return result; end if;
  if (select count(*) from private.mutations where user_id=auth.uid() and created_at>now()-interval '1 minute')>=120 then raise exception 'LIMIT'; end if;
  select * into old from public.family_records where id=p_id for update;
  if found then
    if old.household_id<>p_household or old.kind<>p_kind or not private.can_read_record(old) then raise exception 'FORBIDDEN'; end if;
    if old.version<>p_version or old.deleted then raise exception 'CONFLICT'; end if;
    if old.kind='event' and old.created_by<>auth.uid() then raise exception 'FORBIDDEN'; end if;
  elsif p_version<>0 or p_delete then raise exception 'CONFLICT';
  elsif (select count(*) from public.family_records where household_id=p_household and not deleted)>=5000 then raise exception 'LIMIT'; end if;
  if p_kind in ('child','category') and caller not in ('owner','admin') then raise exception 'FORBIDDEN'; end if;
  if p_delete and p_kind in ('child','category') and exists(select 1 from public.family_records where household_id=p_household and not deleted and kind='event' and payload->>(case p_kind when 'child' then 'childId' else 'categoryId' end)=p_id::text) then raise exception 'IN_USE'; end if;
  if not p_delete then perform private.validate_payload(p_household,p_kind,p_payload); end if;
  if old.kind='event' and not p_delete and (old.payload->>'start' is distinct from p_payload->>'start' or old.payload->'recurrence' is distinct from p_payload->'recurrence') and exists(select 1 from public.event_exceptions where event_id=p_id) then raise exception 'EXCEPTION_CONFLICT'; end if;
  insert into public.family_records(id,household_id,kind,payload,created_by,deleted) values(p_id,p_household,p_kind,p_payload,auth.uid(),p_delete)
  on conflict(id) do update set payload=excluded.payload,deleted=excluded.deleted,version=family_records.version+1,updated_at=now() returning * into saved;
  result:=to_jsonb(saved);
  insert into private.mutations values(auth.uid(),p_mutation,result,now());
  return result;
end $$;

create function public.family_snapshot(p_household uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if private.household_role(p_household) is null then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'name',(select name from public.households where id=p_household),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'first_name',p.first_name)),'[]') from public.memberships m join public.profiles p on p.id=m.user_id where m.household_id=p_household),
    'records',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.family_records r where r.household_id=p_household and not r.deleted and private.can_read_record(r)),
    'exceptions',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.event_exceptions e join public.family_records r on r.id=e.event_id where r.household_id=p_household and not r.deleted and private.can_read_record(r)),
    'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'expires_at',i.expires_at,'used',i.used_at is not null)),'[]') from private.invitations i where i.household_id=p_household and private.household_role(p_household) in ('owner','admin') and expires_at>now())
  );
end $$;
create function public.revoke_invitation(p_household uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household::text,0));
  if private.household_role(p_household) is null or private.household_role(p_household) not in ('owner','admin') then raise exception 'FORBIDDEN'; end if;
  update private.invitations set expires_at=now() where id=p_id and household_id=p_household;
end $$;
revoke all on function public.save_record(uuid,uuid,text,jsonb,integer,uuid,boolean),public.family_snapshot(uuid),public.revoke_invitation(uuid,uuid) from public;
grant execute on function public.save_record(uuid,uuid,text,jsonb,integer,uuid,boolean),public.family_snapshot(uuid),public.revoke_invitation(uuid,uuid) to authenticated;
commit;


-- Migration : 202609250004_occurrences.sql
begin;
create function private.original_at(p jsonb,n integer) returns text language plpgsql immutable set search_path='' as $$
declare anchor timestamp:=(p->>'start')::timestamp; rule jsonb:=p->'recurrence'; result timestamp; step integer;
begin
  if n<0 or n>=10000 then return null; end if;
  if rule is null or rule='null'::jsonb then return case when n=0 then p->>'start' else null end; end if;
  if rule->>'count' is not null and n>=(rule->>'count')::integer then return null; end if;
  step:=n*(rule->>'interval')::integer;
  result:=anchor+case rule->>'frequency' when 'daily' then make_interval(days=>step) when 'weekly' then make_interval(days=>step*7) when 'monthly' then make_interval(months=>step) when 'yearly' then make_interval(years=>step) end;
  if rule->>'frequency' in ('monthly','yearly') and extract(day from result)<>extract(day from anchor) then return null; end if;
  if rule->>'until' is not null and result>(rule->>'until')::timestamp then return null; end if;
  return to_char(result,'YYYY-MM-DD"T"HH24:MI');
end $$;
revoke all on function private.original_at(jsonb,integer) from public;

create function public.change_occurrence(p_household uuid,p_event uuid,p_version integer,p_index integer,p_original text,p_scope text,p_payload jsonb,p_delete boolean,p_mutation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.family_records; next_id uuid; saved jsonb; changed jsonb; exception public.event_exceptions; i integer; origin text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household::text,0));
  if private.household_role(p_household) is null then raise exception 'FORBIDDEN'; end if;
  select result into saved from private.mutations where user_id=auth.uid() and id=p_mutation;
  if found then return saved; end if;
  select * into old from public.family_records where id=p_event and household_id=p_household and kind='event' and not deleted for update;
  if not found or old.created_by<>auth.uid() then raise exception 'FORBIDDEN'; end if;
  if old.version<>p_version then raise exception 'CONFLICT'; end if;
  if private.original_at(old.payload,p_index) is distinct from p_original then raise exception 'INVALID_OCCURRENCE'; end if;
  if p_version is null or p_index is null or p_original is null or p_scope is null or p_delete is null or p_mutation is null then raise exception 'INVALID_DATA'; end if;
  if p_scope not in ('one','following') then raise exception 'INVALID_SCOPE'; end if;
  if not p_delete then
    perform private.validate_payload(p_household,'event',p_payload);
    -- Une exception hérite toujours des droits, personnes et références de sa série.
    p_payload:=p_payload || jsonb_build_object('visibility',old.payload->'visibility','viewers',old.payload->'viewers','people',old.payload->'people','childId',old.payload->'childId','categoryId',old.payload->'categoryId','recurrence',null);
  end if;
  if p_scope='one' then
    if (select count(*) from public.event_exceptions where household_id=p_household)>=10000 then raise exception 'LIMIT'; end if;
    insert into public.event_exceptions(id,household_id,event_id,original_start,cancelled,payload)
    values(gen_random_uuid(),p_household,p_event,p_original,p_delete,case when p_delete then null else p_payload end)
    on conflict(event_id,original_start) do update set cancelled=excluded.cancelled,payload=excluded.payload,version=event_exceptions.version+1;
    update public.family_records set version=version+1,updated_at=now() where id=p_event;
  else
    if old.payload->'recurrence' is null or old.payload->'recurrence'='null'::jsonb then raise exception 'INVALID_SCOPE'; end if;
    if not p_delete then
      next_id:=gen_random_uuid();
      changed:=p_payload || jsonb_build_object('recurrence',old.payload->'recurrence');
      if old.payload->'recurrence'->>'count' is not null then changed:=jsonb_set(changed,'{recurrence,count}',to_jsonb((old.payload->'recurrence'->>'count')::integer-p_index)); end if;
      perform private.validate_payload(p_household,'event',changed);
      insert into public.family_records(id,household_id,kind,payload,created_by) values(next_id,p_household,'event',changed,auth.uid());
      -- Transfert des exceptions restantes selon leur index relatif, sans supprimer leurs déplacements.
      for exception in select * from public.event_exceptions where event_id=p_event and original_start>=p_original loop
        for i in p_index..9999 loop
          if private.original_at(old.payload,i)=exception.original_start then
            origin:=private.original_at(changed,i-p_index);
            if origin is null then raise exception 'EXCEPTION_CONFLICT'; end if;
            update public.event_exceptions set event_id=next_id,original_start=origin,version=version+1 where id=exception.id;
            exit;
          end if;
        end loop;
      end loop;
    else delete from public.event_exceptions where event_id=p_event and original_start>=p_original;
    end if;
    if p_index=0 then update public.family_records set deleted=true,version=version+1,updated_at=now() where id=p_event;
    else update public.family_records set payload=jsonb_set(payload,'{recurrence,count}',to_jsonb(p_index)),version=version+1,updated_at=now() where id=p_event;
    end if;
  end if;
  saved:=jsonb_build_object('id',coalesce(next_id,p_event));
  insert into private.mutations values(auth.uid(),p_mutation,saved,now());
  return saved;
end $$;
revoke all on function public.change_occurrence(uuid,uuid,integer,integer,text,text,jsonb,boolean,uuid) from public;
grant execute on function public.change_occurrence(uuid,uuid,integer,integer,text,text,jsonb,boolean,uuid) to authenticated;

create function public.erase_account(p_confirmation text) returns void language plpgsql security definer set search_path='' as $$
declare h uuid;
begin
  if auth.uid() is null or p_confirmation<>'SUPPRIMER MON COMPTE' then raise exception 'CONFIRMATION'; end if;
  -- Même ordre de verrouillage pour tous les foyers d’un compte.
  for h in select household_id from public.memberships where user_id=auth.uid() order by household_id loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(h::text,0));
  end loop;
  if exists(select 1 from public.memberships where user_id=auth.uid() and role='owner') then raise exception 'TRANSFER_OWNERSHIP'; end if;
  delete from auth.users where id=auth.uid();
end $$;
revoke all on function public.erase_account(text) from public;
grant execute on function public.erase_account(text) to authenticated;
commit;


-- Migration : 202609250005_notifications.sql
begin;
create table private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null,
  enabled boolean not null default true,created_at timestamptz not null default now()
);
create table private.reminder_jobs (
  id text primary key,record_id uuid not null references public.family_records on delete cascade,
  version integer not null,subscription_id uuid not null references private.push_subscriptions on delete cascade,
  due timestamptz not null,attempts integer not null default 0,state text not null default 'pending',
  available_at timestamptz not null default now(),lease uuid,created_at timestamptz not null default now()
);
create index reminder_due on private.reminder_jobs(available_at) where state='pending';
create function public.register_push(p_endpoint text,p_p256dh text,p_auth text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  if length(p_endpoint)>2048 or p_endpoint !~ '^https://(web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)/[^[:space:]]+$' or p_endpoint ~ '[@#]' or p_p256dh !~ '^[A-Za-z0-9_-]{87,88}={0,2}$' or p_auth !~ '^[A-Za-z0-9_-]{22}={0,2}$' then raise exception 'INVALID_SUBSCRIPTION'; end if;
  if (select count(*) from private.push_subscriptions where user_id=auth.uid())>=5 and not exists(select 1 from private.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint) then raise exception 'LIMIT'; end if;
  -- Le navigateur partagé ne reste jamais inscrit pour deux comptes sur le même endpoint.
  delete from private.push_subscriptions where endpoint=p_endpoint and user_id<>auth.uid();
  insert into private.push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),p_endpoint,p_p256dh,p_auth)
  on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,enabled=true returning id into result;
  return result;
end $$;
create function public.disable_push(p_endpoint text default null) returns void language plpgsql security definer set search_path='' as $$
begin delete from private.push_subscriptions where user_id=auth.uid() and (p_endpoint is null or endpoint=p_endpoint);end $$;
create function private.readable_by(r public.family_records,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not r.deleted and exists(select 1 from public.memberships where household_id=r.household_id and user_id=u) and (r.kind<>'event' or r.created_by=u or r.payload->>'visibility'='household' or (r.payload->>'visibility'='selected' and r.payload->'viewers' ? u::text))
$$;
create function public.reminder_sources(p_after uuid default '00000000-0000-0000-0000-000000000000') returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(src)),'[]') from (
  select to_jsonb(r) as record,
    (select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.event_exceptions e where e.event_id=r.id) as exceptions,
    (select coalesce(jsonb_agg(jsonb_build_object('id',s.id)),'[]') from private.push_subscriptions s where s.enabled and private.readable_by(r,s.user_id) and (r.kind<>'task' or r.payload->>'assignee' is null or r.payload->>'assignee'=s.user_id::text)) as subscriptions
  from public.family_records r where r.id>p_after and not r.deleted and r.kind in ('event','task') and jsonb_array_length(r.payload->'reminders')>0 and exists(select 1 from private.push_subscriptions s where s.enabled and private.readable_by(r,s.user_id)) order by r.id limit 100
 ) src
$$;
create function public.enqueue_reminder(p_id text,p_record uuid,p_version integer,p_subscription uuid,p_due timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
  if length(p_id)>300 or p_due<now()-interval '20 minutes' or p_due>now()+interval '5 minutes' then return; end if;
  insert into private.reminder_jobs(id,record_id,version,subscription_id,due,available_at) values(p_id,p_record,p_version,p_subscription,p_due,p_due) on conflict do nothing;
end $$;
create function public.claim_reminders() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  delete from private.reminder_jobs where due<now()-interval '1 day';
  delete from private.mutations where created_at<now()-interval '8 days';
  delete from private.invitations where expires_at<now()-interval '30 days';
  update private.reminder_jobs set state='pending' where state='sending' and available_at<now();
  update private.reminder_jobs j set state='cancelled' where j.state='pending' and (j.due<now()-interval '20 minutes' or not exists(select 1 from public.family_records r join private.push_subscriptions s on s.id=j.subscription_id where r.id=j.record_id and r.version=j.version and s.enabled and private.readable_by(r,s.user_id) and (r.kind<>'task' or r.payload->>'status'<>'done')));
  with candidates as (select id from private.reminder_jobs where state='pending' and available_at<=now() and attempts<5 order by due for update skip locked limit 50),
  claimed as (update private.reminder_jobs j set state='sending',lease=gen_random_uuid(),attempts=attempts+1,available_at=now()+interval '2 minutes' from candidates c where j.id=c.id returning j.*)
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease,'subscriptionId',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') into result from claimed c join private.push_subscriptions s on s.id=c.subscription_id;
  return result;
end $$;
create function public.finish_reminder(p_id text,p_lease uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare job private.reminder_jobs;
begin
  select * into job from private.reminder_jobs where id=p_id and lease=p_lease and state='sending' for update;
  if not found then return; end if;
  if p_status='expired' then delete from private.push_subscriptions where id=job.subscription_id;
  else update private.reminder_jobs set state=case when p_status='sent' then 'sent' when attempts>=5 then 'failed' else 'pending' end,available_at=now()+make_interval(secs=>least(600,30*(2^attempts)::integer)),lease=null where id=p_id; end if;
end $$;
revoke all on function public.register_push(text,text,text),public.disable_push(text),private.readable_by(public.family_records,uuid),public.reminder_sources(uuid),public.enqueue_reminder(text,uuid,integer,uuid,timestamptz),public.claim_reminders(),public.finish_reminder(text,uuid,text) from public;
grant execute on function public.register_push(text,text,text),public.disable_push(text) to authenticated;
grant execute on function public.reminder_sources(uuid),public.enqueue_reminder(text,uuid,integer,uuid,timestamptz),public.claim_reminders(),public.finish_reminder(text,uuid,text) to service_role;
commit;


-- Migration : 202609250006_maintenance.sql
begin;
-- Realtime accélère les relectures ; le polling conserve la reprise si le canal est coupé.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='family_records') then
    alter publication supabase_realtime add table public.family_records;
  end if;
end $$;
create index mutation_retention on private.mutations(created_at);
create index mutation_rate on private.mutations(user_id,created_at);
create table private.worker_state(id boolean primary key default true check(id),after_id uuid not null default '00000000-0000-0000-0000-000000000000');
insert into private.worker_state default values;
create function public.reminder_cursor(p_after uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if p_after is not null then update private.worker_state set after_id=p_after where id; end if;
  select after_id into result from private.worker_state where id;
  return result;
end $$;
create function public.prune_family_data() returns void language plpgsql security definer set search_path='' as $$
begin
  delete from public.family_records where deleted and updated_at<now()-interval '30 days';
  delete from private.mutations where created_at<now()-interval '8 days';
  delete from private.invitations where expires_at<now()-interval '30 days';
  delete from private.reminder_jobs where due<now()-interval '1 day';
end $$;
revoke all on function public.reminder_cursor(uuid),public.prune_family_data() from public;
grant execute on function public.reminder_cursor(uuid),public.prune_family_data() to service_role;
commit;


-- Migration : 202609260007_activity_notifications.sql
begin;
-- Une alerte par modification transactionnelle, destinataire et foyer.
create table private.activity_jobs (
 id uuid primary key default gen_random_uuid(), transaction_id bigint not null,
 household_id uuid not null references public.households on delete cascade,
 actor_id uuid not null, subscription_id uuid not null references private.push_subscriptions on delete cascade,
 record_ids uuid[] not null default '{}', kind text not null, action text not null,
 state text not null default 'pending', attempts integer not null default 0,
 available_at timestamptz not null default now(), lease uuid, created_at timestamptz not null default now(),
 unique(transaction_id,household_id,subscription_id)
);
revoke all on private.activity_jobs from public,anon,authenticated;
create index activity_pending on private.activity_jobs(available_at) where state='pending';

create function private.activity_readable(r public.family_records,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where household_id=r.household_id and user_id=u)
 and (r.kind<>'event' or r.created_by=u or r.payload->>'visibility'='household'
 or (r.payload->>'visibility'='selected' and r.payload->'viewers' ? u::text))
$$;
create function private.queue_activity(h uuid,k text,a text,rid uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return; end if;
 insert into private.activity_jobs(transaction_id,household_id,actor_id,subscription_id,record_ids,kind,action)
 select txid_current(),h,auth.uid(),s.id,case when rid is null then '{}'::uuid[] else array[rid] end,k,a
 from private.push_subscriptions s join public.memberships m on m.user_id=s.user_id and m.household_id=h
 where s.enabled and s.user_id<>auth.uid()
 and (rid is null or exists(select 1 from public.family_records r where r.id=rid and private.activity_readable(r,s.user_id)))
 on conflict(transaction_id,household_id,subscription_id) do update set
 record_ids=array(select distinct unnest(private.activity_jobs.record_ids||excluded.record_ids)),
 kind=case when private.activity_jobs.kind=excluded.kind then excluded.kind else 'household' end,
 action=case when private.activity_jobs.action=excluded.action then excluded.action else 'updated' end;
end $$;
create function private.notify_record_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new is not distinct from old then return new; end if;
 perform private.queue_activity(new.household_id,new.kind,case when new.deleted then 'deleted' when tg_op='INSERT' then 'created' else 'updated' end,new.id);
 return new;
end $$;
create trigger family_record_activity after insert or update on public.family_records for each row execute function private.notify_record_activity();
-- Les modifications d’occurrence incrémentent la version de family_records dans la même transaction.
create function private.notify_household_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare h uuid;k text;
begin
 if tg_op='UPDATE' and new is not distinct from old then return new; end if;
 if tg_table_name='profiles' then
   for h in select household_id from public.memberships where user_id=new.id loop
     perform private.queue_activity(h,'profile','updated');
   end loop;
   return new;
 end if;
 if tg_table_name='households' then h:=new.id;k:='household';
 elsif tg_table_name='invitations' then
   -- L’acceptation est déjà notifiée par l’ajout du membre.
   if tg_op='UPDATE' and new.used_at is distinct from old.used_at then return new; end if;
   h:=case when tg_op='DELETE' then old.household_id else new.household_id end;k:='invitation';
 else h:=case when tg_op='DELETE' then old.household_id else new.household_id end;k:='member';
 end if;
 if exists(select 1 from public.households where id=h) then
 perform private.queue_activity(h,k,case when tg_op='INSERT' then 'created' when tg_op='DELETE' then 'deleted' else 'updated' end);
 end if;
 return coalesce(new,old);
end $$;
create trigger household_activity after update on public.households for each row execute function private.notify_household_activity();
create trigger member_activity after insert or update or delete on public.memberships for each row execute function private.notify_household_activity();
create trigger invitation_activity after insert or update or delete on private.invitations for each row execute function private.notify_household_activity();
create trigger profile_activity after update on public.profiles for each row execute function private.notify_household_activity();

create function public.claim_activity() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 delete from private.activity_jobs where created_at<now()-interval '1 day';
 update private.activity_jobs set state='pending' where state='sending' and available_at<now();
 update private.activity_jobs j set state='cancelled' where j.state='pending' and not exists(
   select 1 from private.push_subscriptions s join public.memberships m on m.user_id=s.user_id and m.household_id=j.household_id
   where s.id=j.subscription_id and s.enabled and s.user_id<>j.actor_id
   and not exists(select 1 from unnest(j.record_ids) rid where not exists(
     select 1 from public.family_records r where r.id=rid and private.activity_readable(r,s.user_id)
   ))
 );
 with candidates as(select id from private.activity_jobs where state='pending' and available_at<=now() and attempts<5 order by created_at for update skip locked limit 50),
 claimed as(update private.activity_jobs j set state='sending',lease=gen_random_uuid(),attempts=attempts+1,available_at=now()+interval '2 minutes' from candidates c where j.id=c.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth),'kind',c.kind,'action',c.action)),'[]') into result
 from claimed c join private.push_subscriptions s on s.id=c.subscription_id;
 return result;
end $$;
create function public.finish_activity(p_id uuid,p_lease uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare job private.activity_jobs;
begin
 select * into job from private.activity_jobs where id=p_id and lease=p_lease and state='sending' for update;
 if not found then return; end if;
 if p_status='expired' then delete from private.push_subscriptions where id=job.subscription_id;
 else update private.activity_jobs set state=case when p_status='sent' then 'sent' when attempts>=5 then 'failed' else 'pending' end,
 available_at=now()+make_interval(secs=>least(600,30*(2^attempts)::integer)),lease=null where id=p_id;
 end if;
end $$;
revoke all on function private.activity_readable(public.family_records,uuid),private.queue_activity(uuid,text,text,uuid),private.notify_record_activity(),private.notify_household_activity(),public.claim_activity(),public.finish_activity(uuid,uuid,text) from public;
grant execute on function public.claim_activity(),public.finish_activity(uuid,uuid,text) to service_role;
commit;


-- Migration : 202609260008_worker_push_config.sql
begin;
-- Configuration chiffrée dans Vault, accessible uniquement au moteur serveur.
create function public.worker_push_config(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare expected text; configuration jsonb;
begin
 select decrypted_secret into expected from vault.decrypted_secrets
 where name='REMINDER_CRON_SECRET';
 if expected is null or length(expected)<32 or p_token is distinct from expected then
   return null;
 end if;
 select jsonb_object_agg(name,decrypted_secret) into configuration
 from vault.decrypted_secrets
 where name in ('VAPID_SUBJECT','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY');
 if configuration is null or not configuration ?& array['VAPID_SUBJECT','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY'] then
   raise exception 'Configuration push incomplète';
 end if;
 return configuration;
end $$;
revoke all on function public.worker_push_config(text) from public,anon,authenticated;
grant execute on function public.worker_push_config(text) to service_role;
commit;


-- Migration : 202609260009_notification_details.sql
begin;
-- Conserver les détails de l’occurrence réellement planifiée, sans description ni données d’accès.
alter table private.reminder_jobs add column detail jsonb;
alter table private.activity_jobs add column occurrence_starts jsonb not null default '{}';

create function private.notification_detail(p jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object(
 'title',left(p->>'title',120),'start',coalesce(p->>'start',p->>'due'),
 'allDay',coalesce(p->'allDay','false'::jsonb),'timeZone',p->>'timeZone'))
$$;
revoke all on function private.notification_detail(jsonb) from public;

create function private.capture_notification_occurrence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform set_config('family.notification_occurrence',
 jsonb_build_object('transaction',txid_current()::text,'event',new.event_id,'start',new.original_start)::text,true);
 return new;
end $$;
revoke all on function private.capture_notification_occurrence() from public;
create trigger notification_occurrence after insert or update on public.event_exceptions
for each row execute function private.capture_notification_occurrence();

create or replace function private.notify_record_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare context jsonb;
begin
 if tg_op='UPDATE' and new is not distinct from old then return new; end if;
 perform private.queue_activity(new.household_id,new.kind,case when new.deleted then 'deleted' when tg_op='INSERT' then 'created' else 'updated' end,new.id);
 if tg_op='UPDATE' and new.kind='event' and new.payload=old.payload then
   context:=nullif(current_setting('family.notification_occurrence',true),'')::jsonb;
   if context->>'transaction'=txid_current()::text and context->>'event'=new.id::text then
     update private.activity_jobs set occurrence_starts=occurrence_starts||jsonb_build_object(new.id::text,context->>'start')
     where transaction_id=txid_current() and household_id=new.household_id and new.id=any(record_ids);
   end if;
 end if;
 return new;
end $$;

-- Le paramètre optionnel reste compatible avec les appels de l’ancien moteur.
drop function public.enqueue_reminder(text,uuid,integer,uuid,timestamptz);
create function public.enqueue_reminder(p_id text,p_record uuid,p_version integer,p_subscription uuid,p_due timestamptz,p_detail jsonb default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if length(p_id)>300 or p_due<now()-interval '20 minutes' or p_due>now()+interval '5 minutes' then return; end if;
 insert into private.reminder_jobs(id,record_id,version,subscription_id,due,available_at,detail)
 values(p_id,p_record,p_version,p_subscription,p_due,p_due,case when p_detail is null then null else private.notification_detail(p_detail) end)
 on conflict(id) do update set detail=excluded.detail
 where private.reminder_jobs.state='pending' and private.reminder_jobs.detail is null;
end $$;
revoke all on function public.enqueue_reminder(text,uuid,integer,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_reminder(text,uuid,integer,uuid,timestamptz,jsonb) to service_role;
create or replace function public.claim_activity() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 delete from private.activity_jobs where created_at<now()-interval '1 day';
 update private.activity_jobs set state='pending' where state='sending' and available_at<now();
 update private.activity_jobs j set state='cancelled' where j.state='pending' and not exists(
   select 1 from private.push_subscriptions s join public.memberships m on m.user_id=s.user_id and m.household_id=j.household_id
   where s.id=j.subscription_id and s.enabled and s.user_id<>j.actor_id
   and not exists(select 1 from unnest(j.record_ids) rid where not exists(
     select 1 from public.family_records r where r.id=rid and private.activity_readable(r,s.user_id)
   ))
 );
 with candidates as(select id from private.activity_jobs where state='pending' and available_at<=now() and attempts<5 order by created_at for update skip locked limit 50),
 claimed as(update private.activity_jobs j set state='sending',lease=gen_random_uuid(),attempts=attempts+1,available_at=now()+interval '2 minutes' from candidates c where j.id=c.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth),'kind',c.kind,'action',c.action,'total',cardinality(c.record_ids),'details',coalesce((select jsonb_agg(x.detail) from (select private.notification_detail(case when e.payload is not null then e.payload when c.occurrence_starts ? r.id::text then r.payload||jsonb_build_object('start',c.occurrence_starts->>r.id::text) else r.payload end) as detail from unnest(c.record_ids) with ordinality ids(id,n) join public.family_records r on r.id=ids.id left join public.event_exceptions e on e.event_id=r.id and e.original_start=c.occurrence_starts->>r.id::text order by ids.n limit 3)x),'[]'::jsonb))),'[]') into result
 from claimed c join private.push_subscriptions s on s.id=c.subscription_id;
 return result;
end $$;
create or replace function public.claim_reminders() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  delete from private.reminder_jobs where due<now()-interval '1 day';
  delete from private.mutations where created_at<now()-interval '8 days';
  delete from private.invitations where expires_at<now()-interval '30 days';
  update private.reminder_jobs set state='pending' where state='sending' and available_at<now();
  update private.reminder_jobs j set state='cancelled' where j.state='pending' and (j.due<now()-interval '20 minutes' or not exists(select 1 from public.family_records r join private.push_subscriptions s on s.id=j.subscription_id where r.id=j.record_id and r.version=j.version and s.enabled and private.readable_by(r,s.user_id) and (r.kind<>'task' or r.payload->>'status'<>'done')));
  with candidates as (select id from private.reminder_jobs where state='pending' and available_at<=now() and attempts<5 order by due for update skip locked limit 50),
  claimed as (update private.reminder_jobs j set state='sending',lease=gen_random_uuid(),attempts=attempts+1,available_at=now()+interval '2 minutes' from candidates c where j.id=c.id returning j.*)
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease,'subscriptionId',s.id,'kind',r.kind,'details',case when c.detail is not null then jsonb_build_array(c.detail) when r.kind<>'event' or r.payload->'recurrence' is null or r.payload->'recurrence'='null'::jsonb then jsonb_build_array(private.notification_detail(r.payload)) else '[]'::jsonb end,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') into result from claimed c join private.push_subscriptions s on s.id=c.subscription_id join public.family_records r on r.id=c.record_id;
  return result;
end $$;
-- Inclure les rappels propres aux occurrences, meme si la serie n'en a aucun.
create or replace function public.reminder_sources(p_after uuid default '00000000-0000-0000-0000-000000000000') returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(src)),'[]') from (
  select to_jsonb(r) as record,
    (select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.event_exceptions e where e.event_id=r.id) as exceptions,
    (select coalesce(jsonb_agg(jsonb_build_object('id',s.id)),'[]') from private.push_subscriptions s where s.enabled and private.readable_by(r,s.user_id) and (r.kind<>'task' or r.payload->>'assignee' is null or r.payload->>'assignee'=s.user_id::text)) as subscriptions
  from public.family_records r where r.id>p_after and not r.deleted and r.kind in ('event','task') and (jsonb_array_length(r.payload->'reminders')>0 or exists(select 1 from public.event_exceptions e where e.event_id=r.id and not e.cancelled and jsonb_array_length(e.payload->'reminders')>0)) and exists(select 1 from private.push_subscriptions s where s.enabled and private.readable_by(r,s.user_id)) order by r.id limit 100
 ) src
$$;
commit;


-- Migration : 202609260010_reminder_units.sql
begin;
-- Accepter les unites explicites sans modifier les rappels historiques.
create or replace function private.validate_payload(h uuid,k text,p jsonb) returns void language plpgsql set search_path='' as $$
declare item jsonb; field text; start_at timestamp; end_at timestamp; rule jsonb;
begin
  if jsonb_typeof(p)<>'object' or octet_length(p::text)>24000 or jsonb_typeof(p->'title') is distinct from 'string' or length(btrim(p->>'title')) not between 1 and 120 then raise exception 'INVALID_DATA'; end if;
  if k not in ('event','task','shopping','child','category') then raise exception 'INVALID_DATA'; end if;
  if k='event' and (not (p ?& array['title','description','location','color','start','end','timeZone','allDay','visibility','viewers','people','childId','categoryId','custody','recurrence','reminders']) or p-array['title','description','location','color','start','end','timeZone','allDay','visibility','viewers','people','childId','categoryId','custody','recurrence','reminders']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='task' and (not (p ?& array['title','description','assignee','due','timeZone','priority','status','reminders']) or p-array['title','description','assignee','due','timeZone','priority','status','reminders']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='shopping' and (not (p ?& array['title','quantity','category','done']) or p-array['title','quantity','category','done']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='child' and (not (p ?& array['title','color','avatar']) or p-array['title','color','avatar']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='category' and (not (p ?& array['title','color']) or p-array['title','color']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  foreach field in array case k when 'event' then array['description','location','timeZone','color','start','end','visibility'] when 'task' then array['description','timeZone','priority','status'] when 'shopping' then array['quantity','category'] when 'child' then array['avatar','color'] else array['color'] end loop
    if jsonb_typeof(p->field) is distinct from 'string' then raise exception 'INVALID_DATA'; end if;
  end loop;
  if k in ('event','task') then
    if length(p->>'description')>4000 or not private.valid_time_zone(p->>'timeZone') then raise exception 'INVALID_DATA'; end if;
    if jsonb_typeof(p->'reminders') is distinct from 'array' or jsonb_array_length(p->'reminders')>5 then raise exception 'INVALID_DATA'; end if;
    for item in select * from jsonb_array_elements(p->'reminders') loop
      if jsonb_typeof(item)='number' then
        if item::text !~ '^\d+$' or (item::text)::numeric not between 0 and 43200 then raise exception 'INVALID_DATA'; end if;
      elsif jsonb_typeof(item)='object' then
        if item-array['amount','unit']<>'{}'::jsonb or jsonb_typeof(item->'amount') is distinct from 'number'
          or jsonb_typeof(item->'unit') is distinct from 'string'
          or item->>'amount' !~ '^\d+$' or item->>'unit' not in ('minutes','hours','days','weeks','months')
        then raise exception 'INVALID_DATA'; end if;
        if (item->>'amount')::numeric not between (case when item->>'unit'='minutes' then 0 else 1 end)
          and (case item->>'unit' when 'minutes' then 525600 when 'hours' then 8760 when 'days' then 365 when 'weeks' then 52 when 'months' then 12 end)
        then raise exception 'INVALID_DATA'; end if;
      else raise exception 'INVALID_DATA'; end if;
    end loop;
  end if;
  if k in ('event','child','category') and (p->>'color' is null or p->>'color' !~ '^#[a-fA-F0-9]{6}$') then raise exception 'INVALID_DATA'; end if;
  if k='child' and (p->>'avatar' is null or p->>'avatar' not in ('profile','sun','leaf','home')) then raise exception 'INVALID_DATA'; end if;
  if k='shopping' and (jsonb_typeof(p->'done') is distinct from 'boolean' or length(p->>'quantity')>80 or length(p->>'category')>80) then raise exception 'INVALID_DATA'; end if;
  if k='task' then
    if p->>'priority' is null or p->>'priority' not in ('low','normal','high') or p->>'status' is null or p->>'status' not in ('todo','doing','done') then raise exception 'INVALID_DATA'; end if;
    if p->>'assignee' is not null and not exists(select 1 from public.memberships where household_id=h and user_id=(p->>'assignee')::uuid) then raise exception 'INVALID_MEMBER'; end if;
    if p->>'due' is not null then
      if p->>'due' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'INVALID_DATA'; end if;
      start_at:=(p->>'due')::timestamp;
    end if;
  end if;
  if k='event' then
    if p->>'start' is null or p->>'end' is null or p->>'start' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or p->>'end' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'INVALID_DATA'; end if;
    start_at:=(p->>'start')::timestamp; end_at:=(p->>'end')::timestamp;
    if end_at<=start_at or end_at-start_at>interval '366 days' or length(p->>'location')>300 or jsonb_typeof(p->'allDay') is distinct from 'boolean' or jsonb_typeof(p->'custody') is distinct from 'boolean' then raise exception 'INVALID_DATA'; end if;
    if (p->>'allDay')::boolean and (start_at::time<>'00:00'::time or end_at::time<>'00:00'::time) then raise exception 'INVALID_DATA'; end if;
    if p->>'visibility' is null or p->>'visibility' not in ('household','private','selected') then raise exception 'INVALID_DATA'; end if;
    foreach field in array array['viewers','people'] loop
      if jsonb_typeof(p->field) is distinct from 'array' or jsonb_array_length(p->field)>50 then raise exception 'INVALID_DATA'; end if;
      for item in select * from jsonb_array_elements(p->field) loop
        if not exists(select 1 from public.memberships where household_id=h and user_id=(item#>>'{}')::uuid) then raise exception 'INVALID_MEMBER'; end if;
      end loop;
    end loop;
    foreach field in array array['childId','categoryId'] loop
      if p->>field is not null and not exists(select 1 from public.family_records where id=(p->>field)::uuid and household_id=h and kind=case field when 'childId' then 'child' else 'category' end and not deleted) then raise exception 'INVALID_REFERENCE'; end if;
    end loop;
    if (p->>'custody')::boolean and p->>'childId' is null then raise exception 'INVALID_REFERENCE'; end if;
    rule:=p->'recurrence';
    if rule is not null and rule<>'null'::jsonb then
      if jsonb_typeof(rule)<>'object' or rule->>'frequency' is null or rule->>'frequency' not in ('daily','weekly','monthly','yearly') or rule->>'interval' is null or rule->>'interval' !~ '^\d+$' or (rule->>'interval')::integer not between 1 and 52 then raise exception 'INVALID_RECURRENCE'; end if;
      if rule->>'count' is not null and (rule->>'count' !~ '^\d+$' or (rule->>'count')::integer not between 1 and 10000) then raise exception 'INVALID_RECURRENCE'; end if;
      if rule->>'until' is not null and ((rule->>'until')::timestamp<start_at) then raise exception 'INVALID_RECURRENCE'; end if;
    end if;
  end if;
end $$;
commit;


-- Migration : 202609260011_birthdays.sql
begin;
-- Anniversaires annuels ; le 29 fevrier revient le 28 les annees non bissextiles.
create or replace function private.validate_payload(h uuid,k text,p jsonb) returns void language plpgsql set search_path='' as $$
declare item jsonb; field text; start_at timestamp; end_at timestamp; rule jsonb;
begin
  if jsonb_typeof(p)<>'object' or octet_length(p::text)>24000 or jsonb_typeof(p->'title') is distinct from 'string' or length(btrim(p->>'title')) not between 1 and 120 then raise exception 'INVALID_DATA'; end if;
  if k not in ('event','task','shopping','child','category') then raise exception 'INVALID_DATA'; end if;
  if k='event' and (not (p ?& array['title','description','location','color','start','end','timeZone','allDay','visibility','viewers','people','childId','categoryId','custody','recurrence','reminders']) or p-array['title','description','location','color','start','end','timeZone','allDay','visibility','viewers','people','childId','categoryId','custody','recurrence','reminders','eventType']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='task' and (not (p ?& array['title','description','assignee','due','timeZone','priority','status','reminders']) or p-array['title','description','assignee','due','timeZone','priority','status','reminders']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='shopping' and (not (p ?& array['title','quantity','category','done']) or p-array['title','quantity','category','done']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='child' and (not (p ?& array['title','color','avatar']) or p-array['title','color','avatar']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  if k='category' and (not (p ?& array['title','color']) or p-array['title','color']<>'{}'::jsonb) then raise exception 'INVALID_DATA'; end if;
  foreach field in array case k when 'event' then array['description','location','timeZone','color','start','end','visibility'] when 'task' then array['description','timeZone','priority','status'] when 'shopping' then array['quantity','category'] when 'child' then array['avatar','color'] else array['color'] end loop
    if jsonb_typeof(p->field) is distinct from 'string' then raise exception 'INVALID_DATA'; end if;
  end loop;
  if k in ('event','task') then
    if length(p->>'description')>4000 or not private.valid_time_zone(p->>'timeZone') then raise exception 'INVALID_DATA'; end if;
    if jsonb_typeof(p->'reminders') is distinct from 'array' or jsonb_array_length(p->'reminders')>5 then raise exception 'INVALID_DATA'; end if;
    for item in select * from jsonb_array_elements(p->'reminders') loop
      if jsonb_typeof(item)='number' then
        if item::text !~ '^\d+$' or (item::text)::numeric not between 0 and 43200 then raise exception 'INVALID_DATA'; end if;
      elsif jsonb_typeof(item)='object' then
        if item-array['amount','unit']<>'{}'::jsonb or jsonb_typeof(item->'amount') is distinct from 'number'
          or jsonb_typeof(item->'unit') is distinct from 'string'
          or item->>'amount' !~ '^\d+$' or item->>'unit' not in ('minutes','hours','days','weeks','months')
        then raise exception 'INVALID_DATA'; end if;
        if (item->>'amount')::numeric not between (case when item->>'unit'='minutes' then 0 else 1 end)
          and (case item->>'unit' when 'minutes' then 525600 when 'hours' then 8760 when 'days' then 365 when 'weeks' then 52 when 'months' then 12 end)
        then raise exception 'INVALID_DATA'; end if;
      else raise exception 'INVALID_DATA'; end if;
    end loop;
  end if;
  if k in ('event','child','category') and (p->>'color' is null or p->>'color' !~ '^#[a-fA-F0-9]{6}$') then raise exception 'INVALID_DATA'; end if;
  if k='child' and (p->>'avatar' is null or p->>'avatar' not in ('profile','sun','leaf','home')) then raise exception 'INVALID_DATA'; end if;
  if k='shopping' and (jsonb_typeof(p->'done') is distinct from 'boolean' or length(p->>'quantity')>80 or length(p->>'category')>80) then raise exception 'INVALID_DATA'; end if;
  if k='task' then
    if p->>'priority' is null or p->>'priority' not in ('low','normal','high') or p->>'status' is null or p->>'status' not in ('todo','doing','done') then raise exception 'INVALID_DATA'; end if;
    if p->>'assignee' is not null and not exists(select 1 from public.memberships where household_id=h and user_id=(p->>'assignee')::uuid) then raise exception 'INVALID_MEMBER'; end if;
    if p->>'due' is not null then
      if p->>'due' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'INVALID_DATA'; end if;
      start_at:=(p->>'due')::timestamp;
    end if;
  end if;
  if k='event' then
    if p ? 'eventType' and (jsonb_typeof(p->'eventType') is distinct from 'string' or p->>'eventType' not in ('event','birthday')) then raise exception 'INVALID_DATA'; end if;
    if p->>'start' is null or p->>'end' is null or p->>'start' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or p->>'end' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'INVALID_DATA'; end if;
    start_at:=(p->>'start')::timestamp; end_at:=(p->>'end')::timestamp;
    if end_at<=start_at or end_at-start_at>interval '366 days' or length(p->>'location')>300 or jsonb_typeof(p->'allDay') is distinct from 'boolean' or jsonb_typeof(p->'custody') is distinct from 'boolean' then raise exception 'INVALID_DATA'; end if;
    if (p->>'allDay')::boolean and (start_at::time<>'00:00'::time or end_at::time<>'00:00'::time) then raise exception 'INVALID_DATA'; end if;
    if p->>'visibility' is null or p->>'visibility' not in ('household','private','selected') then raise exception 'INVALID_DATA'; end if;
    foreach field in array array['viewers','people'] loop
      if jsonb_typeof(p->field) is distinct from 'array' or jsonb_array_length(p->field)>50 then raise exception 'INVALID_DATA'; end if;
      for item in select * from jsonb_array_elements(p->field) loop
        if not exists(select 1 from public.memberships where household_id=h and user_id=(item#>>'{}')::uuid) then raise exception 'INVALID_MEMBER'; end if;
      end loop;
    end loop;
    foreach field in array array['childId','categoryId'] loop
      if p->>field is not null and not exists(select 1 from public.family_records where id=(p->>field)::uuid and household_id=h and kind=case field when 'childId' then 'child' else 'category' end and not deleted) then raise exception 'INVALID_REFERENCE'; end if;
    end loop;
    if (p->>'custody')::boolean and p->>'childId' is null then raise exception 'INVALID_REFERENCE'; end if;
    rule:=p->'recurrence';
    if rule is not null and rule<>'null'::jsonb then
      if jsonb_typeof(rule)<>'object' or rule->>'frequency' is null or rule->>'frequency' not in ('daily','weekly','monthly','yearly') or rule->>'interval' is null or rule->>'interval' !~ '^\d+$' or (rule->>'interval')::integer not between 1 and 52 then raise exception 'INVALID_RECURRENCE'; end if;
      if rule->>'count' is not null and (rule->>'count' !~ '^\d+$' or (rule->>'count')::integer not between 1 and 10000) then raise exception 'INVALID_RECURRENCE'; end if;
      if rule->>'until' is not null and ((rule->>'until')::timestamp<start_at) then raise exception 'INVALID_RECURRENCE'; end if;
    end if;
  end if;
end $$;
create or replace function private.original_at(p jsonb,n integer) returns text language plpgsql immutable set search_path='' as $$
declare anchor timestamp:=(p->>'start')::timestamp; rule jsonb:=p->'recurrence'; result timestamp; step integer;
begin
  if n<0 or n>=10000 then return null; end if;
  if rule is null or rule='null'::jsonb then return case when n=0 then p->>'start' else null end; end if;
  if rule->>'count' is not null and n>=(rule->>'count')::integer then return null; end if;
  step:=n*(rule->>'interval')::integer;
  result:=anchor+case rule->>'frequency' when 'daily' then make_interval(days=>step) when 'weekly' then make_interval(days=>step*7) when 'monthly' then make_interval(months=>step) when 'yearly' then make_interval(years=>step) end;
  if rule->>'frequency' in ('monthly','yearly') and extract(day from result)<>extract(day from anchor) and coalesce(p->>'eventType','event')<>'birthday' then return null; end if;
  if rule->>'until' is not null and result>(rule->>'until')::timestamp then return null; end if;
  return to_char(result,'YYYY-MM-DD"T"HH24:MI');
end $$;
commit;


-- Migration : 202609260012_shared_event_editing.sql
begin;
create or replace function public.save_record(p_household uuid,p_id uuid,p_kind text,p_payload jsonb,p_version integer,p_mutation uuid,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.family_records; saved public.family_records; result jsonb; caller text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household::text,0));
  if p_version is null or p_version<0 or p_delete is null or p_mutation is null then raise exception 'INVALID_DATA'; end if;
  caller:=private.household_role(p_household);
  if caller is null then raise exception 'FORBIDDEN'; end if;
  select m.result into result from private.mutations m where user_id=auth.uid() and id=p_mutation;
  if found then return result; end if;
  if (select count(*) from private.mutations where user_id=auth.uid() and created_at>now()-interval '1 minute')>=120 then raise exception 'LIMIT'; end if;
  select * into old from public.family_records where id=p_id for update;
  if found then
    if old.household_id<>p_household or old.kind<>p_kind or not private.can_read_record(old) then raise exception 'FORBIDDEN'; end if;
    if old.version<>p_version or old.deleted then raise exception 'CONFLICT'; end if;
    if old.kind='event' and old.created_by<>auth.uid() and caller not in ('owner','admin') then raise exception 'FORBIDDEN'; end if;
  elsif p_version<>0 or p_delete then raise exception 'CONFLICT';
  elsif (select count(*) from public.family_records where household_id=p_household and not deleted)>=5000 then raise exception 'LIMIT'; end if;
  if p_kind in ('child','category') and caller not in ('owner','admin') then raise exception 'FORBIDDEN'; end if;
  if p_delete and p_kind in ('child','category') and exists(select 1 from public.family_records where household_id=p_household and not deleted and kind='event' and payload->>(case p_kind when 'child' then 'childId' else 'categoryId' end)=p_id::text) then raise exception 'IN_USE'; end if;
  if not p_delete then perform private.validate_payload(p_household,p_kind,p_payload); end if;
  if old.kind='event' and not p_delete and (old.payload->>'start' is distinct from p_payload->>'start' or old.payload->'recurrence' is distinct from p_payload->'recurrence') and exists(select 1 from public.event_exceptions where event_id=p_id) then raise exception 'EXCEPTION_CONFLICT'; end if;
  insert into public.family_records(id,household_id,kind,payload,created_by,deleted) values(p_id,p_household,p_kind,p_payload,auth.uid(),p_delete)
  on conflict(id) do update set payload=excluded.payload,deleted=excluded.deleted,version=family_records.version+1,updated_at=now() returning * into saved;
  result:=to_jsonb(saved);
  insert into private.mutations values(auth.uid(),p_mutation,result,now());
  return result;
end $$;
create or replace function public.change_occurrence(p_household uuid,p_event uuid,p_version integer,p_index integer,p_original text,p_scope text,p_payload jsonb,p_delete boolean,p_mutation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.family_records; next_id uuid; saved jsonb; changed jsonb; exception public.event_exceptions; i integer; origin text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household::text,0));
  if private.household_role(p_household) is null then raise exception 'FORBIDDEN'; end if;
  select result into saved from private.mutations where user_id=auth.uid() and id=p_mutation;
  if found then return saved; end if;
  select * into old from public.family_records where id=p_event and household_id=p_household and kind='event' and not deleted for update;
  if not found or not private.can_read_record(old) or (old.created_by<>auth.uid() and private.household_role(p_household) not in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
  if old.version<>p_version then raise exception 'CONFLICT'; end if;
  if private.original_at(old.payload,p_index) is distinct from p_original then raise exception 'INVALID_OCCURRENCE'; end if;
  if p_version is null or p_index is null or p_original is null or p_scope is null or p_delete is null or p_mutation is null then raise exception 'INVALID_DATA'; end if;
  if p_scope not in ('one','following') then raise exception 'INVALID_SCOPE'; end if;
  if not p_delete then
    perform private.validate_payload(p_household,'event',p_payload);
    -- Une exception hérite toujours des droits, personnes et références de sa série.
    p_payload:=p_payload || jsonb_build_object('visibility',old.payload->'visibility','viewers',old.payload->'viewers','people',old.payload->'people','childId',old.payload->'childId','categoryId',old.payload->'categoryId','recurrence',null);
  end if;
  if p_scope='one' then
    if (select count(*) from public.event_exceptions where household_id=p_household)>=10000 then raise exception 'LIMIT'; end if;
    insert into public.event_exceptions(id,household_id,event_id,original_start,cancelled,payload)
    values(gen_random_uuid(),p_household,p_event,p_original,p_delete,case when p_delete then null else p_payload end)
    on conflict(event_id,original_start) do update set cancelled=excluded.cancelled,payload=excluded.payload,version=event_exceptions.version+1;
    update public.family_records set version=version+1,updated_at=now() where id=p_event;
  else
    if old.payload->'recurrence' is null or old.payload->'recurrence'='null'::jsonb then raise exception 'INVALID_SCOPE'; end if;
    if not p_delete then
      next_id:=gen_random_uuid();
      changed:=p_payload || jsonb_build_object('recurrence',old.payload->'recurrence');
      if old.payload->'recurrence'->>'count' is not null then changed:=jsonb_set(changed,'{recurrence,count}',to_jsonb((old.payload->'recurrence'->>'count')::integer-p_index)); end if;
      perform private.validate_payload(p_household,'event',changed);
      insert into public.family_records(id,household_id,kind,payload,created_by) values(next_id,p_household,'event',changed,auth.uid());
      -- Transfert des exceptions restantes selon leur index relatif, sans supprimer leurs déplacements.
      for exception in select * from public.event_exceptions where event_id=p_event and original_start>=p_original loop
        for i in p_index..9999 loop
          if private.original_at(old.payload,i)=exception.original_start then
            origin:=private.original_at(changed,i-p_index);
            if origin is null then raise exception 'EXCEPTION_CONFLICT'; end if;
            update public.event_exceptions set event_id=next_id,original_start=origin,version=version+1 where id=exception.id;
            exit;
          end if;
        end loop;
      end loop;
    else delete from public.event_exceptions where event_id=p_event and original_start>=p_original;
    end if;
    if p_index=0 then update public.family_records set deleted=true,version=version+1,updated_at=now() where id=p_event;
    else update public.family_records set payload=jsonb_set(payload,'{recurrence,count}',to_jsonb(p_index)),version=version+1,updated_at=now() where id=p_event;
    end if;
  end if;
  saved:=jsonb_build_object('id',coalesce(next_id,p_event));
  insert into private.mutations values(auth.uid(),p_mutation,saved,now());
  return saved;
end $$;
commit;


-- Migration : 202609260013_push_registration_status.sql
begin;
create function public.push_registered(p_endpoint text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint and enabled)
$$;
revoke all on function public.push_registered(text) from public,anon;
grant execute on function public.push_registered(text) to authenticated;
commit;

