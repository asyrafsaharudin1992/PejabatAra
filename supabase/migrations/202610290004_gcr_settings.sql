-- GCR (Gantian Cuti Rehat) rules HR can change in the system, and each staff member's choice. Read and written only by the API.
-- One settings row: share of eligible leave that must be used, the most days that can be paid, and the carry-forward limit per leave category.
create table if not exists public.hr_gcr_settings (
  id int primary key default 1 check (id = 1),
  min_used_percent numeric(5,2) not null default 50 check (min_used_percent >= 0 and min_used_percent <= 100),
  max_days numeric(5,2) not null default 4 check (max_days >= 0 and max_days <= 60),
  carry_admin numeric(5,2) not null default 25 check (carry_admin >= 0 and carry_admin <= 366),
  carry_clinical numeric(5,2) not null default 20 check (carry_clinical >= 0 and carry_clinical <= 366),
  carry_parttime numeric(5,2) not null default 20 check (carry_parttime >= 0 and carry_parttime <= 366),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.hr_gcr_settings (id) values (1) on conflict (id) do nothing;
alter table public.hr_gcr_settings enable row level security;

-- Staff who chose to be paid for some of their unused eligible leave in a year (no row, or 0 days, means carry it forward).
create table if not exists public.hr_gcr_choices (
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  year int not null,
  days_paid numeric(5,2) not null default 0 check (days_paid >= 0),
  decided_by uuid,
  decided_at timestamptz not null default now(),
  primary key (employee_id, year)
);
alter table public.hr_gcr_choices enable row level security;
