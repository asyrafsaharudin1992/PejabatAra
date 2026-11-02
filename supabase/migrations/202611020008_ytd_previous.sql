-- The year-to-date totals as they stood one month before the last month in hr_payroll_ytd, so that last month (October 2026) can be run again in
-- AraOffice and compared with the Infotech payslips.
alter table public.hr_payroll_ytd add column if not exists prev_as_of text not null default '';
alter table public.hr_payroll_ytd add column if not exists prev_wages numeric(12, 2) not null default 0;
alter table public.hr_payroll_ytd add column if not exists prev_kwsp_relief numeric(12, 2) not null default 0;
alter table public.hr_payroll_ytd add column if not exists prev_pcb_paid numeric(12, 2) not null default 0;
