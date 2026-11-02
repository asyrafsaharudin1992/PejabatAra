-- Incentive pay: the approved incentive claims of one month, confirmed by HR for payment on the 16th of the month after. No KWSP, PERKESO, EIS or PCB is taken.
-- One row per staff member per claim month; once confirmed the amount no longer changes.
create table if not exists public.hr_incentive_pay (
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  claim_month text not null check (claim_month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount numeric(12, 2) not null default 0,
  procedures int not null default 0,              -- how many approved entries make up the amount
  paid_on date not null,
  confirmed_by text not null default '',
  confirmed_at timestamptz not null default now(),
  primary key (employee_id, claim_month)
);
alter table public.hr_incentive_pay enable row level security;
revoke all on public.hr_incentive_pay from anon, authenticated;
