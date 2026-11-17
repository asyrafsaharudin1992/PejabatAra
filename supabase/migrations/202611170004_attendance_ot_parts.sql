-- OT pay in parts. A day's OT can be paid at more than one rate (a rest day: a day pay, then 2.0x; a public holiday: 2 x ORP, then 3.0x).
-- parts = [{"minutes": 480, "multiplier": 2}, ...]. Payroll reads it when it is set, and otherwise uses approved_minutes x multiplier as before.
alter table public.hr_attendance_ot add column if not exists parts jsonb;
