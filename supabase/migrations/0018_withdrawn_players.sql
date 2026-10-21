-- Withdrawn players: imported with the main draw, then replaced (lucky loser) before playing. They stay in players but
-- are in no match and never get a 'lost' result, so they could be picked and a pick on them never resolved.
--   * Once the tournament's draw is out (any match), a player in none of its matches is out before round 1 (lost at 0).
--   * entry_status: a pick on him is lost as soon as its round locks.
--   * make_pick refuses him.

-- Same as 0011, plus the withdrawn players in lost_at.
create or replace view entry_status with (security_invoker = false) as
with lost_at as (
  select player_id, min(idx) as idx
  from (
    select pr.player_id, r.idx
    from player_results pr join rounds r on r.id = pr.round_id
    where pr.result = 'lost'
    union all
    select p.id, 0
    from players p
    where exists (select 1 from matches m where m.tournament_id = p.tournament_id)
      and not exists (select 1 from matches m where p.id in (m.player1_id, m.player2_id))
  ) x
  group by player_id
),
steps as (
  select e.id as entry_id, r.idx, p.player_id,
         case when la.idx < r.idx then 'lost'::match_result else pr.result end as result,
         w.entry_id is not null as waived
  from entries e
  join rounds r on r.tournament_id = e.tournament_id and r.locks_at <= now()
  left join picks p on p.entry_id = e.id and p.round_id = r.id
  left join player_results pr on pr.player_id = p.player_id and pr.round_id = r.id
  left join lost_at la on la.player_id = p.player_id
  left join pick_waivers w on w.entry_id = e.id and w.round_id = r.id
),
elim as (
  select entry_id,
         min(idx) filter (where (player_id is null and not waived) or result = 'lost') as eliminated_round
  from steps
  group by entry_id
)
select
  e.id as entry_id,
  e.tournament_id,
  e.user_id,
  el.eliminated_round is null as alive,
  el.eliminated_round,
  (select count(*) from steps s
    where s.entry_id = e.id and s.result = 'won'
      and (el.eliminated_round is null or s.idx < el.eliminated_round))::int as rounds_survived
from entries e
left join elim el on el.entry_id = e.id;

-- Same as 0016, plus: not in the published draw.
create or replace function make_pick(p_round_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds%rowtype;
  v_status tournament_status;
  v_entry_id uuid;
  v_first int;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;

  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'Tour introuvable'; end if;
  select status into v_status from tournaments where id = v_round.tournament_id;

  if v_status not in ('registration', 'live') then
    raise exception 'Les choix ne sont pas ouverts pour ce tournoi';
  end if;
  if now() >= v_round.locks_at then
    raise exception 'Ce tour est verrouillé';
  end if;

  select id into v_entry_id from entries
  where tournament_id = v_round.tournament_id and user_id = v_uid;
  if v_entry_id is null then raise exception 'Vous n''êtes pas inscrit à ce tournoi'; end if;

  if not (select alive from entry_status where entry_id = v_entry_id) then
    raise exception 'Vous êtes éliminé de ce tournoi';
  end if;

  if not exists (select 1 from players where id = p_player_id and tournament_id = v_round.tournament_id) then
    raise exception 'Ce joueur ne fait pas partie de ce tournoi';
  end if;
  if exists (select 1 from player_results where player_id = p_player_id and result = 'lost') then
    raise exception 'Ce joueur est déjà éliminé';
  end if;
  if exists (select 1 from matches where tournament_id = v_round.tournament_id)
     and not exists (select 1 from matches m where p_player_id in (m.player1_id, m.player2_id)) then
    raise exception 'Ce joueur a déclaré forfait : il n''est pas dans le tableau';
  end if;

  -- Bye in this round, or first match in a later round: nothing to win here.
  select min(r.idx) into v_first
  from matches m join rounds r on r.id = m.round_id
  where m.tournament_id = v_round.tournament_id and p_player_id in (m.player1_id, m.player2_id)
    and lower(coalesce(m.score, '')) <> 'bye';
  if exists (select 1 from matches m
             where m.round_id = p_round_id and p_player_id in (m.player1_id, m.player2_id)
               and lower(m.score) = 'bye')
     or v_first > v_round.idx then
    raise exception 'Ce joueur est exempté de ce tour : il ne joue pas de match';
  end if;

  if exists (select 1 from picks where entry_id = v_entry_id
             and player_id = p_player_id and round_id <> p_round_id) then
    raise exception 'Ce joueur a déjà été choisi';
  end if;

  insert into picks (entry_id, round_id, player_id) values (v_entry_id, p_round_id, p_player_id)
  on conflict (entry_id, round_id)
  do update set player_id = excluded.player_id, updated_at = now();
end $$;
