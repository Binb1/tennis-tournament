-- Optional visual style per tournament (theme id from src/lib/theme.ts); null = the viewer's own choice.
alter table tournaments add column theme text;
