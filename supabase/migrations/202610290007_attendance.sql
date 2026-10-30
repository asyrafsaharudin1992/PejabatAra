-- Attendance: staff clock in and out on their own phone, checked against the places HR sets (a clinic, the office).
-- Everything is read and written only by the API with the service key (RLS on, no policies).

-- 1) Places where clocking is allowed (a clinic or the office), with a radius in metres.
create table if not exists public.hr_clock_places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null default '',            -- KJ or SK: that company's staff may clock here; '' for a place HR assigns by hand (the office)
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null default 150 check (radius_m between 20 and 2000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) Each clock in or out.
create table if not exists public.hr_attendance_clocks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  clock_at timestamptz not null default now(),
  kind text not null check (kind in ('in', 'out')),
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  place_id uuid references public.hr_clock_places(id) on delete set null,
  distance_m integer,
  within_place boolean,                         -- null when the person may clock anywhere
  device text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists hr_attendance_clocks_person_idx on public.hr_attendance_clocks(employee_id, clock_at desc);

-- 3) Shifts, as in the Infotech shift master: the start and end, the normal hours credited for a day (a shift with a lunch
--    break credits fewer hours than end minus start), and hours that differ on a weekday (0 = Sunday ... 6 = Saturday).
--    Roster codes are the KJ names (AM-9, AM-12, PM, AM-6) for staff and AM, PM, OH for doctors; office staff use the
--    Infotech code of their shift (for example MNG2). HR can add and change shifts. 'flexible' is for shifts where hours
--    worked, not the start time, count (set by HR).
create table if not exists public.hr_shift_times (
  code text not null,
  kind text not null default 'staff' check (kind in ('staff', 'doctor')),
  start_time time not null,
  end_time time not null,
  normal_hours numeric(4, 2),                  -- null: end minus start
  weekday_hours jsonb not null default '{}'::jsonb,
  flexible boolean not null default false,
  primary key (code, kind)
);
insert into public.hr_shift_times (code, kind, start_time, end_time, normal_hours, weekday_hours) values
  ('AM-9', 'staff', '09:00', '21:00', 12, '{}'),   -- Infotech ASCL1
  ('AM-12', 'staff', '12:00', '21:00', 9, '{}'),   -- ASCL2
  ('PM', 'staff', '21:00', '09:00', 12, '{}'),     -- ASCL3, a night shift: counted on the day it starts
  ('AM-6', 'staff', '09:00', '18:00', 9, '{}'),    -- ASCL4
  ('AM-5', 'staff', '08:00', '17:00', 8, '{"2": 9}'),
  ('KJADMN', 'staff', '08:00', '17:00', 8, '{"2": 9}'),  -- admin clinical: 8 hours, 9 on Tuesday
  ('MNG2', 'staff', '09:00', '18:00', 9, '{}'),
  ('AM', 'doctor', '08:00', '20:00', 12, '{}'),    -- DOCRSD
  ('PM', 'doctor', '20:00', '08:00', 12, '{}'),    -- DOCRS2
  ('OH', 'doctor', '09:00', '18:00', 9, '{}')      -- DR96
on conflict (code, kind) do nothing;

-- 4) Rules (one row), as in the Infotech shift settings. Lateness within the grace is not counted; past it the full minutes count.
--    Early out is not counted (Infotech deducts nothing for it). The smallest OT is for showing extra time to HR; OT itself is approved by HR.
create table if not exists public.hr_attendance_settings (
  id integer primary key default 1 check (id = 1),
  late_grace_min integer not null default 15,
  early_grace_min integer not null default 15,
  count_early_out boolean not null default false,
  ot_min_minutes integer not null default 60
);
insert into public.hr_attendance_settings (id) values (1) on conflict (id) do nothing;

-- 5) Per person: where they may clock, the one phone they clock from, whether they must clock, and their usual shift
--    (for people with no roster, such as office staff).
--    clock_required: 'full' = clock in and out; 'in_only' = clock in, counted as working even without a clock out;
--    'none' = does not clock (always counted as working on working days).
alter table public.hr_employees add column if not exists clock_mode text not null default 'places' check (clock_mode in ('places', 'anywhere'));
alter table public.hr_employees add column if not exists clock_place_ids uuid[] not null default '{}';
alter table public.hr_employees add column if not exists clock_device_hash text;
alter table public.hr_employees add column if not exists clock_device_at timestamptz;
alter table public.hr_employees add column if not exists clock_required text not null default 'full' check (clock_required in ('full', 'in_only', 'none'));
alter table public.hr_employees add column if not exists default_shift text not null default '';

alter table public.hr_clock_places enable row level security;
alter table public.hr_attendance_clocks enable row level security;
alter table public.hr_shift_times enable row level security;
alter table public.hr_attendance_settings enable row level security;
