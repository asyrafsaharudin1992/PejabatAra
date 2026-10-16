-- Staff incentive claims (memo HSO/MEMO/SM/2026/0012). Staff sign in like the
-- Assessment Room (name + staff code + last 4 IC digits) from their own phones,
-- add each procedure through the month and submit at month end. The branch's
-- Clinical Admin approves the claim or returns it to be corrected.
--
-- One claim per staff member per month. entries:
-- [{ id, date, patient, clinicId, outstanding, code, rm }]; codes and rates live in
-- the app (src/lib/incentiveCodes.ts), and the RM of each entry is fixed by the API.
create table if not exists public.incentive_claims (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.assessment_staff(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  branch text not null default '',
  entries jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'returned')),
  admin_note text not null default '',
  approved_by text not null default '',
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, month)
);
create index if not exists incentive_claims_branch_idx on public.incentive_claims(branch, month);

-- Only the service role (the API) reads or writes this table.
alter table public.incentive_claims enable row level security;
revoke all on public.incentive_claims from anon, authenticated;
