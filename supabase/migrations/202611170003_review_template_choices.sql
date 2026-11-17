-- Templates can have "choose one" items (each item lists the choices and the score of each), a table of grades for the total score,
-- and can be for a candidate (an interview form) instead of a staff member. The choices and their scores live inside `items`.
alter table public.hr_review_templates add column if not exists grades jsonb not null default '[]'::jsonb;
alter table public.hr_review_templates add column if not exists subject text not null default 'staff' check (subject in ('staff', 'candidate'));
