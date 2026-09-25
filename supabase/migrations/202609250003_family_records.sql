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
