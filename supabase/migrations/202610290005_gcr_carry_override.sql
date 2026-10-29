-- HR can change how many days a staff member carries forward at Year End (management approval), with the reason.
-- No value means the calculated figure is used.
alter table public.hr_gcr_choices add column if not exists carry_override numeric(5,2) check (carry_override is null or carry_override >= 0);
alter table public.hr_gcr_choices add column if not exists note text not null default '';
