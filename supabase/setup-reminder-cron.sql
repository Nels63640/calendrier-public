-- Après déploiement de la fonction reminders et configuration de ses secrets.
-- La fonction lit sa configuration dans Vault via worker_push_config.
-- Ne jamais copier la valeur du secret dans un fichier versionné.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='REMINDER_CRON_SECRET') then
    raise exception 'Créer REMINDER_CRON_SECRET dans Vault avant de planifier les rappels';
  end if;
  if exists(select 1 from cron.job where jobname='family-reminders') then perform cron.unschedule('family-reminders'); end if;
end $$;
select cron.schedule('family-reminders','* * * * *',$$
  select net.http_post(
    url:='https://xyfjpeojctmncpfymiyr.supabase.co/functions/v1/reminders',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='REMINDER_CRON_SECRET' limit 1)),
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);
