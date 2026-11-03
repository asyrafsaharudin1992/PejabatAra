-- Attendance / OT requests, Infotech's way: staff ask for corrected clocks and/or OT hours (with a draft), the supervisor approves first,
-- then HR confirms. Only HR's confirmation adds the clocks and the OT that Payroll reads. Read and written only by the API.
alter table public.hr_attendance_requests add column if not exists ot_minutes integer not null default 0 check (ot_minutes >= 0 and ot_minutes <= 1440);
alter table public.hr_attendance_requests add column if not exists remarks text not null default '';
alter table public.hr_attendance_requests add column if not exists supervisor_decided_by text not null default '';
alter table public.hr_attendance_requests add column if not exists supervisor_decided_at timestamptz;
alter table public.hr_attendance_requests add column if not exists supervisor_note text not null default '';
alter table public.hr_attendance_requests add column if not exists ot_multiplier numeric(3, 1) check (ot_multiplier is null or ot_multiplier in (1.0, 1.5, 2.0, 3.0));

alter table public.hr_attendance_requests drop constraint if exists hr_attendance_requests_status_check;
alter table public.hr_attendance_requests add constraint hr_attendance_requests_status_check
  check (status in ('draft', 'pending', 'supervisor_approved', 'approved', 'rejected', 'cancelled'));
