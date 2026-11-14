-- Procurement (CPO office): a read-only copy of the Plato inventory, stock, suppliers and supplier orders.
-- Re-imported from Plato exports with scripts/import-plato.mjs until the clinic's own CMS takes over.
-- kind: 'purchased' = appears on a supplier order, 'stocked' = tracked stock but never ordered this year, 'service' = not a physical item.
create table if not exists public.proc_items (
  plato_id text primary key,
  type text not null default '',
  category text not null default '',
  name text not null default '',
  description text not null default '',
  unit text not null default '',
  supplier text not null default '',
  selling_price numeric(12, 2),
  cost_price numeric(12, 3),
  track_stock boolean not null default false,
  inactive jsonb not null default '{}'::jsonb,   -- { all, KJ, SK, SY }
  low_stock jsonb not null default '{}'::jsonb,  -- { KJ, SK, SY } reorder levels
  kind text not null default 'service' check (kind in ('purchased', 'stocked', 'service')),
  imported_at timestamptz not null default now()
);
create table if not exists public.proc_stock (
  plato_id text not null,
  location text not null check (location in ('KJ', 'SK', 'SY')),
  qty numeric(12, 2) not null default 0,
  uom text not null default '',
  cost_unit numeric(12, 3),
  total_cost numeric(14, 3),
  expiry text,                                   -- YYYYMM, the earliest batch
  as_of date not null,
  primary key (plato_id, location)
);
create table if not exists public.proc_suppliers (
  name text primary key,
  category text not null default '',
  mobile text not null default '',
  phone text not null default '',
  fax text not null default '',
  person text not null default '',
  email text not null default '',
  address text not null default ''
);
create table if not exists public.proc_orders (
  id uuid primary key default gen_random_uuid(),
  order_date date not null,
  location text not null,
  supplier text not null default '',
  po_no text not null default '',
  invoice_no text not null default '',
  status text not null default '',               -- Draft / Permanent
  subtotal numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  paid boolean not null default false,
  pay_mode text not null default '',
  ref text not null default '',
  due_date date,                                 -- read from the ref text when it says DUE DATE
  unique (order_date, location, supplier, invoice_no)
);
create index if not exists proc_orders_date_idx on public.proc_orders (order_date desc);
create table if not exists public.proc_order_lines (
  order_id uuid not null references public.proc_orders(id) on delete cascade,
  line int not null,
  plato_id text,
  item_name text not null default '',
  batch text not null default '',
  expiry text,
  qty_ordered numeric(12, 2) not null default 0,
  qty_bonus numeric(12, 2) not null default 0,
  qty_received numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0,
  unit_cost numeric(12, 3),
  primary key (order_id, line)
);
alter table public.proc_items enable row level security;
alter table public.proc_stock enable row level security;
alter table public.proc_suppliers enable row level security;
alter table public.proc_orders enable row level security;
alter table public.proc_order_lines enable row level security;
revoke all on public.proc_items, public.proc_stock, public.proc_suppliers, public.proc_orders, public.proc_order_lines from anon, authenticated;
