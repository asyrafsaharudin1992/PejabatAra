-- What Plato cannot do, kept in AraOffice: several categories per item (combo medicines, several indications), the active ingredient(s), and several suppliers.
-- The Plato import never writes these columns, so a re-import leaves them as they are.
alter table public.proc_items add column if not exists categories text[] not null default '{}';
alter table public.proc_items add column if not exists ingredients text[] not null default '{}';
update public.proc_items set categories = array[category] where category <> '' and categories = '{}';
create table if not exists public.proc_item_suppliers (
  plato_id text not null references public.proc_items(plato_id) on delete cascade,
  supplier text not null,
  preferred boolean not null default false,
  note text not null default '',
  primary key (plato_id, supplier)
);
create index if not exists proc_item_suppliers_supplier_idx on public.proc_item_suppliers (supplier);
alter table public.proc_item_suppliers enable row level security;
revoke all on public.proc_item_suppliers from anon, authenticated;
