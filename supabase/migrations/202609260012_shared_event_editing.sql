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
