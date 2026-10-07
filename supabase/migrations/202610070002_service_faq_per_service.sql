alter table public.service_faqs add column if not exists service_id uuid references public.service_catalog_items(id) on delete cascade;
create index if not exists service_faqs_service_idx on public.service_faqs(service_id);
