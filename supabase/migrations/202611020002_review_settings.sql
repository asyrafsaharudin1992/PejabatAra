-- Review requirements, editable by HR through the protected review API.
create table if not exists public.hr_review_settings (
  id smallint primary key default 1 check (id = 1),
  settings jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.hr_review_settings(id, settings) values (1, '{
  "automaticEnabled":true,
  "milestones":[
    {"id":"month-1","label":"1st Month","months":1,"enabled":true},
    {"id":"month-2","label":"2nd Month","months":2,"enabled":true},
    {"id":"month-3","label":"3rd Month","months":3,"enabled":true},
    {"id":"month-6","label":"6th Month","months":6,"enabled":true}
  ],
  "recurringEnabled":true,"recurringLabel":"Annual","recurringStartMonths":12,"recurringEveryMonths":12,
  "leadDays":30,"lookBackDays":30,"lookAheadDays":365
}'::jsonb) on conflict (id) do nothing;
alter table public.hr_review_settings enable row level security;
revoke all on public.hr_review_settings from anon, authenticated;
grant all on public.hr_review_settings to service_role;
