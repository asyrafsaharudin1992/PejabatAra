-- The company leave policy gives annual leave by staff category and years of service (administrative officers
-- 15/20/25, doctors and permanent clinic assistants 8/12/16, part-time doctors and clinic assistants 6/8/11) and
-- sick leave by years of service (14/18/22). This records each person's category so HR can check the balances
-- against the policy. Empty = not set yet.
alter table public.hr_employees add column if not exists leave_policy text not null default '' check (leave_policy in ('', 'admin', 'clinical', 'parttime'));
