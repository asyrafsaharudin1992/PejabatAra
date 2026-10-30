-- Attendance, part two: OT approval and requests to correct a missed clock. Read and written only by the API (RLS on, no policies).

-- 1) OT. The system captures the extra time of a day (before the shift starts and after it ends, or a whole day worked on a day off);
--    HR approves or rejects each one and chooses the OT rate (1.0, 1.5, 2.0 or 3.0). The pay is worked out later from the person's basic salary.
create table if not exists public.hr_attendance_ot (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  work_date date not null,
  captured_minutes integer not null check (captured_minutes >= 0),
  status text not null check (status in ('approved', 'rejected')),
  approved_minutes integer not null default 0 check (approved_minutes >= 0),
  multiplier numeric(3, 1) not null default 1.5 check (multiplier in (1.0, 1.5, 2.0, 3.0)),
  note text not null default '',
  decided_by text not null default '',
  decided_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

-- 2) A request to correct a clock (for example a forgotten clock out). The supervisor or HR approves; approving adds the clock.
create table if not exists public.hr_attendance_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  work_date date not null,
  in_time time,                                  -- Malaysia time; either may be empty
  out_time time,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approver_id uuid references public.hr_employees(id) on delete set null,
  decided_by text not null default '',
  decided_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists hr_attendance_requests_status_idx on public.hr_attendance_requests(status, created_at desc);
create index if not exists hr_attendance_requests_person_idx on public.hr_attendance_requests(employee_id, work_date);

alter table public.hr_attendance_ot enable row level security;
alter table public.hr_attendance_requests enable row level security;
