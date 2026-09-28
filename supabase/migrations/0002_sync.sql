-- Tennis Survivor Pool — M4: results sync from the tennis API (see specs.md "Results source & API sync").

-- ============ Extensions (cron + HTTP calls from the database) ============
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ============ Sync log: one row per tournament per run ============
create table sync_runs (
  id bigint generated always as identity primary key,
  tournament_id uuid references tournaments (id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null,
  matches int not null default 0,     -- matches returned by the API
  updated int not null default 0,     -- player_results rows written
  error text,
  unmatched jsonb not null default '[]'  -- array of player names not found in players
);

create index on sync_runs (tournament_id, at desc);

-- Admin read only. Only the Edge Function (service role, bypasses RLS) writes.
alter table sync_runs enable row level security;
create policy sync_runs_admin_read on sync_runs for select to authenticated using (is_admin());
revoke insert, update, delete on sync_runs from anon, authenticated;

-- ============ Cron job (run by hand once, NOT part of this migration) ============
-- Replace <PROJECT_URL> (https://xxxx.supabase.co) and <SECRET> (= Edge Function secret CRON_SECRET).
-- The function does nothing when no tournament is live, so it can run all year.
--
-- select cron.schedule(
--   'sync-results',
--   '*/30 * * * *',
--   $$
--   select net.http_post(
--     url := '<PROJECT_URL>/functions/v1/sync-results',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<SECRET>'),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- To remove it: select cron.unschedule('sync-results');
