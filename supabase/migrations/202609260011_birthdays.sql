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
