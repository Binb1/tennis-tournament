-- sync_runs for the calendar matching (sync-results fillExternalIds): "calendar" = the daily run that writes missing
-- tournaments.external_id, "calendar_dry" = an admin dry run (report only). Both count against the API budget.
alter table sync_runs drop constraint sync_runs_kind_check;
alter table sync_runs add constraint sync_runs_kind_check check (kind in ('results', 'draw', 'calendar', 'calendar_dry'));
