create table if not exists public.service_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.service_catalog_items (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.service_folders(id) on delete set null,
  storage_path text not null unique,
  title text not null,
  summary text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_faqs (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.service_folders(id) on delete set null,
  question text not null,
  answer text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.service_folders enable row level security;
alter table public.service_catalog_items enable row level security;
alter table public.service_faqs enable row level security;

do $$ begin
  create policy "active staff read service folders" on public.service_folders for select using (exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));
  create policy "active staff read service items" on public.service_catalog_items for select using (active and exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));
  create policy "active staff read service faqs" on public.service_faqs for select using (active and exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));
  create policy "admins manage service folders" on public.service_folders for all using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');
  create policy "admins manage service items" on public.service_catalog_items for all using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');
  create policy "admins manage service faqs" on public.service_faqs for all using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');
exception when duplicate_object then null;
end $$;

insert into public.service_folders (name, description) values ('All services', 'Official clinic service posters') on conflict (name) do nothing;

insert into public.service_catalog_items (folder_id, storage_path, title, summary)
select folder.id, poster || '.png', 'Service guide ' || lpad(row_number() over ()::text, 2, '0'), 'Open the official poster for current service information.'
from public.service_folders folder
cross join unnest(array['4','9','10','17','18','19','20','24','27','31','33','34','35','39','40','41','42','43','44','45','46','47','48','49','50','51']) poster
where folder.name = 'All services'
on conflict (storage_path) do nothing;
