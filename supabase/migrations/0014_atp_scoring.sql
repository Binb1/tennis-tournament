-- ATP-style season points: a tournament's weight follows its category, a round's weight grows toward the final.
--   * tournaments.category: 250 / 500 / Masters 1000 / Grand Slam -> multiplier x2 / x3 / x5 / x8.
--   * A round won is worth round_weight(rounds left after it) x multiplier: final 10, semis 7, quarters 5,
--     8es 3, 16es 2, earlier 1. Counted from the end, so a quarter is worth the same in a 32 and a 128 draw.
--   * Pool winner (last survivor, as in 0010): +10 x multiplier.
--   * Champion prediction (champion_picks): "who wins the title?", until round 1 locks; independent of the survivor
--     game (still counts once eliminated). Right: +10 x multiplier, as soon as the final's winner is known.
--   * Every tournament counts, concurrent ones included (src/lib/scoring.ts mirrors these numbers).

-- ============ Category ============
create type tournament_category as enum ('atp250', 'atp500', 'masters1000', 'grand_slam');
alter table tournaments add column category tournament_category not null default 'atp250';

-- Existing tournaments: from their style (theme groups in src/lib/theme.ts); the admin fixes the rest.
update tournaments set category = 'grand_slam' where theme in ('clay', 'usopen', 'ao', 'wimbledon');
update tournaments set category = 'masters1000'
where theme in ('indianwells', 'miami', 'montecarlo', 'madrid', 'rome', 'canada', 'cincinnati', 'shanghai', 'paris');

create function category_multiplier(c tournament_category) returns int
language sql immutable as $$
  select case c when 'grand_slam' then 8 when 'masters1000' then 5 when 'atp500' then 3 else 2 end;
$$;

-- p_left: rounds still to play after this one (0 = the final).
create function round_weight(p_left int) returns int
language sql immutable as $$
  select case p_left when 0 then 10 when 1 then 7 when 2 then 5 when 3 then 3 when 4 then 2 else 1 end;
$$;

-- ============ Champion prediction ============
create table champion_picks (
  entry_id uuid primary key references entries (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table champion_picks enable row level security;

-- Own always, others once round 1 is locked (like picks), admin always.
create policy champion_picks_read on champion_picks for select to anon, authenticated
  using (
    exists (select 1 from entries e where e.id = entry_id and e.user_id = (select auth.uid()))
    or exists (select 1 from entries e join rounds r on r.tournament_id = e.tournament_id
               where e.id = entry_id and r.idx = 1 and r.locks_at <= now())
  );
create policy admin_all on champion_picks for all to authenticated using (is_admin()) with check (is_admin());

-- Set (or with p_player_id null, remove) my prediction. Open until round 1 locks.
create function set_champion_pick(p_tournament_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_status tournament_status;
  v_entry_id uuid;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;

  select status into v_status from tournaments where id = p_tournament_id;
  if v_status is null or v_status not in ('registration', 'live') then
    raise exception 'Les pronostics ne sont pas ouverts pour ce tournoi';
  end if;
  if exists (select 1 from rounds where tournament_id = p_tournament_id and idx = 1 and locks_at <= now()) then
    raise exception 'Le pronostic du vainqueur est fermé depuis le 1er tour';
  end if;

  select id into v_entry_id from entries where tournament_id = p_tournament_id and user_id = v_uid;
  if v_entry_id is null then raise exception 'Vous n''êtes pas inscrit à ce tournoi'; end if;

  if p_player_id is null then
    delete from champion_picks where entry_id = v_entry_id;
    return;
  end if;
  if not exists (select 1 from players where id = p_player_id and tournament_id = p_tournament_id) then
    raise exception 'Ce joueur ne fait pas partie de ce tournoi';
  end if;

  insert into champion_picks (entry_id, player_id) values (v_entry_id, p_player_id)
  on conflict (entry_id) do update set player_id = excluded.player_id, updated_at = now();
end $$;

revoke execute on function set_champion_pick(uuid, uuid) from public, anon;
grant execute on function set_champion_pick(uuid, uuid) to authenticated;

-- ============ Season views ============
drop view season_standings;
drop view season_entry_points;

-- One row per entry: the profile page's per-tournament breakdown. Same rules as 0013 for what counts.
create view season_entry_points with (security_invoker = false) as
with t as (
  select id, name, status, starts_at, category, category_multiplier(category) as mult,
         extract(year from starts_at at time zone 'UTC')::int as season
  from tournaments
  where status in ('live', 'finished') and starts_at is not null and not test
),
last_round as (
  select tournament_id, max(idx) as idx from rounds group by tournament_id
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
  count(*)::int as tournaments_played,
  sum(sp.round_points)::int as round_points,
  sum(sp.winner_bonus)::int as winner_bonus,
  sum(sp.champion_bonus)::int as champion_bonus,
  count(*) filter (where sp.champion_correct)::int as champions_predicted
from season_entry_points sp
join profiles pr on pr.id = sp.user_id
group by sp.season, sp.user_id, pr.username, pr.deleted_at;

grant select on season_entry_points, season_standings to anon, authenticated;
