-- 1) Daily work schedule (roster) per staff member, filled from the monthly duty roster that HR uploads.
--    A day counts as a working day for leave when works = true; when no row exists for a date the
--    weekly work_days on hr_employees is used instead. Read and written only by the API with the service key.
create table if not exists public.hr_roster (
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  work_date date not null,
  shift text not null default '',          -- AM-5, AM-9, PM, OFF, REST, NA, PH ... as written on the roster
  works boolean not null,                  -- true for a shift day, false for OFF / REST / NA / PH / resigned
  note text not null default '',           -- e.g. AL, UPL, MC already shown on the roster
  created_at timestamptz not null default now(),
  primary key (employee_id, work_date)
);
create index if not exists hr_roster_date_idx on public.hr_roster(work_date);
alter table public.hr_roster enable row level security;

-- 2) Two-level leave approval (as in Infotech): the supervisor first, then the final approver.
alter table public.hr_employees add column if not exists final_approver_id uuid references public.hr_employees(id) on delete set null;
alter table public.hr_leave_requests add column if not exists final_approver_id uuid references public.hr_employees(id) on delete set null;
alter table public.hr_leave_requests add column if not exists supervisor_decided_by uuid references public.hr_employees(id) on delete set null;
alter table public.hr_leave_requests add column if not exists supervisor_decided_at timestamptz;
alter table public.hr_leave_requests add column if not exists supervisor_note text not null default '';
alter table public.hr_leave_requests drop constraint if exists hr_leave_requests_status_check;
alter table public.hr_leave_requests add constraint hr_leave_requests_status_check
  check (status in ('pending', 'supervisor_approved', 'approved', 'rejected', 'cancelled'));
create index if not exists hr_leave_requests_final_idx on public.hr_leave_requests(final_approver_id, status);
