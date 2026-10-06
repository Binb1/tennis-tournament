-- Automation: tournament status follows the calendar, draws import themselves, API calls fit the daily quota.

-- ============ API call budget: every run records what it spent ============
alter table sync_runs
  add column kind text not null default 'results' check (kind in ('results', 'draw')),
  add column api_calls int not null default 0;

-- ============ Status: registration -> live at the first lock, live -> finished once the final is won ============
-- Called by the sync-results Edge Function at the start and the end of every run.
create function advance_tournaments() returns void
language sql
set search_path = public
as $$
  update tournaments t set status = 'live'
  where t.status = 'registration'
    and exists (select 1 from rounds r where r.tournament_id = t.id and r.idx = 1 and r.locks_at <= now());

  update tournaments t set status = 'finished'
  where t.status = 'live'
    and exists (
      select 1 from player_results pr join rounds r on r.id = pr.round_id
      where r.tournament_id = t.id and pr.result = 'won'
        and r.idx = (select max(idx) from rounds where tournament_id = t.id)
    );
$$;

revoke execute on function advance_tournaments() from public, anon, authenticated;

-- ============ Cron: also wake up while a draw may need importing (first lock within 3 days) ============
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
  );
  $$
);
