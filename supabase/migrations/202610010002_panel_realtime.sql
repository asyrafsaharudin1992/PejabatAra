-- Apply before enabling VITE_PANEL_REALTIME_ENABLED.
create table public.panel_drive_files (
  id text primary key,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);
create table public.panel_drive_channels (
  id uuid primary key,
  token_hash text not null,
  resource_id text,
  expires_at timestamptz not null
);
alter table public.panel_drive_files enable row level security;
alter table public.panel_drive_channels enable row level security;
revoke all on public.panel_drive_channels from anon, authenticated;
revoke all on public.panel_drive_files from anon, authenticated;
grant select on public.panel_drive_files to authenticated;
grant all on public.panel_drive_files, public.panel_drive_channels to service_role;
create policy "active staff read panel guides" on public.panel_drive_files for select to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));
-- All writes and channel secrets are service-role only.
alter publication supabase_realtime add table public.panel_drive_files;
