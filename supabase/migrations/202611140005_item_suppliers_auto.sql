-- Suppliers added automatically from the order history (scripts/seed-item-suppliers.mjs) are marked auto, until the CPO saves the item.
alter table public.proc_item_suppliers add column if not exists auto boolean not null default false;
