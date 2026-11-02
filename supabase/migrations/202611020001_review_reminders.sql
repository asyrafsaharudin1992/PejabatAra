-- Future assessment reminders shared by the HR office. Access is through the HR API only.
create table if not exists public.hr_review_reminders (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  period_label text not null check (length(trim(period_label)) between 1 and 40),
  due_on date not null,
  notes text not null default '',
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hr_review_reminders_due_idx
  on public.hr_review_reminders(due_on) where completed_at is null and cancelled_at is null;
alter table public.hr_review_reminders enable row level security;
revoke all on public.hr_review_reminders from anon, authenticated;
grant all on public.hr_review_reminders to service_role;
