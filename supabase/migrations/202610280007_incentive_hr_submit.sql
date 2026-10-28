-- Clinical Admin approves a month's incentive claims, then sends the approved ones to HR. HR sees only claims
-- that have been sent and marks each one received. Returning a claim to the staff member takes it back from HR
-- (the API clears these columns), but not once HR has received it.
alter table public.incentive_claims add column if not exists hr_submitted_at timestamptz;
alter table public.incentive_claims add column if not exists hr_submitted_by text not null default '';
alter table public.incentive_claims add column if not exists hr_received_at timestamptz;
alter table public.incentive_claims add column if not exists hr_received_by text not null default '';
create index if not exists incentive_claims_hr_idx on public.incentive_claims(hr_submitted_at) where hr_submitted_at is not null;
