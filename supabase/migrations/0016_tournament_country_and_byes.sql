-- Feedback round: a flag next to each tournament's name, and no pick on a player who has a bye.
--   * tournaments.country: 3-letter code like players.country (FRA, SUI…), flag shown next to the name. Existing
--     tournaments filled from their name (src/lib/flags.ts suggestCountry has the same list for the admin).
--   * make_pick: a player with a bye in a round (the draws list it as a done match with score "bye", the other side
--     empty) or who only enters the draw later has no match to win in that round. Such a pick counted as a free win.

-- ============ Country ============
alter table tournaments add column country text check (country ~ '^[A-Z]{3}$');

update tournaments set country = case
  when name ~* 'roland|french open|paris|bercy|lyon|auvergne|marseille|montpellier|metz|moselle' then 'FRA'
  when name ~* 'us open|cincinnati|indian wells|miami|washington|atlanta|winston|delray|dallas|houston|newport' then 'USA'
  when name ~* 'shanghai|china|beijing|chengdu|hangzhou|zhuhai' then 'CHN'
  when name ~* 'almaty|astana' then 'KAZ'
  when name ~* 'european open|antwerp' then 'BEL'
  when name ~* 'erste|vienna|wien|kitzb' then 'AUT'
  when name ~* 'basel|swiss|gstaad|geneva' then 'SUI'
  when name ~* 'australi|adelaide|brisbane' then 'AUS'
  when name ~* 'wimbledon|queen|eastbourne' then 'GBR'
  when name ~* 'monte[ -]?carlo|monaco' then 'MON'
  when name ~* 'madrid|barcelona|mallorca' then 'ESP'
  when name ~* '\mrome\M|\mroma\M|internazionali|italian|turin|torino|atp finals' then 'ITA'
  when name ~* 'canad|montr[eé]al|toronto|national bank' then 'CAN'
end
where country is null;

-- ============ make_pick: no bye ============
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
