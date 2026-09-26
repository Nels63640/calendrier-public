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
