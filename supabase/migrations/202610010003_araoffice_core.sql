-- AraOffice legacy workspace data, migrated from the Google Sheets backend.
-- This keeps the old Quality & Corporate workspace in the same Supabase project
-- as AraSpace, with staff read access and Superadmin-only configuration writes.

create table if not exists public.office_categories (
  name text primary key,
  color text not null default 'bg-slate-100 text-slate-600',
  created_at timestamptz not null default now()
);

create table if not exists public.office_tasks (
  id text primary key,
  category text not null references public.office_categories(name) on update cascade,
  title text not null,
  description text not null default '',
  frequency text not null default 'DAILY',
  frequency_detail text not null default '',
  subtasks jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.office_notes (
  id text primary key,
  title text not null default '',
  content text not null default '',
  due_date date,
  category text,
  completed boolean not null default false,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.office_task_history (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.office_tasks(id) on delete cascade,
  title text not null,
  date_completed date not null,
  remarks text not null default '',
  subtasks jsonb not null default '[]'::jsonb,
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (task_id, date_completed)
);

create table if not exists public.office_portal_links (
  id text primary key,
  folder text not null default 'General',
  title text not null,
  url text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.office_staff_settings (
  profile_id uuid primary key references auth.users(id) on delete cascade,
  off_days jsonb not null default '[]'::jsonb,
  leave_periods jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists office_tasks_category_idx on public.office_tasks(category);
create index if not exists office_history_date_idx on public.office_task_history(date_completed desc);

alter table public.office_categories enable row level security;
alter table public.office_tasks enable row level security;
alter table public.office_notes enable row level security;
alter table public.office_task_history enable row level security;
alter table public.office_portal_links enable row level security;
alter table public.office_staff_settings enable row level security;

create policy "signed in users read office categories" on public.office_categories for select
  using (auth.uid() is not null);
create policy "admins manage office categories" on public.office_categories for all
  using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');

create policy "signed in users read office tasks" on public.office_tasks for select
  using (auth.uid() is not null);
create policy "admins manage office tasks" on public.office_tasks for all
  using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');

create policy "signed in users read office notes" on public.office_notes for select
  using (auth.uid() is not null);
create policy "users create office notes" on public.office_notes for insert
  with check (auth.uid() is not null and (created_by = auth.uid() or public.current_role() = 'super_admin'));
create policy "owners and admins update office notes" on public.office_notes for update
  using (created_by = auth.uid() or public.current_role() = 'super_admin')
  with check (created_by = auth.uid() or public.current_role() = 'super_admin');
create policy "owners and admins delete office notes" on public.office_notes for delete
  using (created_by = auth.uid() or public.current_role() = 'super_admin');

create policy "signed in users read office history" on public.office_task_history for select
  using (auth.uid() is not null);
create policy "users create office history" on public.office_task_history for insert
  with check (auth.uid() = completed_by or public.current_role() = 'super_admin');
create policy "admins manage office history" on public.office_task_history for update
  using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');

create policy "signed in users read office links" on public.office_portal_links for select
  using (auth.uid() is not null);
create policy "admins manage office links" on public.office_portal_links for all
  using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');

create policy "users read own office settings" on public.office_staff_settings for select
  using (profile_id = auth.uid() or public.current_role() = 'super_admin');
create policy "users manage own office settings" on public.office_staff_settings for all
  using (profile_id = auth.uid() or public.current_role() = 'super_admin')
  with check (profile_id = auth.uid() or public.current_role() = 'super_admin');
