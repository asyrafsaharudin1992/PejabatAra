-- Extra incentives that HR adds to the staff form or the doctor form (HR > Incentive > Staff form / Doctor form > Add incentive).
-- The codes from the memo stay in the app; these are added next to them. An incentive is hidden (active = false), never deleted,
-- so claims that already use it keep their name. Read and written by the server only.
create table if not exists public.hr_incentive_codes (
  id uuid primary key default gen_random_uuid(),
  form text not null default 'staff' check (form in ('staff', 'doctor')),
  code text not null,
  name text not null,
  rate numeric(10, 2) not null default 0,       -- RM per entry; 0 when staff type the amount themselves
  group_name text not null default '',
  own_amount boolean not null default false,    -- staff type the amount (like the trainer incentive)
  needs_patient boolean not null default false, -- staff form only: the entry needs the patient name and clinic ID
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  unique (form, code)
);
alter table public.hr_incentive_codes enable row level security;
revoke all on public.hr_incentive_codes from anon, authenticated;
