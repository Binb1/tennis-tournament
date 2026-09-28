-- Tennis Survivor Pool — M1 schema (see specs.md).
-- Survival is never stored: it is derived from picks + player_results (view entry_status).
--
-- Decided rules (no SQL needed beyond entry_status):
--   * Winners are computed by the frontend: entries alive after the final; if none are alive,
--     the entries with the max rounds_survived are co-winners (all eliminated in the same round).
--   * Rain delay: the admin moves rounds.locks_at by hand. Players whose previous result is still
--     pending remain pickable (only a 'lost' result makes a player unpickable).
--   * No pick at lock (incl. no pickable player left) = out at that round.

-- ============ Enums ============
create type tournament_status as enum ('draft', 'registration', 'live', 'finished');
create type tour as enum ('ATP', 'WTA');
create type match_result as enum ('won', 'lost');
create type result_status as enum ('scheduled', 'live', 'done');
create type result_source as enum ('manual', 'api');

-- ============ Tables ============
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 30),
  is_admin boolean not null default false,
  deleted_at timestamptz,           -- set by delete_my_account(): show as "deleted user"
  created_at timestamptz not null default now()
);

-- Personal data, owner-only.
create table profiles_private (
  id uuid primary key references profiles (id) on delete cascade,
  email text,
  ranking text,
  region text,
  city text,
  country text not null default 'France'
);

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tour tour not null,
  draw_size int not null check (draw_size > 1),
  status tournament_status not null default 'draft',
  starts_at timestamptz,
  external_id text,
  created_at timestamptz not null default now()
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  idx int not null check (idx > 0),
  name text not null,
  locks_at timestamptz not null,
  unique (tournament_id, idx)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  name text not null,
  seed int,
  external_id text,
  unique (tournament_id, name)
);

create table player_results (
  player_id uuid not null references players (id) on delete cascade,
  round_id uuid not null references rounds (id) on delete cascade,
  result match_result,              -- null = not decided yet (status scheduled/live)
  status result_status not null default 'done',
  source result_source not null default 'manual',
  updated_at timestamptz not null default now(),
  primary key (player_id, round_id)
);

create table entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  user_id uuid references profiles (id) on delete set null,  -- deleted user keeps the entry
  joined_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table picks (
  entry_id uuid not null references entries (id) on delete cascade,
  round_id uuid not null references rounds (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (entry_id, round_id),
  unique (entry_id, player_id)      -- no repeats (backup of make_pick check)
);

create table admin_log (
  id bigint generated always as identity primary key,
  admin_id uuid references profiles (id) on delete set null,
  action text not null,
  payload jsonb,
  at timestamptz not null default now()
);

create index on rounds (tournament_id);
create index on players (tournament_id);
create index on player_results (round_id);
create index on entries (user_id);
create index on picks (round_id);
create index on picks (player_id);

-- ============ Helpers ============
create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;

-- Per player: rounds won, deepest round with a result, whether/when he lost.
-- Only reads public tables, so it runs with the caller's rights.
create view player_status with (security_invoker = true) as
select
  p.id as player_id,
  p.tournament_id,
  count(*) filter (where pr.result = 'won')::int as rounds_won,
  max(r.idx) filter (where pr.result is not null) as last_round,
  coalesce(bool_or(pr.result = 'lost'), false) as lost,
  min(r.idx) filter (where pr.result = 'lost') as lost_round
from players p
left join player_results pr on pr.player_id = p.id
left join rounds r on r.id = pr.round_id
group by p.id, p.tournament_id;

-- One row per entry. Walks the LOCKED rounds only (locks_at <= now()):
-- pick missing or lost -> out at that round; won -> survived; no result yet -> pending (still alive).
-- Runs as the view owner (security_invoker = false) so it can see everyone's picks despite RLS.
-- Safe: it only reads picks of locked rounds, which are public anyway, so nothing leaks before lock.
create view entry_status with (security_invoker = false) as
with steps as (
  select e.id as entry_id, r.idx, p.player_id, pr.result
  from entries e
  join rounds r on r.tournament_id = e.tournament_id and r.locks_at <= now()
  left join picks p on p.entry_id = e.id and p.round_id = r.id
  left join player_results pr on pr.player_id = p.player_id and pr.round_id = r.id
),
elim as (
  select entry_id,
         min(idx) filter (where player_id is null or result = 'lost') as eliminated_round
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

grant select on player_status, entry_status to anon, authenticated;

-- ============ RLS ============
alter table profiles enable row level security;
alter table profiles_private enable row level security;
alter table tournaments enable row level security;
alter table rounds enable row level security;
alter table players enable row level security;
alter table player_results enable row level security;
alter table entries enable row level security;
alter table picks enable row level security;
alter table admin_log enable row level security;

-- profiles: public read; user creates/renames own row. is_admin and deleted_at are protected by
-- column grants below (users can only write id + username).
create policy profiles_read on profiles for select to anon, authenticated using (true);
create policy profiles_insert_own on profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_own on profiles for update to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()));

