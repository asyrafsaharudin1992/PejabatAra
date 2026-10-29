-- Files attached to leave (for example a medical certificate). The files live in a private Storage bucket and are only ever
-- opened through a link that expires after a minute, created by the API for someone allowed to see them.
create table if not exists public.hr_leave_attachments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.hr_employees(id) on delete cascade,       -- whose upload; null when HR uploaded it
  request_id uuid references public.hr_leave_requests(id) on delete cascade,   -- null until the leave request exists
  file_name text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 2097152),
  storage_path text not null,
  uploaded_by text not null default 'staff',                                   -- 'staff' or 'hr'
  created_at timestamptz not null default now()
);
create index if not exists hr_leave_attachments_request_idx on public.hr_leave_attachments(request_id);
create index if not exists hr_leave_attachments_unattached_idx on public.hr_leave_attachments(created_at) where request_id is null;
alter table public.hr_leave_attachments enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave-attachments', 'leave-attachments', false, 2097152, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
