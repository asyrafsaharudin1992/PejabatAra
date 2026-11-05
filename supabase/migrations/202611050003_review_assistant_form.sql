-- A second performance review form: the monthly assessment for clinic assistants (19 items marked out of 100, with a result for a contract locum or a probation).
-- `form_type` says which form a review uses; the marks and the result of the assistant form are kept in `assistant`.
alter table public.hr_reviews add column if not exists form_type text not null default 'standard' check (form_type in ('standard', 'assistant'));
alter table public.hr_reviews add column if not exists assistant jsonb not null default '{}'::jsonb;
