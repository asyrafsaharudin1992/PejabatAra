-- Credit hours for a late arrival or an early leave (for example 3 hours to come in at 12pm). A record only, as in Infotech: it does not come off
-- the Annual Leave balance. HR records it on the day and that day's start or end is moved by the hours, so the person is not counted late or early. Read and written only by the API (RLS on, no policies).
create table if not exists public.hr_credit_hour_use (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  work_date date not null,
  kind text not null check (kind in ('late', 'early')),
  hours numeric(4, 2) not null check (hours > 0 and hours <= 12),
  days numeric(6, 2) not null check (days > 0),
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  unique (employee_id, work_date, kind)
);
create index if not exists hr_credit_hour_use_day_idx on public.hr_credit_hour_use(work_date, employee_id);
alter table public.hr_credit_hour_use enable row level security;
