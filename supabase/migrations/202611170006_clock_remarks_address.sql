-- A remark staff can add when they clock (for example "at the bank"), and the address worked out from the GPS point for staff who may clock from anywhere.
alter table public.hr_attendance_clocks add column if not exists remarks text not null default '';
alter table public.hr_attendance_clocks add column if not exists address text not null default '';
