-- Office HR staff profiles: the employee master that leave, attendance and payroll build on.
-- Holds personal and pay details (IC, address, bank, statutory numbers), so only the API
-- (service role) reads or writes it, for accounts with HR office access; every change is
-- written to hr_audit.
create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  -- The same person in the Assessment Room / Incentive Claims staff list, when linked.
  assessment_staff_id uuid references public.assessment_staff(id) on delete set null,
  company text not null check (company in ('KJ', 'SK')),       -- KJ- / SK- HSO Healthcare Sdn Bhd
  employee_code text not null,                                  -- e.g. ARASK0001, as in Infotech
  full_name text not null,
  -- Personal
  ic_no text not null default '',
  passport_no text not null default '',
  nationality text not null default 'Malaysian',
  gender text not null default '' check (gender in ('', 'Male', 'Female')),
  date_of_birth date,
  religion text not null default '',
  marital_status text not null default '' check (marital_status in ('', 'Single', 'Married', 'Divorced', 'Widowed')),
  spouse_working boolean,                                       -- PCB category
  children jsonb not null default '[]'::jsonb,                  -- [{ name, dateOfBirth, studying, disabled }] for PCB relief
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  emergency_name text not null default '',
  emergency_relation text not null default '',
  emergency_phone text not null default '',
  -- Employment
  branch text not null default '',                              -- Kajang / Seri Kembangan / …
  department text not null default '',                          -- OPERATION / OPR - DR RESIDENT / ADMIN
  designation text not null default '',
  employment_type text not null default 'Permanent' check (employment_type in ('Permanent', 'Contract', 'Part-time', 'Locum', 'Intern')),
  join_date date,
  confirm_date date,
  resign_date date,
  status text not null default 'Active' check (status in ('Active', 'Resigned', 'Terminated', 'Inactive')),
  leave_group text not null default '',                         -- AL / AL OPS …
  -- Pay and statutory
  basic_salary numeric(12,2) not null default 0,
  fixed_allowances jsonb not null default '[]'::jsonb,          -- [{ name, amount }]
  bank_name text not null default '',
  bank_account text not null default '',
  epf_no text not null default '',
  socso_no text not null default '',
  tax_no text not null default '',
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company, employee_code)
);
create index if not exists hr_employees_status_idx on public.hr_employees(company, status);

-- Who changed which profile field, from what to what.
create table if not exists public.hr_audit (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.hr_employees(id) on delete set null,
  action text not null,                                         -- create / update / delete / import
  changes jsonb not null default '{}'::jsonb,                   -- { field: [before, after] }
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists hr_audit_employee_idx on public.hr_audit(employee_id, changed_at desc);

alter table public.hr_employees enable row level security;
alter table public.hr_audit enable row level security;
revoke all on public.hr_employees, public.hr_audit from anon, authenticated;
