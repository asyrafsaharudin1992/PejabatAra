-- Credit hours (Kredit Hrs): hours a person earns by attending something outside their shift (reset hours, a meeting, a talk) and later uses to come in late
-- or leave early. Kept apart from Annual Leave. One row per movement in minutes: opening balance, hours earned, hours used (linked to the day it was used on),
-- or a correction. A person's balance is the sum of their rows. Read and written only by the API (RLS on, no policies).
create table if not exists public.hr_credit_hours (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  entry_date date not null default current_date,
  minutes integer not null check (minutes <> 0 and minutes between -6000 and 6000),
  kind text not null check (kind in ('opening', 'earn', 'use', 'adjust')),
  note text not null default '',
  use_id uuid references public.hr_credit_hour_use(id) on delete cascade,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists hr_credit_hours_person_idx on public.hr_credit_hours(employee_id, entry_date);
alter table public.hr_credit_hours enable row level security;
