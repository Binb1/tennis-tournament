-- 2027 season: the whole ATP calendar preloaded (official ATP calendar, 14 January 2026 update).
--   * generate_rounds: the rounds of a tournament from its draw size, as the admin form does (AdminHome roundNames):
--     the last 4 are always 8es → Finale, earlier ones numbered. Placeholder locks every 2 days from the start; the
--     sync moves each to 10 min before its round's first match once the draw is out (migration 0019).
--   * Every tour-level singles event (4 Slams, 9 Masters 1000, 16 ATP 500, 29 ATP 250; not the week-45 250 still
--     "TBD", the team events or the round-robin Finals). Open for sign-up, shown as "upcoming" until the draw
--     imports itself in the 3 days before the start.
--   * draw_size: the app's bracket (28/32 → 32, 48/56 → 64, 96/128 → 128; byes are handled, migration 0016).
--   * starts_at: main-draw start, 11:00 local time (placeholder too, the synced schedule wins).
--   * external_id: the API's tournament id is the same every year (the draw path adds the year), so it comes from
--     the latest earlier tournament of the same name; the others are filled from the API calendar.

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

with cal (name, prev, day, tz, country, category, draw_size, theme) as (
  values
    ('Brisbane 2027',         'brisbane',               '2027-01-04', 'Australia/Brisbane',             'AUS', 'atp250',      32,  null),
    ('Hong Kong 2027',        'hong kong',              '2027-01-04', 'Asia/Hong_Kong',                 'HKG', 'atp250',      32,  null),
    ('Adelaide 2027',         'adelaide',               '2027-01-11', 'Australia/Adelaide',             'AUS', 'atp250',      32,  null),
    ('Auckland 2027',         'auckland',               '2027-01-11', 'Pacific/Auckland',               'NZL', 'atp250',      32,  null),
    ('Australian Open 2027',  'australian open',        '2027-01-17', 'Australia/Melbourne',            'AUS', 'grand_slam',  128, 'ao'),
    ('Montpellier 2027',      'montpellier',            '2027-02-01', 'Europe/Paris',                   'FRA', 'atp250',      32,  null),
    ('Dallas 2027',           'dallas',                 '2027-02-08', 'America/Chicago',                'USA', 'atp500',      32,  null),
    ('Rotterdam 2027',        'rotterdam',              '2027-02-08', 'Europe/Amsterdam',               'NED', 'atp500',      32,  null),
    ('Buenos Aires 2027',     'buenos aires',           '2027-02-08', 'America/Argentina/Buenos_Aires', 'ARG', 'atp250',      32,  null),
    ('Doha 2027',             'doha',                   '2027-02-15', 'Asia/Qatar',                     'QAT', 'atp500',      32,  null),
    ('Rio de Janeiro 2027',   '\mrio\M',               '2027-02-15', 'America/Sao_Paulo',              'BRA', 'atp500',      32,  null),
    ('Delray Beach 2027',     'delray',                 '2027-02-15', 'America/New_York',               'USA', 'atp250',      32,  null),
    ('Acapulco 2027',         'acapulco',               '2027-02-22', 'America/Mexico_City',            'MEX', 'atp500',      32,  null),
    ('Dubai 2027',            'dubai',                  '2027-02-22', 'Asia/Dubai',                     'UAE', 'atp500',      32,  null),
    ('Santiago 2027',         'santiago',               '2027-02-22', 'America/Santiago',               'CHI', 'atp250',      32,  null),
    ('Indian Wells 2027',     'indian wells',           '2027-03-03', 'America/Los_Angeles',            'USA', 'masters1000', 128, 'indianwells'),
    ('Miami 2027',            'miami',                  '2027-03-17', 'America/New_York',               'USA', 'masters1000', 128, 'miami'),
    ('Bucharest 2027',        'bucharest',              '2027-03-29', 'Europe/Bucharest',               'ROU', 'atp250',      32,  null),
    ('Houston 2027',          'houston',                '2027-03-29', 'America/Chicago',                'USA', 'atp250',      32,  null),
    ('Marrakech 2027',        'marrakech',              '2027-03-29', 'Africa/Casablanca',              'MAR', 'atp250',      32,  null),
    ('Monte-Carlo 2027',      'monte[ -]?carlo',        '2027-04-04', 'Europe/Monaco',                  'MON', 'masters1000', 64,  'montecarlo'),
    ('Barcelona 2027',        'barcelona',              '2027-04-12', 'Europe/Madrid',                  'ESP', 'atp500',      32,  null),
    ('Munich 2027',           'munich',                 '2027-04-12', 'Europe/Berlin',                  'GER', 'atp500',      32,  null),
    ('Madrid 2027',           'madrid',                 '2027-04-21', 'Europe/Madrid',                  'ESP', 'masters1000', 128, 'madrid'),
    ('Rome 2027',             '\mrom[ea]\M',            '2027-05-05', 'Europe/Rome',                    'ITA', 'masters1000', 128, 'rome'),
    ('Hamburg 2027',          'hamburg',                '2027-05-16', 'Europe/Berlin',                  'GER', 'atp500',      32,  null),
    ('Geneva 2027',           'geneva',                 '2027-05-16', 'Europe/Zurich',                  'SUI', 'atp250',      32,  null),
    ('Roland-Garros 2027',    'roland',                 '2027-05-23', 'Europe/Paris',                   'FRA', 'grand_slam',  128, 'clay'),
    ('''s-Hertogenbosch 2027', 'hertogenbosch',         '2027-06-07', 'Europe/Amsterdam',               'NED', 'atp250',      32,  null),
    ('Stuttgart 2027',        'stuttgart',              '2027-06-07', 'Europe/Berlin',                  'GER', 'atp250',      32,  null),
    ('Halle 2027',            'halle',                  '2027-06-14', 'Europe/Berlin',                  'GER', 'atp500',      32,  null),
    ('Queen''s 2027',         'queen',                  '2027-06-14', 'Europe/London',                  'GBR', 'atp500',      32,  null),
    ('Mallorca 2027',         'mallorca',               '2027-06-20', 'Europe/Madrid',                  'ESP', 'atp250',      32,  null),
    ('Eastbourne 2027',       'eastbourne',             '2027-06-21', 'Europe/London',                  'GBR', 'atp250',      32,  null),
    ('Wimbledon 2027',        'wimbledon',              '2027-06-28', 'Europe/London',                  'GBR', 'grand_slam',  128, 'wimbledon'),
    ('Båstad 2027',           'b[aå]stad',              '2027-07-12', 'Europe/Stockholm',               'SWE', 'atp250',      32,  null),
    ('Gstaad 2027',           'gstaad',                 '2027-07-12', 'Europe/Zurich',                  'SUI', 'atp250',      32,  null),
    ('Umag 2027',             'umag',                   '2027-07-12', 'Europe/Zagreb',                  'CRO', 'atp250',      32,  null),
    ('Kitzbühel 2027',        'kitzb',                  '2027-07-19', 'Europe/Vienna',                  'AUT', 'atp250',      32,  null),
    ('Estoril 2027',          'estoril',                '2027-07-19', 'Europe/Lisbon',                  'POR', 'atp250',      32,  null),
    ('Washington 2027',       'washington',             '2027-07-26', 'America/New_York',               'USA', 'atp500',      32,  null),
    ('Los Cabos 2027',        'los cabos',              '2027-07-26', 'America/Mazatlan',               'MEX', 'atp250',      32,  null),
    ('Canada 2027',           'canad|toronto|montr',    '2027-08-01', 'America/Toronto',                'CAN', 'masters1000', 128, 'canada'),
    ('Cincinnati 2027',       'cincinnati',             '2027-08-12', 'America/New_York',               'USA', 'masters1000', 128, 'cincinnati'),
    ('Winston-Salem 2027',    'winston',                '2027-08-22', 'America/New_York',               'USA', 'atp250',      64,  null),
    ('US Open 2027',          'us open',                '2027-08-29', 'America/New_York',               'USA', 'grand_slam',  128, 'usopen'),
    ('Chengdu 2027',          'chengdu',                '2027-09-22', 'Asia/Shanghai',                  'CHN', 'atp250',      32,  null),
    ('Hangzhou 2027',         'hangzhou',               '2027-09-22', 'Asia/Shanghai',                  'CHN', 'atp250',      32,  null),
    ('Tokyo 2027',            'tokyo',                  '2027-09-29', 'Asia/Tokyo',                     'JPN', 'atp500',      32,  null),
    ('Beijing 2027',          'beijing',                '2027-09-29', 'Asia/Shanghai',                  'CHN', 'atp500',      32,  null),
    ('Shanghai 2027',         'shanghai',               '2027-10-06', 'Asia/Shanghai',                  'CHN', 'masters1000', 128, 'shanghai'),
    ('Almaty 2027',           'almaty',                 '2027-10-18', 'Asia/Almaty',                    'KAZ', 'atp250',      32,  null),
    ('Stockholm 2027',        'stockholm',              '2027-10-18', 'Europe/Stockholm',               'SWE', 'atp250',      32,  null),
    ('Lyon 2027',             'lyon',                   '2027-10-18', 'Europe/Paris',                   'FRA', 'atp250',      32,  null),
    ('Basel 2027',            'basel',                  '2027-10-25', 'Europe/Zurich',                  'SUI', 'atp500',      32,  null),
    ('Vienna 2027',           'vienna|wien',            '2027-10-25', 'Europe/Vienna',                  'AUT', 'atp500',      32,  null),
    ('Paris 2027',            'paris|bercy',            '2027-11-01', 'Europe/Paris',                   'FRA', 'masters1000', 64,  'paris'),
    ('Brussels 2027',         'brussels|bruxelles',     '2027-11-07', 'Europe/Brussels',                'BEL', 'atp250',      32,  null)
)
insert into tournaments (name, tour, draw_size, status, starts_at, external_id, theme, category, country)
select
  c.name, 'ATP', c.draw_size, 'registration', (c.day || ' 11:00')::timestamp at time zone c.tz,
  (select p.external_id from tournaments p
   where p.name ~* c.prev and p.external_id is not null and not p.test and p.tour = 'ATP'
     and p.starts_at < '2027-01-01' order by p.starts_at desc limit 1),
  c.theme, c.category::tournament_category, c.country
from cal c
-- Re-runnable: skips what's already there.
where not exists (select 1 from tournaments t where t.name = c.name);

-- Separate statement: an insert's rows aren't visible to the rest of its own statement.
select generate_rounds(t.id)
from tournaments t
where t.tour = 'ATP' and t.starts_at >= '2027-01-01' and t.starts_at < '2028-01-01' and not t.test
  and not exists (select 1 from rounds r where r.tournament_id = t.id);
