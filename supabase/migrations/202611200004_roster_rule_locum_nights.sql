begin;

-- A new kind of roster rule: the night shift on chosen weekdays (shifts = {MON,FRI}) is left for a locum.
alter table public.hr_roster_rules drop constraint if exists hr_roster_rules_kind_check;
alter table public.hr_roster_rules add constraint hr_roster_rules_kind_check
  check (kind in ('not_together', 'min_cover', 'max_consecutive', 'not_shift', 'weekend_off', 'only_shift', 'no_day_after_night', 'locum_nights'));

insert into public.hr_roster_rules (kind, scope, shifts, company, enforce, note)
select 'locum_nights', 'doctors', '{MON,FRI}', 'KJ', 'warn', 'Monday and Friday nights are left for a locum'
where not exists (select 1 from public.hr_roster_rules where kind = 'locum_nights');

commit;
