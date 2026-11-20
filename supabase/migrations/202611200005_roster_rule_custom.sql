begin;

-- A custom roster rule: who (a person or a group), on which weekdays (none = every day), which shifts, and what is wanted of them.
alter table public.hr_roster_rules add column if not exists condition text not null default '' check (condition in ('', 'never', 'must', 'min', 'max'));
alter table public.hr_roster_rules drop constraint if exists hr_roster_rules_kind_check;
alter table public.hr_roster_rules add constraint hr_roster_rules_kind_check
  check (kind in ('not_together', 'min_cover', 'max_consecutive', 'not_shift', 'weekend_off', 'only_shift', 'no_day_after_night', 'locum_nights', 'custom'));

commit;
