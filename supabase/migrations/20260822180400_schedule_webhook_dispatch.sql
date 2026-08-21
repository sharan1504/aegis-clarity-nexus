-- The Edge Function URL and dispatch secret are stored in Supabase Vault.
-- This job never participates in the triggering transaction, so webhook failures
-- cannot block change/approval/audit operations.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'aegis-webhook-dispatch',
  '* * * * *',
  $$select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'aegis_webhook_dispatch_url' limit 1),
    headers := jsonb_build_object(
      'content-type','application/json',
      'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aegis_webhook_dispatch_secret' limit 1)
    ),
    body := '{}'::jsonb
  )$$
);
