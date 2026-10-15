-- Office Clinical Administration: each branch's Clinical Admin fills the daily
-- checklist here and sends it to WhatsApp with one button. Orders, vaccine
-- bookings and ad hoc tasks carry over from day to day until they are done,
-- so they no longer have to be retyped. COO sees every branch.
--
-- The checklist items and monthly tasks live in the app (src/OfficeClinical.tsx);
-- these tables only hold what was ticked and the carried-over lists.

-- One report per branch per day. checks: { itemId: { status: 'done' | 'pending' | 'na', note } }.
create table if not exists public.clinical_reports (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  report_date date not null,
  prepared_by text not null default '',
  checks jsonb not null default '{}'::jsonb,
  issues text not null default '',
  staffing text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (branch_id, report_date)
);

-- items: [{ name, qty, note, receivedOn }]; receivedOn is null until it arrives.
-- closed_at is set once every item has arrived or the order is cancelled.
create table if not exists public.clinical_orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  supplier text not null,
  ordered_on date not null,
  approved_by text not null default '',
  items jsonb not null default '[]'::jsonb,
  note text not null default '',
  cancelled boolean not null default false,
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clinical_orders_open_idx on public.clinical_orders(branch_id) where closed_at is null;

-- Patient vaccine bookings. Only the last 4 IC digits are kept, never the full IC.
create table if not exists public.clinical_vaccine_bookings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  patient_name text not null,
  ic_last4 text not null default '' check (ic_last4 ~ '^[0-9]{0,4}$'),
  vaccines text not null,
  deposit numeric(10,2) not null default 0,
  appointment_on date,
  status text not null default 'waiting' check (status in ('waiting', 'reserved', 'done', 'cancelled')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clinical_bookings_branch_idx on public.clinical_vaccine_bookings(branch_id, status);

create table if not exists public.clinical_tasks (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  title text not null,
  details text not null default '',
  created_on date not null default current_date,
  done_on date,
  created_at timestamptz not null default now()
);
create index if not exists clinical_tasks_branch_idx on public.clinical_tasks(branch_id, done_on);

-- Monthly tasks ticked off per branch; month is 'YYYY-MM', task_id matches the app's list.
create table if not exists public.clinical_monthly_done (
  branch_id uuid not null references public.branches(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  task_id text not null,
  done_on date not null default current_date,
  primary key (branch_id, month, task_id)
);

-- Only the service role (the API) reads or writes these tables.
alter table public.clinical_reports enable row level security;
alter table public.clinical_orders enable row level security;
alter table public.clinical_vaccine_bookings enable row level security;
alter table public.clinical_tasks enable row level security;
alter table public.clinical_monthly_done enable row level security;
revoke all on public.clinical_reports, public.clinical_orders, public.clinical_vaccine_bookings, public.clinical_tasks, public.clinical_monthly_done from anon, authenticated;

-- Each branch's shared Clinical Admin account works on its own branch only.
insert into public.staff_branches (profile_id, branch_id, is_primary)
select p.id, b.id, true from public.profiles p join public.branches b
  on (p.full_name = 'Clinical Admin KJ' and b.name = 'Kajang') or (p.full_name = 'Clinical Admin SK' and b.name = 'Seri Kembangan')
on conflict (profile_id, branch_id) do nothing;
