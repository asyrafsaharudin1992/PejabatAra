-- Employment history of a staff member (joining, changes of job title or department, increments, salary adjustments), taken from
-- Infotech's employment history. Only the HR office reads it; the staff API never touches this table.
create table if not exists public.hr_career_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  event_date date,
  kind text not null default 'Other',          -- Join Date, Designation, Department, Increment, Salary Adjustment, Hourly Rate, Other
  detail text not null default '',             -- what it changed, for example BASIC SALARY
  from_value text not null default '',
  to_value text not null default '',
  amount numeric(12, 2),                       -- the increment or bonus amount, when there is one
  source text not null default 'Infotech',
  created_at timestamptz not null default now()
);
create index if not exists hr_career_history_employee_idx on public.hr_career_history(employee_id, event_date desc);
alter table public.hr_career_history enable row level security;
revoke all on public.hr_career_history from anon, authenticated;
