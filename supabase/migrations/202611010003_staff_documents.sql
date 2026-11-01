-- Documents on a staff profile (a copy of the IC, a certificate and the like). Staff add their own from Individual Sign In; HR can add
-- and remove any. The files live in a private Storage bucket and are only opened through a link that expires after a minute, made by the
-- API for someone allowed to see them.
create table if not exists public.hr_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  kind text not null default 'Other',
  file_name text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 2097152),
  storage_path text not null,
  uploaded_by text not null default 'staff',   -- 'staff' or 'hr'
  created_at timestamptz not null default now()
);
create index if not exists hr_documents_employee_idx on public.hr_documents(employee_id, created_at desc);
alter table public.hr_documents enable row level security;
revoke all on public.hr_documents from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-documents', 'staff-documents', false, 2097152, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
