-- A staff member asks HR to change their own personal details from Individual Sign In (address, contact, spouse, children,
-- education and similar). HR approves or rejects; only an approval changes hr_employees. changes holds
-- { column: { from, to } }. Read and written only through the API.
create table if not exists public.hr_profile_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  changes jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default ''
);
create index if not exists hr_profile_requests_status_idx on public.hr_profile_requests(status, requested_at desc);
create index if not exists hr_profile_requests_employee_idx on public.hr_profile_requests(employee_id, requested_at desc);
alter table public.hr_profile_requests enable row level security;
revoke all on public.hr_profile_requests from anon, authenticated;
