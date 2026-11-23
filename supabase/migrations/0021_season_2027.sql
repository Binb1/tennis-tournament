-- 2027 season: the whole ATP calendar preloaded (official ATP calendar, 14 January 2026 update).
--   * generate_rounds: the rounds of a tournament from its draw size, as the admin form does (AdminHome roundNames):
--     the last 4 are always 8es → Finale, earlier ones numbered. Placeholder locks every 2 days from the start; the
--     sync moves each to 10 min before its round's first match once the draw is out (migration 0019).
--   * Every tour-level singles event (4 Slams, 9 Masters 1000, 16 ATP 500, 29 ATP 250; not the week-45 250 still
--     "TBD", the team events or the round-robin Finals). Open for sign-up, shown as "upcoming" until a draw is in.
--   * draw_size: the official main draw (28, 32, 48, 56, 96, 128), as for 2026.
--   * starts_at: main-draw start, 11:00 local time (a placeholder: the synced schedule wins).
--   * No external_id: the API's id is per edition and 2027's aren't known yet. Set it in the admin (Synchronisation)
--     and the draw imports itself as usual; until then, the draw can be pasted as CSV.

create or replace function generate_rounds(p_tournament_id uuid) returns void
language plpgsql set search_path = public as $$
declare
  v_start timestamptz;
  v_count int;
  v_names text[];
begin
  select starts_at, round(log(2, draw_size))::int into v_start, v_count from tournaments where id = p_tournament_id;
  v_names := (array['1er tour', '2e tour', '3e tour'])[1:greatest(0, v_count - 4)]
          || (array['8es de finale', 'Quarts', 'Demies', 'Finale'])[greatest(1, 5 - v_count):4];
  insert into rounds (tournament_id, idx, name, locks_at)
  select p_tournament_id, i, v_names[i], v_start + (i - 1) * interval '2 days'
  from generate_series(1, v_count) i;
end $$;

revoke execute on function generate_rounds(uuid) from public, anon, authenticated;

