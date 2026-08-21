CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Invoke the scheduled sync every 15 minutes. The function itself honors each
-- tenant/provider interval, so hourly remains the default without requiring a
-- separate cron job per tenant.
SELECT cron.schedule(
  'aegis-provider-sync-dispatch',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_functions_url', true) || '/scheduled-provider-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.scheduled_sync_secret', true)
    ),
    body := '{}'::jsonb
  );$$
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'aegis-provider-sync-dispatch'
);
