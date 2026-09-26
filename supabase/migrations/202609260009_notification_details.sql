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
