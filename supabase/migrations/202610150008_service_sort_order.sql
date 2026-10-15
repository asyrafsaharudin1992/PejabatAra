-- Admins can arrange service cards within a folder (Organize mode ◀ ▶).
-- Lower numbers come first; ties fall back to creation order.
alter table public.service_catalog_items add column if not exists sort_order integer not null default 0;
