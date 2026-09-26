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
