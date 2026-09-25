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
