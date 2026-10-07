-- Late sign-ups (admin toggle): while the tournament is live and a round is still open, people who did not sign up
-- can join. The rounds already locked when they join are waived for them (pick_waivers, admin_id null = automatic).

alter table tournaments add column late_join boolean not null default false;

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
  if v_t.id is null then raise exception 'Tournoi introuvable'; end if;
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
