-- Matches (opponent per round + full bracket), player country and world ranking.
-- Filled by the sync-results Edge Function from GET {tour}/tournament/{external_id}/{year}/draws.

-- ============ Players: country (3-letter code as the API gives it: FRA, GER, SUI) + ranking ============
alter table players add column country text;
alter table players add column ranking int check (ranking > 0);

-- ============ Matches: one row per bracket slot of a main round ============
create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  round_id uuid not null references rounds (id) on delete cascade,
  external_id text not null,                 -- "<api roundId>-<draw slot>", stable for the slot
  player1_id uuid references players (id) on delete set null, -- null = unknown yet (qualifier, TBD)
  player2_id uuid references players (id) on delete set null,
  winner_id uuid references players (id) on delete set null,
  scheduled_at timestamptz,
  score text,                                -- "6-4 3-6 7-6(5)", "w/o"; winner's score first
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'done')),
  position int check (position > 0),         -- bracket slot in the round, 1 = top. Slot p is fed by 2p-1 and 2p.
  updated_at timestamptz not null default now(),
  unique (tournament_id, external_id)
);
create index on matches (tournament_id);
create index on matches (round_id);

-- Public read, same visibility as rounds (follows the tournament). Only admins / the Edge Function write.
alter table matches enable row level security;
create policy matches_read on matches for select to anon, authenticated
  using (exists (select 1 from tournaments t where t.id = tournament_id));
create policy admin_all on matches for all to authenticated using (is_admin()) with check (is_admin());
