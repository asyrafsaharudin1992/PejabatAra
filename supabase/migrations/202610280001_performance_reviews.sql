-- Performance Review: a supervisor (CEO, CFO, COO, CHRO, Clinical Admin) fills in the
-- monthly review of a staff member; Office HR reads the results and records receipt.
-- Reviews hold personal and appraisal details, so there is no row-level access policy:
-- they are read and written only by the API with the service key.
create table if not exists public.hr_reviews (
  id uuid primary key default gen_random_uuid(),
  staff_name text not null,
  employee_code text not null default '',
  position text not null default '',
  department text not null default '',
  assessor_id uuid references public.profiles(id) on delete set null,
  assessor_name text not null default '',
  period_start date,
  period_end date,
  period_label text not null default '',
  ratings jsonb not null default '{}'::jsonb,
  total_score numeric(3,2) not null,
  overall text not null,
  improvement text not null default '',
  training text not null default '',
  employee_comments text not null default '',
  pip text not null default 'not_required' check (pip in ('not_required', 'required')),
  pip_remarks text not null default '',
  pip_start date,
  hod_name text not null default '',
  hr_received_on date,
  hr_received_by text not null default '',
  hr_remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hr_reviews_created_idx on public.hr_reviews(created_at desc);
alter table public.hr_reviews enable row level security;