-- profiles_private: owner only.
create policy private_select_own on profiles_private for select to authenticated
  using (id = (select auth.uid()));
create policy private_insert_own on profiles_private for insert to authenticated
  with check (id = (select auth.uid()));
create policy private_update_own on profiles_private for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Public read. Child tables follow the tournament's visibility (drafts hidden, admin sees all).
create policy tournaments_read on tournaments for select to anon, authenticated
  using (status <> 'draft');
create policy rounds_read on rounds for select to anon, authenticated
  using (exists (select 1 from tournaments t where t.id = tournament_id));
create policy players_read on players for select to anon, authenticated
  using (exists (select 1 from tournaments t where t.id = tournament_id));
create policy player_results_read on player_results for select to anon, authenticated
  using (exists (select 1 from players p where p.id = player_id));
create policy entries_read on entries for select to anon, authenticated
  using (exists (select 1 from tournaments t where t.id = tournament_id));

-- Picks: own always, others once the round is locked, admin always (admin_all below).
create policy picks_read on picks for select to anon, authenticated
  using (
    exists (select 1 from entries e where e.id = entry_id and e.user_id = (select auth.uid()))
    or exists (select 1 from rounds r where r.id = round_id and r.locks_at <= now())
  );

-- Admin-only writes (and full read). Users never write game tables directly: they use the RPCs.
create policy admin_all on tournaments for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on rounds for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on players for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on player_results for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on entries for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on picks for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on admin_log for all to authenticated using (is_admin()) with check (is_admin());

-- Table privileges: anon is read-only; on profiles, users may only write id + username.
revoke insert, update, delete on all tables in schema public from anon;
revoke insert, update on profiles from authenticated;
grant insert (id, username), update (id, username) on profiles to authenticated;

-- ============ RPCs (the only way users write) ============

