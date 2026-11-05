-- Changes to the incentive rates in the memo (src/lib/incentiveCodes.ts holds the starting rates). HR sets a new rate for a code from a date;
-- an entry is paid at the rate in force on the date of the procedure, and entries already added keep the rate they were saved with.
-- Read and written only by the API (RLS on, no policies).
create table if not exists public.hr_incentive_rates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  rate numeric(8, 2) not null check (rate > 0 and rate <= 2000),
  effective_from date not null,
  set_by text not null default '',
  created_at timestamptz not null default now(),
  unique (code, effective_from)
);
alter table public.hr_incentive_rates enable row level security;
