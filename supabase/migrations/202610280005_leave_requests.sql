-- Leave requests made from Individual Sign In, approved by the staff member's leave approver
-- (set by HR on the staff profile). Approving a request also takes the days off the balance in
-- hr_leave_balances. Read and written only by the API with the service key.
alter table public.hr_employees add column if not exists leave_approver_id uuid references public.hr_employees(id) on delete set null;
create index if not exists hr_employees_leave_approver_idx on public.hr_employees(leave_approver_id);
-- The weekdays a person normally works (0 = Sunday ... 6 = Saturday); leave days are counted on these only.
alter table public.hr_employees add column if not exists work_days smallint[] not null default '{1,2,3,4,5,6}';

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,   -- who is asking
  approver_id uuid references public.hr_employees(id) on delete set null,           -- who decides
  leave_type text not null,                                                         -- AL, EL, ML, HOSP, MARRG, HAJUMR, UL
  leave_group text not null,                                                        -- the balance it comes off (EL comes off AL)
  start_date date not null,
  end_date date not null,
  half_day text check (half_day in ('AM', 'PM')),
  days numeric(5,1) not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.hr_employees(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists hr_leave_requests_employee_idx on public.hr_leave_requests(employee_id, start_date desc);
create index if not exists hr_leave_requests_approver_idx on public.hr_leave_requests(approver_id, status);
alter table public.hr_leave_requests enable row level security;
