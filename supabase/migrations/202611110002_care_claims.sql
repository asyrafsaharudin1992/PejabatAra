-- AraCare: the monthly Care Coordination Allowance (RM 100). It is separate from the normal incentive claim.
-- The coordinator fills the AraCare form, the COO (PIC Klinik) checks the KPIs, and an approved claim goes straight to HR to be received.
-- Read and written by the server only.
create table if not exists public.care_staff (
  staff_id uuid primary key references public.assessment_staff(id) on delete cascade,
  added_by text not null default '',
  created_at timestamptz not null default now()
);
alter table public.care_staff enable row level security;
revoke all on public.care_staff from anon, authenticated;

create table if not exists public.care_claims (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.assessment_staff(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  branch text not null default '',
  roles text[] not null default '{}',
  other_role text not null default '',
  items jsonb not null default '[]'::jsonb,
  amount numeric(10, 2) not null default 100,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'returned')),
  kpi jsonb,
  decision_note text not null default '',
  decided_by text not null default '',
  decided_at timestamptz,
  hr_submitted_at timestamptz,
  hr_received_at timestamptz,
  hr_received_by text not null default '',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (staff_id, month)
);
create index if not exists care_claims_month_idx on public.care_claims(month);
alter table public.care_claims enable row level security;
revoke all on public.care_claims from anon, authenticated;
