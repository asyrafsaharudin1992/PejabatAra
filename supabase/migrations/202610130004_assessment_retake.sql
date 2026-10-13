-- Assessments are passed only with full marks. Staff who score below 100% may
-- retake straight away, as many times as needed; their row keeps the latest
-- score and counts the attempts. Once they reach 100% they cannot submit again.
alter table public.assessment_attempts add column if not exists attempt_count integer not null default 1;
alter table public.assessment_quizzes alter column pass_mark set default 100;
update public.assessment_quizzes set pass_mark = 100 where pass_mark <> 100;
