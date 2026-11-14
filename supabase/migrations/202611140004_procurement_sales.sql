-- Quantity sold per item, clinic and period (Plato Product Sales Report, Aggregate). Used for the Reorder suggestions in the CPO office.
create table if not exists public.proc_sales (
  plato_id text not null,
  location text not null check (location in ('KJ', 'SK')),
  period_from date not null,
  period_to date not null,
  qty numeric(12, 2) not null default 0,
  revenue numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  primary key (plato_id, location, period_from)
);
alter table public.proc_sales enable row level security;
revoke all on public.proc_sales from anon, authenticated;
