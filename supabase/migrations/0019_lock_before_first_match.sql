-- Rounds lock 10 minutes before their first scheduled match instead of at its start, so picks are settled before
-- play begins. Same as 0011 otherwise.
create or replace function align_round_locks(p_tournament_id uuid) returns void
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
        r.locks_at := v_first - interval '10 minutes';
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