with cal (name, day, tz, country, category, draw_size, theme) as (
  values
    ('Brisbane International 2027',              '2027-01-04', 'Australia/Brisbane',             'AUS', 'atp250',      32,  null),
    ('Hong Kong Tennis Open 2027',               '2027-01-04', 'Asia/Hong_Kong',                 'HKG', 'atp250',      28,  null),
    ('Adelaide International 2027',              '2027-01-11', 'Australia/Adelaide',             'AUS', 'atp250',      28,  null),
    ('ASB Classic 2027',                         '2027-01-11', 'Pacific/Auckland',               'NZL', 'atp250',      28,  null),
    ('Australian Open 2027',                     '2027-01-17', 'Australia/Melbourne',            'AUS', 'grand_slam',  128, 'ao'),
    ('Open Occitanie 2027',                      '2027-02-01', 'Europe/Paris',                   'FRA', 'atp250',      28,  null),
    ('Dallas Open 2027',                         '2027-02-08', 'America/Chicago',                'USA', 'atp500',      32,  null),
    ('ABN AMRO Open 2027',                       '2027-02-08', 'Europe/Amsterdam',               'NED', 'atp500',      32,  null),
    ('Argentina Open 2027',                      '2027-02-08', 'America/Argentina/Buenos_Aires', 'ARG', 'atp250',      28,  null),
    ('Qatar Open 2027',                          '2027-02-15', 'Asia/Qatar',                     'QAT', 'atp500',      32,  null),
    ('Rio Open 2027',                            '2027-02-15', 'America/Sao_Paulo',              'BRA', 'atp500',      32,  null),
    ('Delray Beach Open 2027',                   '2027-02-15', 'America/New_York',               'USA', 'atp250',      28,  null),
    ('Abierto Mexicano Telcel 2027',             '2027-02-22', 'America/Mexico_City',            'MEX', 'atp500',      32,  null),
    ('Dubai Tennis Championships 2027',          '2027-02-22', 'Asia/Dubai',                     'UAE', 'atp500',      32,  null),
    ('Chile Open 2027',                          '2027-02-22', 'America/Santiago',               'CHI', 'atp250',      28,  null),
    ('BNP Paribas Open 2027',                    '2027-03-03', 'America/Los_Angeles',            'USA', 'masters1000', 96,  'indianwells'),
    ('Miami Open 2027',                          '2027-03-17', 'America/New_York',               'USA', 'masters1000', 96,  'miami'),
    ('Tiriac Open 2027',                         '2027-03-29', 'Europe/Bucharest',               'ROU', 'atp250',      28,  null),
    ('U.S. Men''s Clay Court Championship 2027', '2027-03-29', 'America/Chicago',                'USA', 'atp250',      28,  null),
    ('Grand Prix Hassan II 2027',                '2027-03-29', 'Africa/Casablanca',              'MAR', 'atp250',      28,  null),
    ('Rolex Monte-Carlo Masters 2027',           '2027-04-04', 'Europe/Monaco',                  'MON', 'masters1000', 56,  'montecarlo'),
    ('Barcelona Open 2027',                      '2027-04-12', 'Europe/Madrid',                  'ESP', 'atp500',      32,  null),
    ('BMW Open 2027',                            '2027-04-12', 'Europe/Berlin',                  'GER', 'atp500',      32,  null),
    ('Mutua Madrid Open 2027',                   '2027-04-21', 'Europe/Madrid',                  'ESP', 'masters1000', 96,  'madrid'),
    ('Internazionali BNL d''Italia 2027',        '2027-05-05', 'Europe/Rome',                    'ITA', 'masters1000', 96,  'rome'),
    ('Hamburg Open 2027',                        '2027-05-16', 'Europe/Berlin',                  'GER', 'atp500',      32,  null),
    ('Geneva Open 2027',                         '2027-05-16', 'Europe/Zurich',                  'SUI', 'atp250',      28,  null),
    ('Roland-Garros 2027',                       '2027-05-23', 'Europe/Paris',                   'FRA', 'grand_slam',  128, 'clay'),
    ('Libema Open 2027',                         '2027-06-07', 'Europe/Amsterdam',               'NED', 'atp250',      28,  null),
    ('Boss Open 2027',                           '2027-06-07', 'Europe/Berlin',                  'GER', 'atp250',      28,  null),
    ('Terra Wortmann Open 2027',                 '2027-06-14', 'Europe/Berlin',                  'GER', 'atp500',      32,  null),
    ('Queen''s Club Championships 2027',         '2027-06-14', 'Europe/London',                  'GBR', 'atp500',      32,  null),
    ('Mallorca Championships 2027',              '2027-06-20', 'Europe/Madrid',                  'ESP', 'atp250',      28,  null),
    ('Eastbourne Open 2027',                     '2027-06-21', 'Europe/London',                  'GBR', 'atp250',      28,  null),
    ('Wimbledon 2027',                           '2027-06-28', 'Europe/London',                  'GBR', 'grand_slam',  128, 'wimbledon'),
    ('Nordea Open 2027',                         '2027-07-12', 'Europe/Stockholm',               'SWE', 'atp250',      28,  null),
    ('Swiss Open Gstaad 2027',                   '2027-07-12', 'Europe/Zurich',                  'SUI', 'atp250',      28,  null),
    ('Croatia Open Umag 2027',                   '2027-07-12', 'Europe/Zagreb',                  'CRO', 'atp250',      28,  null),
    ('Generali Open Kitzbühel 2027',             '2027-07-19', 'Europe/Vienna',                  'AUT', 'atp250',      28,  null),
    ('Estoril Open 2027',                        '2027-07-19', 'Europe/Lisbon',                  'POR', 'atp250',      28,  null),
    ('DC Open 2027',                             '2027-07-26', 'America/New_York',               'USA', 'atp500',      32,  null),
    ('Los Cabos Open 2027',                      '2027-07-26', 'America/Mazatlan',               'MEX', 'atp250',      28,  null),
    ('National Bank Open 2027',                  '2027-08-01', 'America/Toronto',                'CAN', 'masters1000', 96,  'canada'),
    ('Cincinnati Open 2027',                     '2027-08-12', 'America/New_York',               'USA', 'masters1000', 96,  'cincinnati'),
    ('Winston-Salem Open 2027',                  '2027-08-22', 'America/New_York',               'USA', 'atp250',      48,  null),
    ('US Open 2027',                             '2027-08-29', 'America/New_York',               'USA', 'grand_slam',  128, 'usopen'),
    ('Chengdu Open 2027',                        '2027-09-22', 'Asia/Shanghai',                  'CHN', 'atp250',      28,  null),
    ('Hangzhou Open 2027',                       '2027-09-22', 'Asia/Shanghai',                  'CHN', 'atp250',      28,  null),
    ('Japan Open 2027',                          '2027-09-29', 'Asia/Tokyo',                     'JPN', 'atp500',      32,  null),
    ('China Open 2027',                          '2027-09-29', 'Asia/Shanghai',                  'CHN', 'atp500',      32,  null),
    ('Shanghai Masters 2027',                    '2027-10-06', 'Asia/Shanghai',                  'CHN', 'masters1000', 96,  'shanghai'),
    ('Almaty Open 2027',                         '2027-10-18', 'Asia/Almaty',                    'KAZ', 'atp250',      28,  null),
    ('Stockholm Open 2027',                      '2027-10-18', 'Europe/Stockholm',               'SWE', 'atp250',      28,  null),
    ('Grand Prix Auvergne-Rhône-Alpes 2027',     '2027-10-18', 'Europe/Paris',                   'FRA', 'atp250',      28,  null),
    ('Swiss Indoors Basel 2027',                 '2027-10-25', 'Europe/Zurich',                  'SUI', 'atp500',      32,  null),
    ('Erste Bank Open 2027',                     '2027-10-25', 'Europe/Vienna',                  'AUT', 'atp500',      32,  null),
    ('Rolex Paris Masters 2027',                 '2027-11-01', 'Europe/Paris',                   'FRA', 'masters1000', 56,  'paris'),
    ('European Open 2027',                       '2027-11-07', 'Europe/Brussels',                'BEL', 'atp250',      28,  null)
)
insert into tournaments (name, tour, draw_size, status, starts_at, theme, category, country)
select c.name, 'ATP', c.draw_size, 'registration', (c.day || ' 11:00')::timestamp at time zone c.tz,
       c.theme, c.category::tournament_category, c.country
from cal c
-- Re-runnable: skips what's already there.
where not exists (select 1 from tournaments t where t.name = c.name);

-- Separate statement: an insert's rows aren't visible to the rest of its own statement.
select generate_rounds(t.id)
from tournaments t
where t.tour = 'ATP' and t.starts_at >= '2027-01-01' and t.starts_at < '2028-01-01' and not t.test
  and not exists (select 1 from rounds r where r.tournament_id = t.id);
