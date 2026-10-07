alter table public.service_catalog_items add column if not exists tags text not null default '';
