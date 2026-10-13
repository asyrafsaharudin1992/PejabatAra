-- Keep every attempt instead of overwriting one row per staff, so System Admin
-- can see each try's score and which questions were wrong. attempt_no numbers
-- a staff member's tries at one assessment (1, 2, 3…).
alter table public.assessment_attempts drop constraint if exists assessment_attempts_quiz_id_staff_id_key;
alter table public.assessment_attempts rename column attempt_count to attempt_no;
alter table public.assessment_attempts add constraint assessment_attempts_quiz_staff_no_key unique (quiz_id, staff_id, attempt_no);
