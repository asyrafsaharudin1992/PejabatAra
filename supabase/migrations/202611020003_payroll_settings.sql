-- Payroll settings of a staff member, read off Infotech: KWSP rate, PERKESO category, EIS, SKBBK, tax residency,
-- pay group, OT type, probation, flexi hours, rest day and default shift. One small record per person; only the HR
-- office reads it. Nothing in it is a pay figure.
alter table public.hr_employees add column if not exists payroll_settings jsonb not null default '{}'::jsonb;
