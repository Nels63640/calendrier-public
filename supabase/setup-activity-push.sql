-- À exécuter après la migration 202609260007 et le déploiement de reminders.
-- Le même REMINDER_CRON_SECRET doit être configuré dans Vault et dans la fonction.
create extension if not exists pg_net with schema extensions;
create or replace function private.wake_activity_worker() returns trigger
language plpgsql security definer set search_path='' as $$
declare token text; transaction_key text:=txid_current()::text;
begin
 if current_setting('family.activity_wakeup',true)=transaction_key then return null; end if;
 if not exists(select 1 from private.activity_jobs where transaction_id=txid_current() and state='pending') then return null; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='REMINDER_CRON_SECRET' limit 1;
 if token is null then return null; end if;
 perform net.http_post(
   url:='https://xyfjpeojctmncpfymiyr.supabase.co/functions/v1/reminders',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
   body:='{}'::jsonb,timeout_milliseconds:=60000
 );
 perform set_config('family.activity_wakeup',transaction_key,true);
 return null;
exception when others then
 -- La sauvegarde doit réussir même si le réveil HTTP échoue. Le cron reprend la file.
 return null;
end $$;
revoke all on function private.wake_activity_worker() from public;
drop trigger if exists wake_activity_worker on private.activity_jobs;
create trigger wake_activity_worker after insert on private.activity_jobs for each statement execute function private.wake_activity_worker();
