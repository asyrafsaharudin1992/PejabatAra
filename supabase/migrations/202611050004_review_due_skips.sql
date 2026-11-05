-- Review 2 (monthly assessment for clinic assistants) is started by the Admin Klinikal when it is due: 2 weeks after the start of probation, then the 1st, 2nd and 3rd month.
-- An Admin Klinikal can mark a due assessment as "Not needed" (for example SK does not assess monthly); HR can see what was skipped. Read and written only by the API.
create table if not exists public.hr_review_skips (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  stage text not null,
  reason text not null default '',
  skipped_by text not null default '',
  skipped_by_employee_id uuid references public.hr_employees(id) on delete set null,
  skipped_at timestamptz not null default now(),
  unique (employee_id, stage)
);
alter table public.hr_review_skips enable row level security;
