-- Historical task snapshots must survive deletion of their original task.
-- Preserve the original completion time and repeated completions on one day.
begin;
alter table public.office_task_history
  drop constraint if exists office_task_history_task_id_fkey;
alter table public.office_task_history
  drop constraint if exists office_task_history_task_id_date_completed_key;
alter table public.office_task_history
  alter column date_completed type timestamptz
  using date_completed::timestamp at time zone 'UTC';
commit;
