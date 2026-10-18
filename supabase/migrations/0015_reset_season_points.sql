-- Season points reset: everyone back to 0, play goes on.
--   * season_resets: one row per reset. The views count from the latest one.
--   * A round earns points only if it locks after the reset. Pool winner and champion bonuses only for a final that
--     locks after it. Tournaments whose final locked before the reset drop out of the season (not "played" either).
--   * Live tournaments keep scoring from their next lock. To reset again: insert into season_resets default values.

create table season_resets (
  at timestamptz primary key default now()
);
alter table season_resets enable row level security;
create policy season_resets_read on season_resets for select to anon, authenticated using (true);
create policy admin_all on season_resets for all to authenticated using (is_admin()) with check (is_admin());

insert into season_resets default values;

-- Same as 0014, from the last reset on: tournaments whose final is still to lock, rounds locked after the reset.
create or replace view season_entry_points with (security_invoker = false) as
with reset as (
  select coalesce(max(at), '-infinity'::timestamptz) as at from season_resets
),
last_round as (
  select distinct on (tournament_id) tournament_id, idx, locks_at from rounds order by tournament_id, idx desc
),
-- A tournament whose final locked before the reset is over for this count (its pool and title bonuses too).
t as (
  select id, name, status, starts_at, category, category_multiplier(category) as mult,
         extract(year from starts_at at time zone 'UTC')::int as season
  from tournaments
  where status in ('live', 'finished') and starts_at is not null and not test
    and exists (select 1 from last_round l, reset where l.tournament_id = tournaments.id and l.locks_at > reset.at)
),
-- The title winner: the player who won the last round.
champion as (
  select r.tournament_id, pr.player_id
  from rounds r
  join last_round l on l.tournament_id = r.tournament_id and l.idx = r.idx
  join player_results pr on pr.round_id = r.id and pr.result = 'won'
),
won as (
  select s.entry_id, count(*)::int as n, sum(round_weight(l.idx - r.idx))::int as weight
  from entry_status s
  join picks p on p.entry_id = s.entry_id
  join rounds r on r.id = p.round_id and r.locks_at <= now()
  join reset on r.locks_at > reset.at
  join last_round l on l.tournament_id = r.tournament_id
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
),
scored as (
  select
    t.season,
    e.id as entry_id,
    e.user_id,
    t.id as tournament_id,
    t.name as tournament_name,
    t.status as tournament_status,
    t.starts_at,
    t.category,
    t.mult,
    s.alive,
    s.eliminated_round,
    coalesce(w.n, 0) as rounds_won,
    coalesce(w.weight, 0) * t.mult as round_points,
    coalesce((f.any_alive and f.alive) or (not f.any_alive and f.best > 0 and f.rounds_survived = f.best), false)
      as won_tournament,
    cp.player_id as champion_pick_id,
    ch.player_id is not null and ch.player_id = cp.player_id as champion_correct
  from entries e
  join t on t.id = e.tournament_id
  join entry_status s on s.entry_id = e.id
  left join won w on w.entry_id = e.id
  left join fin f on f.entry_id = e.id
  left join champion_picks cp on cp.entry_id = e.id
           and exists (select 1 from rounds r where r.tournament_id = t.id and r.idx = 1 and r.locks_at <= now())
  left join champion ch on ch.tournament_id = t.id
  where e.user_id is not null
)
select
  season, entry_id, user_id, tournament_id, tournament_name, tournament_status, starts_at, category,
  alive, eliminated_round, rounds_won, won_tournament, champion_pick_id, champion_correct,
  round_points::int,
  (case when won_tournament then 10 * mult else 0 end)::int as winner_bonus,
  (case when champion_correct then 10 * mult else 0 end)::int as champion_bonus,
  (round_points + case when won_tournament then 10 * mult else 0 end
                + case when champion_correct then 10 * mult else 0 end)::int as points
from scored;

-- Unchanged from 0014: re-created so it reads the new season_entry_points.
create or replace view season_standings with (security_invoker = false) as
select
  sp.season,
  sp.user_id,
  pr.username,
  pr.deleted_at,
  sum(sp.points)::int as points,
  sum(sp.rounds_won)::int as rounds_won,
  count(*) filter (where sp.won_tournament)::int as tournaments_won,
  count(*)::int as tournaments_played,
  sum(sp.round_points)::int as round_points,
  sum(sp.winner_bonus)::int as winner_bonus,
  sum(sp.champion_bonus)::int as champion_bonus,
  count(*) filter (where sp.champion_correct)::int as champions_predicted
from season_entry_points sp
join profiles pr on pr.id = sp.user_id
group by sp.season, sp.user_id, pr.username, pr.deleted_at;

grant select on season_entry_points, season_standings to anon, authenticated;
