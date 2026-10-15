-- Queued picks: from registration on, an entry can pick for every round still open (R1 to the final) instead of
-- only the current one. Same game: one player per round, no repeats, a lost pick eliminates.
--   * A pick stays editable until its own round locks; others only see it once that round locks (picks_read).
--   * A queued player who loses before his round counts as a loss there (entry_status, 0011), so the UI warns.
--   * clear_pick frees a player queued in a later round, to use him earlier.

create or replace function make_pick(p_round_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds%rowtype;
  v_status tournament_status;
  v_entry_id uuid;
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
  if exists (select 1 from picks where entry_id = v_entry_id
             and player_id = p_player_id and round_id <> p_round_id) then
    raise exception 'Ce joueur a déjà été choisi';
  end if;

  insert into picks (entry_id, round_id, player_id) values (v_entry_id, p_round_id, p_player_id)
  on conflict (entry_id, round_id)
  do update set player_id = excluded.player_id, updated_at = now();
end $$;

-- Remove my pick for a round that is still open.
create function clear_pick(p_round_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_round rounds%rowtype;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;

  select * into v_round from rounds where id = p_round_id;
  if not found then raise exception 'Tour introuvable'; end if;
  if now() >= v_round.locks_at then
    raise exception 'Ce tour est verrouillé';
  end if;

  delete from picks p
  using entries e
  where p.entry_id = e.id and e.user_id = v_uid and e.tournament_id = v_round.tournament_id
    and p.round_id = p_round_id;
end $$;

revoke execute on function clear_pick(uuid) from public, anon;
grant execute on function clear_pick(uuid) to authenticated;
