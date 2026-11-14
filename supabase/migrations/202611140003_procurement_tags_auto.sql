-- Marks items whose categories / active ingredients were filled in by scripts/tag-items.mjs (not typed by the CPO), so they can be checked.
alter table public.proc_items add column if not exists tags_auto boolean not null default false;