-- Join a tournament during registration. Returns the entry id.
create function join_tournament(p_tournament_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_status tournament_status;
  v_entry_id uuid;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  if not exists (select 1 from profiles where id = v_uid and deleted_at is null) then
    raise exception 'Choisissez un pseudo avant de rejoindre un tournoi';
  end if;

  select status into v_status from tournaments where id = p_tournament_id;
  if v_status is null then raise exception 'Tournoi introuvable'; end if;
  if v_status <> 'registration' then raise exception 'Les inscriptions sont fermées'; end if;

  if exists (select 1 from entries where tournament_id = p_tournament_id and user_id = v_uid) then
    raise exception 'Vous êtes déjà inscrit à ce tournoi';
  end if;

  insert into entries (tournament_id, user_id) values (p_tournament_id, v_uid)
  returning id into v_entry_id;
  return v_entry_id;
end $$;

-- Create or change my pick for a round (database clock).
create function make_pick(p_round_id uuid, p_player_id uuid) returns void
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
  if v_status = 'registration' and v_round.idx <> 1 then
    raise exception 'Seul le 1er tour est ouvert pendant les inscriptions';
  end if;
  if now() >= v_round.locks_at then
    raise exception 'Ce tour est verrouillé';
  end if;
  -- Only the current round (first round whose lock is in the future).
  if exists (select 1 from rounds where tournament_id = v_round.tournament_id
             and idx < v_round.idx and locks_at > now()) then
    raise exception 'Ce tour n''est pas encore ouvert';
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

-- Admin: enter or correct a result. p_result = null clears it ("uncheck").
create function set_result(p_player_id uuid, p_round_id uuid, p_result match_result) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Réservé à l''administrateur'; end if;
  if not exists (select 1 from players p join rounds r on r.tournament_id = p.tournament_id
                 where p.id = p_player_id and r.id = p_round_id) then
    raise exception 'Joueur et tour de tournois différents';
  end if;

  if p_result is null then
    delete from player_results where player_id = p_player_id and round_id = p_round_id;
  else
    insert into player_results (player_id, round_id, result, status, source)
    values (p_player_id, p_round_id, p_result, 'done', 'manual')
    on conflict (player_id, round_id)
    do update set result = excluded.result, status = 'done', source = 'manual', updated_at = now();
  end if;

  insert into admin_log (admin_id, action, payload)
  values (auth.uid(), 'set_result',
          jsonb_build_object('player_id', p_player_id, 'round_id', p_round_id, 'result', p_result));
end $$;

-- Admin: set a pick on someone's behalf (no lock check).
create function admin_set_pick(p_entry_id uuid, p_round_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Réservé à l''administrateur'; end if;
  if not exists (select 1 from entries e
                 join rounds r on r.tournament_id = e.tournament_id and r.id = p_round_id
                 join players p on p.tournament_id = e.tournament_id and p.id = p_player_id
                 where e.id = p_entry_id) then
    raise exception 'Inscription, tour et joueur de tournois différents';
  end if;
  if exists (select 1 from picks where entry_id = p_entry_id
             and player_id = p_player_id and round_id <> p_round_id) then
    raise exception 'Ce joueur a déjà été choisi';
  end if;

  insert into picks (entry_id, round_id, player_id) values (p_entry_id, p_round_id, p_player_id)
  on conflict (entry_id, round_id)
  do update set player_id = excluded.player_id, updated_at = now();

  insert into admin_log (admin_id, action, payload)
  values (auth.uid(), 'admin_set_pick',
          jsonb_build_object('entry_id', p_entry_id, 'round_id', p_round_id, 'player_id', p_player_id));
end $$;

-- Admin: remove an entry (its picks go with it; the removed row is kept in the log).
create function admin_remove_entry(p_entry_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_entry jsonb;
begin
  if not is_admin() then raise exception 'Réservé à l''administrateur'; end if;

  select to_jsonb(e) || jsonb_build_object(
           'picks', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from picks p where p.entry_id = e.id))
  into v_entry
  from entries e where e.id = p_entry_id;
  if v_entry is null then raise exception 'Inscription introuvable'; end if;

  delete from entries where id = p_entry_id;
  insert into admin_log (admin_id, action, payload) values (auth.uid(), 'admin_remove_entry', v_entry);
end $$;

-- User: erase personal data and anonymize the profile. Entries are kept ("deleted user").
-- The auth.users row itself must be deleted from the dashboard / service role if needed.
create function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  delete from profiles_private where id = v_uid;
  update profiles
  set username = 'deleted-' || left(replace(id::text, '-', ''), 8),
      deleted_at = now()
  where id = v_uid;
end $$;

-- ============ Function privileges ============
-- Supabase grants EXECUTE to anon/authenticated by default: restrict RPCs to logged-in users.
revoke execute on function join_tournament(uuid) from public, anon;
revoke execute on function make_pick(uuid, uuid) from public, anon;
revoke execute on function set_result(uuid, uuid, match_result) from public, anon;
revoke execute on function admin_set_pick(uuid, uuid, uuid) from public, anon;
revoke execute on function admin_remove_entry(uuid) from public, anon;
revoke execute on function delete_my_account() from public, anon;

grant execute on function join_tournament(uuid) to authenticated;
grant execute on function make_pick(uuid, uuid) to authenticated;
grant execute on function set_result(uuid, uuid, match_result) to authenticated;
grant execute on function admin_set_pick(uuid, uuid, uuid) to authenticated;
grant execute on function admin_remove_entry(uuid) to authenticated;
grant execute on function delete_my_account() to authenticated;

-- is_admin() is used inside RLS policies, so anon must be able to call it.
grant execute on function is_admin() to anon, authenticated;
