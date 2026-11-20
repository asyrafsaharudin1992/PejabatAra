begin;

-- A roster draft HR saved to carry on later (the settings, their own changes, text and colours of the sheet). It is not the live roster.
create table if not exists public.hr_roster_drafts (
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  grp text not null check (grp in ('staff', 'doctors')),
  company text not null default '' check (company in ('', 'KJ', 'SK')),
  payload jsonb not null,
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (month, grp, company)
);
alter table public.hr_roster_drafts enable row level security;
revoke all on public.hr_roster_drafts from anon, authenticated;

commit;
