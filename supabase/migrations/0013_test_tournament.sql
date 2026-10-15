-- Test tournaments: real rows that only admins see, to try features on prod without touching the players.
--   * tournaments.test hides the tournament from everyone but admins (admin_all). Rounds, players, matches,
--     results and entries follow the tournament's visibility, so they are hidden too.
--   * Season points skip test tournaments (the season views run as their owner, so they filter it themselves).
--   * admin_reset_test_tournament() deletes the test tournament and recreates a fresh "Shanghai (test)":
--     32 draw, registration open, R1 locks in 1 day, then a round every day, R1 matches drawn.

alter table tournaments add column test boolean not null default false;

drop policy tournaments_read on tournaments;
create policy tournaments_read on tournaments for select to anon, authenticated
  using (status <> 'draft' and not test);

-- Only admins can join a test tournament (others can't see it, but the RPC runs as owner).
create or replace function join_tournament(p_tournament_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_t tournaments;
  v_entry_id uuid;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  if not exists (select 1 from profiles where id = v_uid and deleted_at is null) then
    raise exception 'Choisissez un pseudo avant de rejoindre un tournoi';
  end if;

  select * into v_t from tournaments where id = p_tournament_id;
  if v_t.id is null or (v_t.test and not is_admin()) then raise exception 'Tournoi introuvable'; end if;
  if not (v_t.status = 'registration'
          or (v_t.status = 'live' and v_t.late_join
              and exists (select 1 from rounds where tournament_id = v_t.id and locks_at > now()))) then
    raise exception 'Les inscriptions sont fermées';
  end if;

  if exists (select 1 from entries where tournament_id = p_tournament_id and user_id = v_uid) then
    raise exception 'Vous êtes déjà inscrit à ce tournoi';
  end if;

  insert into entries (tournament_id, user_id) values (p_tournament_id, v_uid)
  returning id into v_entry_id;

  insert into pick_waivers (entry_id, round_id)
  select v_entry_id, r.id from rounds r where r.tournament_id = p_tournament_id and r.locks_at <= now();

  return v_entry_id;
end $$;

-- Same as 0010, minus test tournaments.
create or replace view season_entry_points with (security_invoker = false) as
with t as (
  select id, name, status, starts_at, extract(year from starts_at at time zone 'UTC')::int as season
  from tournaments
  where status in ('live', 'finished') and starts_at is not null and not test
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

-- Wipe the test tournament(s) and start a fresh one. Returns the new tournament id.
create function admin_reset_test_tournament() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_t uuid;
  v_start timestamptz := date_trunc('hour', now()) + interval '1 day';
begin
  if not is_admin() then raise exception 'Réservé à l''administrateur'; end if;

  delete from tournaments where test;  -- cascades to rounds, players, matches, results, entries, picks

  insert into tournaments (name, tour, draw_size, status, starts_at, theme, test)
  values ('Shanghai (test)', 'ATP', 32, 'registration', v_start, 'shanghai', true)
  returning id into v_t;

  -- Locks pinned (manual): the test has no API draw to align them on.
  insert into rounds (tournament_id, idx, name, locks_at, locks_at_manual)
  select v_t, v.idx, v.name, v_start + (v.idx - 1) * interval '1 day', true
  from (values (1, '1er tour'), (2, '8es de finale'), (3, 'Quarts'), (4, 'Demies'), (5, 'Finale')) as v(idx, name);

  -- Draw order: line 2s-1 plays line 2s in slot s. Seeds 1/2 at the ends, 3/4 in the middle, 5-8 in quarters.
  drop table if exists test_draw;
  create temp table test_draw on commit drop as
  select * from (values
    (1, 'Jannik Sinner', 1, 'ITA', 1), (2, 'Alexei Popyrin', null, 'AUS', 30),
    (3, 'Tomas Machac', null, 'CZE', 24), (4, 'Arthur Fils', null, 'FRA', 14),
    (5, 'Ugo Humbert', null, 'FRA', 19), (6, 'Grigor Dimitrov', null, 'BUL', 22),
    (7, 'Alexander Bublik', null, 'KAZ', 26), (8, 'Lorenzo Musetti', 8, 'ITA', 8),
    (9, 'Jack Draper', 6, 'GBR', 6), (10, 'Tallon Griekspoor', null, 'NED', 29),
    (11, 'Jiri Lehecka', null, 'CZE', 20), (12, 'Frances Tiafoe', null, 'USA', 17),
    (13, 'Francisco Cerundolo', null, 'ARG', 21), (14, 'Holger Rune', null, 'DEN', 11),
    (15, 'Joao Fonseca', null, 'BRA', 27), (16, 'Novak Djokovic', 4, 'SRB', 4),
    (17, 'Alexander Zverev', 3, 'GER', 3), (18, 'Hubert Hurkacz', null, 'POL', 28),
    (19, 'Karen Khachanov', null, 'RUS', 23), (20, 'Casper Ruud', null, 'NOR', 12),
    (21, 'Andrey Rublev', null, 'RUS', 16), (22, 'Giovanni Mpetshi Perricard', null, 'FRA', 31),
    (23, 'Alejandro Davidovich Fokina', null, 'ESP', 32), (24, 'Taylor Fritz', 5, 'USA', 5),
    (25, 'Ben Shelton', 7, 'USA', 7), (26, 'Jakub Mensik', null, 'CZE', 18),
    (27, 'Stefanos Tsitsipas', null, 'GRE', 25), (28, 'Alex de Minaur', null, 'AUS', 9),
    (29, 'Tommy Paul', null, 'USA', 13), (30, 'Felix Auger-Aliassime', null, 'CAN', 10),
    (31, 'Daniil Medvedev', null, 'RUS', 15), (32, 'Carlos Alcaraz', 2, 'ESP', 2)
  ) as v(line, name, seed, country, ranking);

  insert into players (tournament_id, name, seed, country, ranking)
  select v_t, name, seed, country, ranking from test_draw order by line;

  -- R1 matches, 30 min apart from the lock.
  insert into matches (tournament_id, round_id, external_id, player1_id, player2_id, scheduled_at, position)
  select v_t, r.id, 'test-' || s, p1.id, p2.id, v_start + (s - 1) * interval '30 minutes', s
  from rounds r
  cross join generate_series(1, 16) s
  join test_draw d1 on d1.line = 2 * s - 1
  join test_draw d2 on d2.line = 2 * s
  join players p1 on p1.tournament_id = v_t and p1.name = d1.name
  join players p2 on p2.tournament_id = v_t and p2.name = d2.name
  where r.tournament_id = v_t and r.idx = 1;

  insert into admin_log (admin_id, action, payload)
  values (auth.uid(), 'admin_reset_test_tournament', jsonb_build_object('id', v_t));

  return v_t;
end $$;

revoke execute on function admin_reset_test_tournament() from public, anon;
grant execute on function admin_reset_test_tournament() to authenticated;
