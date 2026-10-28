-- Public holidays by holiday group (as in Infotech: SG-MNG management, SG-OPS operations, MLHL, NO-PH) and each
-- staff member's group. Leave days are not counted on a holiday of the person's group unless their duty roster
-- says they work it. Read and written only by the API with the service key.
create table if not exists public.hr_holidays (
  group_code text not null,
  holiday_date date not null,
  name text not null default '',
  primary key (group_code, holiday_date)
);
create index if not exists hr_holidays_date_idx on public.hr_holidays(holiday_date);
alter table public.hr_holidays enable row level security;
alter table public.hr_employees add column if not exists holiday_group text not null default '';
