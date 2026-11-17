-- Public app settings (support contact numbers). Values are added by an administrator in the SQL editor, e.g.
--   insert into public.app_settings(key, value) values ('support_phone', '+963...'), ('support_whatsapp', '+963...')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
create table if not exists public.app_settings (
  key text primary key,
  value text not null check (char_length(value) between 1 and 200),
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_read_support on public.app_settings;
create policy app_settings_read_support on public.app_settings
  for select to authenticated using (key in ('support_phone', 'support_whatsapp'));
revoke all on public.app_settings from public, anon, authenticated;
grant select on public.app_settings to authenticated;
