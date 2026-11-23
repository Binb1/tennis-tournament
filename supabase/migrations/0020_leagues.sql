-- Friend leagues: a group of players with an invite code. A league is only a filter on the season ranking and the
-- tournament leaderboards: everyone keeps playing the one global game (same entries, picks and points).
--   * At most 3 leagues per player, created and joined together.
--   * Join with the code (typed, or the link / QR code that carries it). The owner renames, removes members and can
--     draw a new code (the old one stops working). Leaving as owner hands the league to the longest-standing member;
--     the last one out deletes it.
--   * Members see their leagues and fellow members; nobody else does. Writes only through the functions below.

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  owner_id uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table league_members (
  league_id uuid not null references leagues (id) on delete cascade,
  user_id uuid not null references profiles (id),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_members_user on league_members (user_id);

-- Security definer so the policies below don't recurse into league_members' own policy.
create function is_league_member(p_league_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members where league_id = p_league_id and user_id = (select auth.uid()));
$$;

alter table leagues enable row level security;
alter table league_members enable row level security;
create policy leagues_read on leagues for select to authenticated using (is_league_member(id));
create policy league_members_read on league_members for select to authenticated using (is_league_member(league_id));
create policy admin_all on leagues for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on league_members for all to authenticated using (is_admin()) with check (is_admin());
revoke all on leagues, league_members from anon;
revoke insert, update, delete, truncate, trigger, references on leagues, league_members from authenticated;
grant select on leagues, league_members to authenticated;

-- 6 characters without look-alikes (no 0/O, 1/I/L), unused by any league.
create function new_league_code() returns text
language plpgsql set search_path = public as $$
declare
  v_chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from leagues where code = v_code);
  end loop;
  return v_code;
end $$;

-- Caller with a live profile and room for one more league. Locks the profile row so two calls can't both pass.
create function league_slot_check(p_uid uuid) returns void
language plpgsql set search_path = public as $$
begin
  if p_uid is null then raise exception 'Connexion requise'; end if;
  perform 1 from profiles where id = p_uid and deleted_at is null for update;
  if not found then raise exception 'Choisissez un pseudo avant de rejoindre une ligue'; end if;
  if (select count(*) from league_members where user_id = p_uid) >= 3 then
    raise exception 'Vous êtes déjà dans 3 ligues : quittez-en une pour en rejoindre une autre';
  end if;
end $$;

-- Create a league (the caller is its owner and first member). Returns its id.
create function create_league(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  perform league_slot_check(v_uid);
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 40 then
    raise exception 'Le nom de la ligue doit faire entre 2 et 40 caractères';
  end if;
  insert into leagues (name, code, owner_id) values (trim(p_name), new_league_code(), v_uid) returning id into v_id;
  insert into league_members (league_id, user_id) values (v_id, v_uid);
  return v_id;
end $$;

-- What an invite shows before joining, logged in or not: name, owner, member count, and whether I'm in already.
create function league_by_code(p_code text)
returns table (id uuid, name text, owner text, members int, is_member boolean)
language sql stable security definer set search_path = public as $$
  select l.id, l.name, p.username, (select count(*)::int from league_members m where m.league_id = l.id),
         exists (select 1 from league_members m where m.league_id = l.id and m.user_id = (select auth.uid()))
  from leagues l join profiles p on p.id = l.owner_id
  where l.code = upper(trim(p_code));
$$;

-- Join with a code. Already a member: no-op. Returns the league id.
create function join_league(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  select id into v_id from leagues where code = upper(trim(coalesce(p_code, '')));
  if v_id is null then raise exception 'Code de ligue inconnu : vérifiez-le auprès de votre ami'; end if;
  if exists (select 1 from league_members where league_id = v_id and user_id = v_uid) then return v_id; end if;
  perform league_slot_check(v_uid);
  insert into league_members (league_id, user_id) values (v_id, v_uid);
  return v_id;
end $$;

-- Leave. The owner hands over to the longest-standing member; the last member out deletes the league.
create function leave_league(p_league_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_next uuid;
begin
  delete from league_members where league_id = p_league_id and user_id = v_uid;
  if not found then raise exception 'Vous n''êtes pas dans cette ligue'; end if;
  if exists (select 1 from leagues where id = p_league_id and owner_id = v_uid) then
    select user_id into v_next from league_members where league_id = p_league_id order by joined_at, user_id limit 1;
    if v_next is null then
      delete from leagues where id = p_league_id;
    else
      update leagues set owner_id = v_next where id = p_league_id;
    end if;
  end if;
end $$;

create function league_owner_check(p_league_id uuid) returns void
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from leagues where id = p_league_id and owner_id = auth.uid()) then
    raise exception 'Réservé au créateur de la ligue';
  end if;
end $$;

create function rename_league(p_league_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform league_owner_check(p_league_id);
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 40 then
    raise exception 'Le nom de la ligue doit faire entre 2 et 40 caractères';
  end if;
  update leagues set name = trim(p_name) where id = p_league_id;
end $$;

-- Owner only, not themself (they leave instead).
create function remove_league_member(p_league_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform league_owner_check(p_league_id);
  if p_user_id = auth.uid() then raise exception 'Réservé au créateur de la ligue'; end if;
  delete from league_members where league_id = p_league_id and user_id = p_user_id;
end $$;

-- A new code: the old link and QR code stop working. Returns the new code.
create function reset_league_code(p_league_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text := new_league_code();
begin
  perform league_owner_check(p_league_id);
  update leagues set code = v_code where id = p_league_id;
  return v_code;
end $$;

revoke execute on function new_league_code(), league_slot_check(uuid), league_owner_check(uuid) from public, anon, authenticated;
revoke execute on function is_league_member(uuid) from public, anon;
grant execute on function is_league_member(uuid) to authenticated;
revoke execute on function create_league(text), join_league(text), leave_league(uuid), rename_league(uuid, text),
  remove_league_member(uuid, uuid), reset_league_code(uuid) from public, anon;
grant execute on function create_league(text), join_league(text), leave_league(uuid), rename_league(uuid, text),
  remove_league_member(uuid, uuid), reset_league_code(uuid) to authenticated;
grant execute on function league_by_code(text) to anon, authenticated;
