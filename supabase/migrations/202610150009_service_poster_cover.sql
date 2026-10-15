-- Admins pick which poster of a service is shown as its card thumbnail.
-- Services with no cover chosen keep using their first poster.
alter table public.service_catalog_items add column if not exists is_cover boolean not null default false;
