-- The hourly cron also wakes sync-results while a tournament starting within 60 days has no Tennis API id yet, so the
-- calendar matching (sync-results fillExternalIds) can find it. The function reads the calendar once a day at most;
-- the other wake-ups cost no API call. Same job as 0007 otherwise.
select cron.unschedule('sync-results');
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
  ) where exists (
    select 1 from public.tournaments
    where external_id is not null
      and (status = 'live' or (status = 'registration' and starts_at <= now() + interval '3 days'))
  ) or exists (
    select 1 from public.tournaments
    where external_id is null and status = 'registration' and tour = 'ATP' and not test
      and starts_at <= now() + interval '60 days'
  );
  $$
);
