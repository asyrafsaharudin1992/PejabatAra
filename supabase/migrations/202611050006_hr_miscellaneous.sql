-- HR > Miscellaneous: important links, posters (images HR can share straight to WhatsApp) and notes. One row per item; a poster's image is in the private
-- Storage bucket hr-misc. Read and written only by the API (RLS on, no policies).
create table if not exists public.hr_misc_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('link', 'poster', 'note')),
  title text not null,
  url text not null default '',
  body text not null default '',
  file_path text not null default '',
  file_name text not null default '',
  content_type text not null default '',
  size_bytes integer not null default 0,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hr_misc_items enable row level security;
insert into storage.buckets (id, name, public) values ('hr-misc', 'hr-misc', false) on conflict (id) do nothing;
