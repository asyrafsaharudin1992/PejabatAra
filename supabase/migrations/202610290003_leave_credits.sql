-- Every Annual Leave credit HR gives (public holiday replacement, training day, off-in-lieu and so on), one row each,
-- so the Credit Annual Leave Report can list who received what and when. The total is still kept in
-- hr_leave_balances.credit; this table is the history behind it. Read and written only by the API with the service key.
create table if not exists public.hr_leave_credits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_group text not null default 'AL',
  credit_date date not null,
  days numeric(5,2) not null check (days > 0),
  remarks text not null default '',
  source text not null default 'AraOffice',   -- 'Infotech' for credits copied from Infotech
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists hr_leave_credits_employee_idx on public.hr_leave_credits(employee_id, credit_date);
create index if not exists hr_leave_credits_date_idx on public.hr_leave_credits(credit_date);
alter table public.hr_leave_credits enable row level security;
