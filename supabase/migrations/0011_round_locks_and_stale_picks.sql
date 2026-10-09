-- Two fixes for rounds that overlap in real life (multi-day rounds, byes in 96/56 draws):
--   1. A pick whose player already lost in an earlier round counts as lost. He never plays this round, so without
--      this the pick stayed "pending" forever and kept the entry alive.
--   2. Lock times follow the real schedule: each round locks at its first scheduled match (synced into matches),
--      instead of the "start + 2 days per round" guess. An admin edit pins a round's lock (locks_at_manual).

-- ============ 1. entry_status: a player already out loses every later pick ============
create or replace view entry_status with (security_invoker = false) as
with lost_at as (
  select pr.player_id, min(r.idx) as idx
  from player_results pr join rounds r on r.id = pr.round_id
  where pr.result = 'lost'
  group by pr.player_id
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

-- ============ 2. Lock times from the schedule ============
alter table rounds add column locks_at_manual boolean not null default false;

-- Called by the sync-results Edge Function after it stores the matches. Only touches rounds still open
-- (a lock that passed never moves back) and not pinned by the admin:
--   * first scheduled match of the round known -> lock at that time (ignoring dates before the previous lock,
--     which can only be placeholders);
--   * not known yet while the previous round is still being played -> keep the round open 7 h more (the sync
--     runs at least every 6 h), so the next round never opens before this one's order of play is out.
create function align_round_locks(p_tournament_id uuid) returns void
language plpgsql
set search_path = public
as $$
declare
  r rounds%rowtype;
  v_prev_lock timestamptz;
  v_first timestamptz;
begin
  for r in select * from rounds where tournament_id = p_tournament_id order by idx loop
    if r.locks_at > now() and not r.locks_at_manual then
      select min(m.scheduled_at) into v_first
      from matches m
      where m.round_id = r.id and m.scheduled_at is not null
        and (v_prev_lock is null or m.scheduled_at >= v_prev_lock);

      if v_first is not null then
        r.locks_at := v_first;
      elsif r.locks_at < now() + interval '7 hours' and exists (
        select 1 from matches m join rounds pr on pr.id = m.round_id
        where pr.tournament_id = p_tournament_id and pr.idx = r.idx - 1
          and m.status <> 'done' and m.player1_id is not null and m.player2_id is not null
      ) then
        r.locks_at := now() + interval '7 hours';
      end if;
      update rounds set locks_at = r.locks_at where id = r.id and locks_at is distinct from r.locks_at;
    end if;
    v_prev_lock := r.locks_at;
  end loop;
end $$;

revoke execute on function align_round_locks(uuid) from public, anon, authenticated;
