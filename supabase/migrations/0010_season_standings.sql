-- Season ranking (calendar year of the tournament's start).
-- 10 points per round won with a real pick (waived rounds score nothing), +50 per tournament won.
-- Winners as in the app (fetchWinners): alive after the final; if nobody is, the entries with the most rounds
-- survived are co-winners, but only if they survived at least one round.
-- Counts live and finished tournaments; only locked rounds, so nothing leaks before a lock.
-- Both views run as their owner (like entry_status) to read everyone's picks; they only expose totals.

-- One row per entry: the profile page's per-tournament breakdown.
create view season_entry_points with (security_invoker = false) as
with t as (
  select id, name, status, starts_at, extract(year from starts_at at time zone 'UTC')::int as season
  from tournaments
  where status in ('live', 'finished') and starts_at is not null
),
won as (
  select s.entry_id, count(*)::int as n
  from entry_status s
  join picks p on p.entry_id = s.entry_id
  join rounds r on r.id = p.round_id and r.locks_at <= now()
  join player_results pr on pr.player_id = p.player_id and pr.round_id = r.id and pr.result = 'won'
  where s.eliminated_round is null or r.idx < s.eliminated_round
  group by s.entry_id
),
fin as (
  select s.entry_id, s.alive, s.rounds_survived,
         bool_or(s.alive) over (partition by s.tournament_id) as any_alive,
         max(s.rounds_survived) over (partition by s.tournament_id) as best
  from entry_status s join t on t.id = s.tournament_id
  where t.status = 'finished'
)
select
  t.season,
  e.id as entry_id,
  e.user_id,
  t.id as tournament_id,
  t.name as tournament_name,
  t.status as tournament_status,
  t.starts_at,
  s.alive,
  s.eliminated_round,
  coalesce(w.n, 0) as rounds_won,
  coalesce((f.any_alive and f.alive) or (not f.any_alive and f.best > 0 and f.rounds_survived = f.best), false)
    as won_tournament,
  (10 * coalesce(w.n, 0)
   + case when coalesce((f.any_alive and f.alive) or (not f.any_alive and f.best > 0 and f.rounds_survived = f.best), false)
          then 50 else 0 end)::int as points
from entries e
join t on t.id = e.tournament_id
join entry_status s on s.entry_id = e.id
left join won w on w.entry_id = e.id
left join fin f on f.entry_id = e.id
where e.user_id is not null;

-- One row per user per season: the ranking.
create view season_standings with (security_invoker = false) as
select
  sp.season,
  sp.user_id,
  pr.username,
  pr.deleted_at,
  sum(sp.points)::int as points,
  sum(sp.rounds_won)::int as rounds_won,
  count(*) filter (where sp.won_tournament)::int as tournaments_won,
  count(*)::int as tournaments_played
from season_entry_points sp
join profiles pr on pr.id = sp.user_id
group by sp.season, sp.user_id, pr.username, pr.deleted_at;

grant select on season_entry_points, season_standings to anon, authenticated;
