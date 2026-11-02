-- Year-to-date totals for each staff member, read off the Infotech pay run, so that the first AraOffice pay run can work out PCB
-- (the tax for the year is spread over the months, less what was already paid). One row per person per year; HR office only.
create table if not exists public.hr_payroll_ytd (
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  year int not null,
  as_of text not null default '',                  -- the last month the totals cover, for example 'Oct 2026'
  wages numeric(12, 2) not null default 0,         -- ordinary wages earned in the year
  kwsp_relief numeric(12, 2) not null default 0,   -- KWSP counted towards the tax relief (at most 4,000 for the year)
  pcb_paid numeric(12, 2) not null default 0,      -- PCB already deducted
  zakat_paid numeric(12, 2) not null default 0,
  source text not null default 'Infotech',
  updated_at timestamptz not null default now(),
  primary key (employee_id, year)
);
alter table public.hr_payroll_ytd enable row level security;
revoke all on public.hr_payroll_ytd from anon, authenticated;
