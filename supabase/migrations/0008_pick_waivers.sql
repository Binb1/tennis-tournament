-- Waivers: the admin keeps alive an entry that forgot to pick in a round ("repêchage").
-- A waived round without a pick counts as survived; a lost pick still eliminates.

create table pick_waivers (
  entry_id uuid not null references entries (id) on delete cascade,
  round_id uuid not null references rounds (id) on delete cascade,
  admin_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (entry_id, round_id)
);

-- Public read like locked picks (a waiver only exists for a locked round). Writes through the RPC only.
alter table pick_waivers enable row level security;
create policy pick_waivers_read on pick_waivers for select to anon, authenticated
  using (exists (select 1 from rounds r where r.id = round_id));
revoke insert, update, delete on pick_waivers from anon, authenticated;

-- Same columns as before; a missing pick only eliminates when the round is not waived.
create or replace view entry_status with (security_invoker = false) as
with steps as (
  select e.id as entry_id, r.idx, p.player_id, pr.result, w.entry_id is not null as waived
  from entries e
  join rounds r on r.tournament_id = e.tournament_id and r.locks_at <= now()
  left join picks p on p.entry_id = e.id and p.round_id = r.id
  left join player_results pr on pr.player_id = p.player_id and pr.round_id = r.id
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
    where s.entry_id = e.id and (s.result = 'won' or (s.player_id is null and s.waived))
      and (el.eliminated_round is null or s.idx < el.eliminated_round))::int as rounds_survived
from entries e
left join elim el on el.entry_id = e.id;

-- Admin: waive (p_waived = true) or restore (false) a locked round the entry did not pick in.
create function admin_waive_round(p_entry_id uuid, p_round_id uuid, p_waived boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Réservé à l''administrateur'; end if;
  if not exists (select 1 from entries e join rounds r on r.tournament_id = e.tournament_id
                 where e.id = p_entry_id and r.id = p_round_id) then
    raise exception 'Inscription et tour de tournois différents';
  end if;

  if p_waived then
    if exists (select 1 from rounds where id = p_round_id and locks_at > now()) then
      raise exception 'Ce tour n''est pas encore verrouillé';
    end if;
    if exists (select 1 from picks where entry_id = p_entry_id and round_id = p_round_id) then
      raise exception 'Un choix existe pour ce tour : rien à repêcher';
    end if;
    insert into pick_waivers (entry_id, round_id, admin_id) values (p_entry_id, p_round_id, auth.uid())
    on conflict do nothing;
  else
    delete from pick_waivers where entry_id = p_entry_id and round_id = p_round_id;
  end if;

  insert into admin_log (admin_id, action, payload)
  values (auth.uid(), case when p_waived then 'admin_waive_round' else 'admin_unwaive_round' end,
          jsonb_build_object('entry_id', p_entry_id, 'round_id', p_round_id));
end $$;

revoke execute on function admin_waive_round(uuid, uuid, boolean) from public, anon;
grant execute on function admin_waive_round(uuid, uuid, boolean) to authenticated;
