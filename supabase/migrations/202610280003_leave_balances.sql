-- Leave balances per staff member and leave group, imported from Infotech's "Leave Consolidate
-- Report (Current Year)" and later kept up to date by AraOffice itself. Staff see their own
-- balance; the API reads it with the service key, so there is no row-level access policy.
create table if not exists public.hr_leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_group text not null,                      -- AL, ML, HOSP, MARRG, HAJUMR, UL ... (Infotech codes)
  year integer not null default 0,
  eligible numeric(6,2) not null default 0,
  brought_forward numeric(6,2) not null default 0,
  forfeit numeric(6,2) not null default 0,
  credit numeric(6,2) not null default 0,
  earn numeric(6,2) not null default 0,
  total numeric(6,2) not null default 0,
  taken numeric(6,2) not null default 0,
  balance numeric(6,2) not null default 0,
  advance numeric(6,2) not null default 0,
  bf_expiry date,
  source text not null default 'infotech',
  as_of date not null default current_date,
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_group, year)
);
create index if not exists hr_leave_balances_employee_idx on public.hr_leave_balances(employee_id);
alter table public.hr_leave_balances enable row level security;
