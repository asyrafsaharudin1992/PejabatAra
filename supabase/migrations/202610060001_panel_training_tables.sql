-- Panel Training is operational data, not workspace configuration. Keep each
-- panel and Drive guide as an addressable record so imports can be reviewed,
-- linked and retained independently of the UI.

create table if not exists public.panels (
  id text primary key,
  name text not null,
  availability jsonb not null default '[]'::jsonb,
  portal_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.panel_guides (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  file_name text not null,
  drive_url text not null,
  panel_id text references public.panels(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'linked', 'archived')),
  detected_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists panel_guides_panel_idx on public.panel_guides(panel_id);
create index if not exists panel_guides_status_idx on public.panel_guides(status);

alter table public.panels enable row level security;
alter table public.panel_guides enable row level security;

do $$ begin
  create policy "active staff read panels" on public.panels for select
    using (exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "active staff read linked panel guides" on public.panel_guides for select
    using (status = 'linked' and exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admins manage panels" on public.panels for all
    using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admins manage panel guides" on public.panel_guides for all
    using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');
exception when duplicate_object then null;
end $$;

-- One-time migration of the existing shared workspace configuration.
insert into public.panels (id, name, availability, portal_url)
select row->>'id', row->>'panel', coalesce(row->'availability', '[]'::jsonb), coalesce(row->>'portalUrl', '')
from public.portal_state state
cross join lateral jsonb_array_elements(state.payload->'panelRows') row
where state.state_key = 'ca_workspace'
on conflict (id) do update set
  name = excluded.name,
  availability = excluded.availability,
  portal_url = excluded.portal_url,
  updated_at = now();

insert into public.panel_guides (drive_file_id, file_name, drive_url, panel_id, status, decided_at)
select
  regexp_replace(row->>'guideUrl', '^.*/d/([^/]+)/.*$', '\1'),
  coalesce(row->>'panel', 'Imported panel guide') || '.pdf',
  row->>'guideUrl',
  row->>'id',
  'linked',
  now()
from public.portal_state state
cross join lateral jsonb_array_elements(state.payload->'panelRows') row
where state.state_key = 'ca_workspace'
  and coalesce(row->>'guideUrl', '') like '%/file/d/%'
on conflict (drive_file_id) do nothing;
