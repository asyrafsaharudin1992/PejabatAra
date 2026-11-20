begin;

-- Rules HR sets for the roster draft (who cannot work together, minimum cover, and so on).
-- People are kept by staff code (ARA0001) so a rule reads the same in the draft as on screen.
create table if not exists public.hr_roster_rules (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('not_together', 'min_cover', 'max_consecutive', 'not_shift')),
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

-- The rule that was written into the code: Asyraf and Syafiq must not work at the same time
-- (the same shift, or a day shift AM with office hours OH).
insert into public.hr_roster_rules (kind, person_a, person_b, shifts, enforce, note)
select 'not_together', 'ARA0001', 'ARA0002', '{AM,OH}', 'warn', 'Asyraf and Syafiq must not work at the same time'
where not exists (select 1 from public.hr_roster_rules where kind = 'not_together' and person_a = 'ARA0001' and person_b = 'ARA0002');

commit;
