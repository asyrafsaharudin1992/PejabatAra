-- Monthly tasks can be marked Done, Not done or Not needed (like the daily checklist).
-- Existing rows were all ticks, so they stay 'done'.
alter table public.clinical_monthly_done
  add column if not exists status text not null default 'done' check (status in ('done', 'pending', 'na'));
