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
