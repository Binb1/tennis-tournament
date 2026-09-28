-- Sync results every hour (24 API calls/day, the free quota is 50), only while a tournament is live (saves the 50 calls/day API quota).
-- The cron secret is read from Vault (name 'cron_secret'); it must equal the Edge Function secret CRON_SECRET.
-- Create it once in the SQL editor: select vault.create_secret('<CRON_SECRET>', 'cron_secret');
select cron.schedule(
  'sync-results',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://ofwcmfjpzxsjyklslxxj.supabase.co/functions/v1/sync-results',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) where exists (select 1 from public.tournaments where status = 'live' and external_id is not null);
  $$
);
