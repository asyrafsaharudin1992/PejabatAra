begin;

-- Rules HR sets for the roster draft (who cannot work together, minimum cover, and so on).
-- People are kept by staff code (ARA0001) so a rule reads the same in the draft as on screen.
create table if not exists public.hr_roster_rules (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('not_together', 'min_cover', 'max_consecutive', 'not_shift', 'weekend_off', 'only_shift', 'no_day_after_night')),
  scope text not null default 'all' check (scope in ('all', 'doctors', 'staff')),  -- who a rule with no named person is about
  person_a text,                                   -- staff code; empty on "everyone" rules
  person_b text,                                   -- staff code; only for not_together
  shifts text[] not null default '{}',             -- shift codes the rule is about
  amount integer check (amount is null or amount between 0 and 50),
  company text check (company is null or company in ('KJ', 'SK')),
  enforce text not null default 'warn' check (enforce in ('warn', 'block')),
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.hr_roster_rules enable row level security;
revoke all on public.hr_roster_rules from anon, authenticated;

-- The rules that used to be written into the code.
insert into public.hr_roster_rules (kind, scope, person_a, person_b, shifts, amount, company, enforce, note)
select * from (values
  ('not_together', 'all', 'ARA0001', 'ARA0002', '{AM,OH}'::text[], null::int, null::text, 'warn', 'Asyraf and Syafiq must not work at the same time'),
  ('weekend_off', 'doctors', null, null, '{}', null, 'KJ', 'block', 'KJ doctors are off on Saturday and Sunday'),
  ('only_shift', 'all', 'ARA0044', null, '{OH}', null, null, 'block', 'Dr Hanis works office hours only'),
  ('no_day_after_night', 'all', null, null, '{}', null, null, 'warn', 'Recovery after a night shift'),
  ('max_consecutive', 'all', null, null, '{}', 6, null, 'warn', ''),
  ('min_cover', 'all', null, null, '{AM}', 1, null, 'warn', 'Day cover for each clinic'),
  ('min_cover', 'all', null, null, '{PM}', 1, null, 'warn', 'Night cover for each clinic')
) as seed(kind, scope, person_a, person_b, shifts, amount, company, enforce, note)
where not exists (select 1 from public.hr_roster_rules);

commit;
