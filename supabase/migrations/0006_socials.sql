-- Optional public social handles (X / Twitter and Instagram) on profiles.
-- Stored without "@" or URL; the app normalises input before saving.
alter table profiles
  add column x_handle text,
  add column instagram_handle text;

alter table profiles
  add constraint profiles_x_handle_format check (x_handle is null or x_handle ~ '^[A-Za-z0-9_.]{1,30}$'),
  add constraint profiles_instagram_handle_format check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9_.]{1,30}$');

-- Users may write their own handles (RLS already limits writes to their own row).
grant insert (x_handle, instagram_handle), update (x_handle, instagram_handle) on profiles to authenticated;
