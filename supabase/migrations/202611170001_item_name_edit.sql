-- Procurement can rename an item on screen. `name` is what AraOffice shows; `name_plato` keeps the name Plato has (kept up to date by the import),
-- and `name_edited` tells the import not to overwrite the name Procurement chose.
alter table public.proc_items add column if not exists name_edited boolean not null default false;
alter table public.proc_items add column if not exists name_plato text;
