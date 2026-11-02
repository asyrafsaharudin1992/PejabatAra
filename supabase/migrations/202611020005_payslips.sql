-- One payslip per staff member per month. A draft can be recalculated; a locked one is final and feeds the next month's year-to-date totals.
create table if not exists public.hr_payslips (
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  status text not null default 'draft' check (status in ('draft', 'locked')),
  inputs jsonb not null default '{}'::jsonb,     -- what HR entered for the month: OT, rest-day pay, unpaid leave and so on
  result jsonb not null default '{}'::jsonb,     -- the pay worked out from it
  locked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (employee_id, year, month)
);
alter table public.hr_payslips enable row level security;
revoke all on public.hr_payslips from anon, authenticated;
