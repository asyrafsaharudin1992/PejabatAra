-- Performance Review: a review is now given to a person (their staff record) instead of a shared office account,
-- so each supervisor does their reviews in their own Individual Sign In. Nothing is dropped or rewritten.
alter table public.hr_reviews add column if not exists assessor_employee_id uuid references public.hr_employees(id) on delete set null;
create index if not exists hr_reviews_assessor_employee_idx on public.hr_reviews(assessor_employee_id, status);
