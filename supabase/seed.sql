-- Test data (no users/entries: they come from auth).

-- ===== US Open 2026: 32 draw, registration open, round 1 locks in 2 days =====
with t as (
  insert into tournaments (name, tour, draw_size, status, starts_at)
  values ('US Open 2026', 'ATP', 32, 'registration', now() + interval '2 days')
  returning id
),
r as (
  insert into rounds (tournament_id, idx, name, locks_at)
  select t.id, v.idx, v.name, now() + v.idx * interval '2 days'
  from t, (values
    (1, '1er tour'), (2, '8es de finale'), (3, 'Quarts'), (4, 'Demies'), (5, 'Finale')
  ) as v(idx, name)
)
insert into players (tournament_id, name, seed)
select t.id, v.name, v.seed
from t, (values
  ('Jannik Sinner', 1), ('Carlos Alcaraz', 2), ('Alexander Zverev', 3), ('Novak Djokovic', 4),
  ('Taylor Fritz', 5), ('Jack Draper', 6), ('Ben Shelton', 7), ('Lorenzo Musetti', 8),
  ('Alex de Minaur', null), ('Holger Rune', null), ('Daniil Medvedev', null), ('Casper Ruud', null),
  ('Tommy Paul', null), ('Andrey Rublev', null), ('Frances Tiafoe', null), ('Arthur Fils', null),
  ('Jakub Menšík', null), ('Jiří Lehečka', null), ('Ugo Humbert', null), ('Francisco Cerúndolo', null),
  ('Stefanos Tsitsipas', null), ('Karen Khachanov', null), ('Félix Auger-Aliassime', null), ('Grigor Dimitrov', null),
  ('Tomáš Macháč', null), ('Giovanni Mpetshi Perricard', null), ('João Fonseca', null), ('Alexander Bublik', null),
  ('Hubert Hurkacz', null), ('Tallon Griekspoor', null), ('Alexei Popyrin', null), ('Alejandro Davidovich Fokina', null)
) as v(name, seed);

-- ===== Roland-Garros 2026: 16 draw, finished, all rounds locked in the past =====
with t as (
  insert into tournaments (name, tour, draw_size, status, starts_at)
  values ('Roland-Garros 2026', 'ATP', 16, 'finished', '2026-05-24 11:00+02')
  returning id
),
r as (
  insert into rounds (tournament_id, idx, name, locks_at)
  select t.id, v.idx, v.name, v.locks_at::timestamptz
  from t, (values
    (1, '8es de finale', '2026-05-24 11:00+02'),
    (2, 'Quarts',        '2026-06-02 11:00+02'),
    (3, 'Demies',        '2026-06-05 13:00+02'),
    (4, 'Finale',        '2026-06-07 15:00+02')
  ) as v(idx, name, locks_at)
)
insert into players (tournament_id, name, seed)
select t.id, v.name, v.seed
from t, (values
  ('Jannik Sinner', 1), ('Carlos Alcaraz', 2), ('Alexander Zverev', 3), ('Novak Djokovic', 4),
  ('Taylor Fritz', 5), ('Jack Draper', 6), ('Lorenzo Musetti', 7), ('Ben Shelton', 8),
  ('Holger Rune', null), ('Casper Ruud', null), ('Alex de Minaur', null), ('Daniil Medvedev', null),
  ('Tommy Paul', null), ('Andrey Rublev', null), ('Frances Tiafoe', null), ('Arthur Fils', null)
) as v(name, seed);

-- Bracket: 16 -> 8 -> 4 -> 2 -> 1 (champion: Alcaraz).
-- R1: Sinner d. Fils, Musetti d. Tiafoe, Draper d. Rublev, Zverev d. Paul,
--     Djokovic d. Medvedev, Rune d. Fritz, Shelton d. de Minaur, Alcaraz d. Ruud
-- QF: Sinner d. Musetti, Zverev d. Draper, Djokovic d. Rune, Alcaraz d. Shelton
-- SF: Sinner d. Zverev, Alcaraz d. Djokovic.  F: Alcaraz d. Sinner
insert into player_results (player_id, round_id, result, status, source)
select p.id, r.id, v.result::match_result, 'done'::result_status, 'manual'::result_source
from (values
  (1, 'Jannik Sinner', 'won'),   (1, 'Arthur Fils', 'lost'),
  (1, 'Lorenzo Musetti', 'won'), (1, 'Frances Tiafoe', 'lost'),
  (1, 'Jack Draper', 'won'),     (1, 'Andrey Rublev', 'lost'),
  (1, 'Alexander Zverev', 'won'),(1, 'Tommy Paul', 'lost'),
  (1, 'Novak Djokovic', 'won'),  (1, 'Daniil Medvedev', 'lost'),
  (1, 'Holger Rune', 'won'),     (1, 'Taylor Fritz', 'lost'),
  (1, 'Ben Shelton', 'won'),     (1, 'Alex de Minaur', 'lost'),
  (1, 'Carlos Alcaraz', 'won'),  (1, 'Casper Ruud', 'lost'),
  (2, 'Jannik Sinner', 'won'),   (2, 'Lorenzo Musetti', 'lost'),
  (2, 'Alexander Zverev', 'won'),(2, 'Jack Draper', 'lost'),
  (2, 'Novak Djokovic', 'won'),  (2, 'Holger Rune', 'lost'),
  (2, 'Carlos Alcaraz', 'won'),  (2, 'Ben Shelton', 'lost'),
  (3, 'Jannik Sinner', 'won'),   (3, 'Alexander Zverev', 'lost'),
  (3, 'Carlos Alcaraz', 'won'),  (3, 'Novak Djokovic', 'lost'),
  (4, 'Carlos Alcaraz', 'won'),  (4, 'Jannik Sinner', 'lost')
) as v(idx, name, result)
join tournaments t on t.name = 'Roland-Garros 2026'
join players p on p.tournament_id = t.id and p.name = v.name
join rounds r on r.tournament_id = t.id and r.idx = v.idx;
