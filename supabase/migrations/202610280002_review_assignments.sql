-- Performance Review assignments: Office HR gives a review to a supervisor (which staff member,
-- which period, with remarks). It waits as 'pending' until the supervisor submits it, so the
-- score and rating columns may be empty until then. Nothing is dropped or rewritten.
alter table public.hr_reviews add column if not exists status text not null default 'submitted' check (status in ('pending', 'submitted'));
alter table public.hr_reviews add column if not exists employee_id uuid references public.hr_employees(id) on delete set null;
alter table public.hr_reviews add column if not exists assign_remarks text not null default '';
alter table public.hr_reviews add column if not exists assigned_by uuid references public.profiles(id) on delete set null;
alter table public.hr_reviews add column if not exists submitted_at timestamptz;
alter table public.hr_reviews alter column total_score drop not null;
alter table public.hr_reviews alter column overall drop not null;
create index if not exists hr_reviews_status_idx on public.hr_reviews(status, assessor_id);
create index if not exists hr_reviews_employee_idx on public.hr_reviews(employee_id);
