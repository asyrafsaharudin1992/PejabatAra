-- Rate changes now belong to a form: the staff (clinic assistant) form or the doctor form, whose codes overlap (both have 001, 002, ...).
alter table public.hr_incentive_rates add column if not exists form text not null default 'staff' check (form in ('staff', 'doctor'));
alter table public.hr_incentive_rates drop constraint if exists hr_incentive_rates_code_effective_from_key;
alter table public.hr_incentive_rates add constraint hr_incentive_rates_form_code_from_key unique (form, code, effective_from);

-- Doctor claims: a claim is on the staff form (clinic assistants) or the doctor form. Doctor claims skip Clinical Admin and are approved by Dr Syafiq in HR
-- (Dr Syafiq's own claim by Dr Asyraf).
alter table public.incentive_claims add column if not exists form text not null default 'staff' check (form in ('staff', 'doctor'));
