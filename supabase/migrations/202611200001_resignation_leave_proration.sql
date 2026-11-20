begin;

-- Preserve HR's original earned amount so removing/correcting a resignation is reversible.
alter table public.hr_leave_balances add column if not exists resignation_earned numeric(6,2);

create or replace function public.hr_resignation_earned(eligible numeric, balance_year integer, joined date, last_day date)
returns numeric language plpgsql immutable set search_path = public as $$
declare
  starts date;
  elapsed interval;
  months integer;
begin
  if last_day is null or balance_year <= 0 or last_day > make_date(balance_year, 12, 31) then return null; end if;
  starts := greatest(coalesce(joined, make_date(balance_year, 1, 1)), make_date(balance_year, 1, 1));
  if last_day < starts then return 0; end if;
  elapsed := age(last_day + 1, starts);
  months := greatest(0, least(12, extract(year from elapsed)::integer * 12 + extract(month from elapsed)::integer));
  return round(eligible * months / 12);
end;
$$;

create or replace function public.hr_prorate_resignation_balance()
returns trigger language plpgsql set search_path = public as $$
declare
  person record;
begin
  if new.leave_group <> 'AL' then return new; end if;
  select join_date, resign_date into person from public.hr_employees where id = new.employee_id;
  new.resignation_earned := public.hr_resignation_earned(new.eligible, new.year, person.join_date, person.resign_date);
  -- On removal of a last day, restore the original earning rules too.
  if new.resignation_earned is not null or (tg_op = 'UPDATE' and old.resignation_earned is not null) then
    new.total := new.brought_forward + new.credit + coalesce(new.resignation_earned, case when new.earn > 0 then new.earn else new.eligible end) - new.forfeit;
    new.balance := new.total - new.taken + new.advance;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger hr_leave_resignation_proration
before insert or update on public.hr_leave_balances
for each row execute function public.hr_prorate_resignation_balance();

create or replace function public.hr_refresh_resignation_leave()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.join_date is distinct from old.join_date or new.resign_date is distinct from old.resign_date then
    update public.hr_leave_balances set updated_at = now() where employee_id = new.id and leave_group = 'AL';
  end if;
  return new;
end;
$$;

create trigger hr_employee_resignation_leave
after update of join_date, resign_date on public.hr_employees
for each row execute function public.hr_refresh_resignation_leave();

-- Existing resigned staff receive the same correction as newly entered last days.
update public.hr_leave_balances b set updated_at = now()
from public.hr_employees e
where b.employee_id = e.id and b.leave_group = 'AL' and e.resign_date is not null
  and b.year > 0 and e.resign_date <= make_date(b.year, 12, 31);

commit;
