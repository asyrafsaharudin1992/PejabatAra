-- Yearly tax figures per staff member (the Borang EA), imported from Infotech for years before AraOffice ran payroll.
-- The current year is not stored here: it is added up from the locked payslips.
create table if not exists public.hr_ea_annual (
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  gross_wages numeric(12, 2) not null default 0,   -- B1(A) gross salary, wages, leave pay and overtime
  fees_bonus numeric(12, 2) not null default 0,    -- B1(B) fees (incl. director fees), commission, bonus
  allowances numeric(12, 2) not null default 0,    -- B1(C) tips, perquisites, other allowances
  mtd numeric(12, 2) not null default 0,           -- D1 monthly tax deduction (PCB) paid to LHDN
  child_relief numeric(12, 2) not null default 0,  -- D6 qualifying child relief
  kwsp numeric(12, 2) not null default 0,          -- E1 employee EPF
  socso numeric(12, 2) not null default 0,         -- E2 employee SOCSO
  eis numeric(12, 2) not null default 0,           -- E2 employee EIS
  details jsonb not null default '[]'::jsonb,      -- the detail lines of the form (name, tax exemption, CP58, amount)
  source text not null default 'Infotech',
  imported_at timestamptz not null default now(),
  primary key (employee_id, year)
);
alter table public.hr_ea_annual enable row level security;
revoke all on public.hr_ea_annual from anon, authenticated;
