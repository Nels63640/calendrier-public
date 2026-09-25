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
