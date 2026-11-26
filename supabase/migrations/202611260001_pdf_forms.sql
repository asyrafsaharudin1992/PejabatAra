-- Staff communication: forms made from an imported PDF. HR places fields on the pages; each time a form is sent about a staff member, one row keeps the
-- layout as it was sent, who fills each part, and the answers. The PDFs are in the private Storage bucket hr-misc (folder pdf-forms).
-- Read and written only by the API (row level security on, no policies).
create table if not exists public.hr_pdf_forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_path text not null,
  file_name text not null default '',
  roles jsonb not null default '[]'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_pdf_form_cases (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.hr_pdf_forms(id),
  employee_id uuid not null references public.hr_employees(id),
  title text not null,
  roles jsonb not null,
  fields jsonb not null,
  -- The people who have a part (role id and name), kept apart so lists and the red number are read without the layout.
  parts jsonb not null default '[]'::jsonb,
  file_path text not null,
  signers jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  done jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  due_on date,
  sent_by text not null default '',
  sent_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists hr_pdf_form_cases_one_open on public.hr_pdf_form_cases (form_id, employee_id) where status = 'open';
create index if not exists hr_pdf_form_cases_open on public.hr_pdf_form_cases (status, employee_id);

alter table public.hr_pdf_forms enable row level security;
alter table public.hr_pdf_form_cases enable row level security;
