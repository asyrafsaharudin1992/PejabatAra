-- A supervisor can edit a review they submitted, on the day they submitted it and before HR has received it. Each edit keeps what the review said before, so nothing changes silently.
alter table public.hr_reviews add column if not exists edit_log jsonb not null default '[]'::jsonb;
