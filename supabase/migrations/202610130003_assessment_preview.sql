-- Preview accounts (e.g. management) sign in to the Assessment Room like staff
-- but can read every assessment, open or closed, with the correct answers
-- marked. They cannot submit, so they never appear in results.
alter table public.assessment_staff add column if not exists can_preview boolean not null default false;
