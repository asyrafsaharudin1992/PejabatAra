-- Calendar visibility verified read-only against Infotech on 29 October 2026.
-- Empty array = own company and department; explicit companies = all departments.
begin;
alter table public.hr_employees add column if not exists leave_calendar_companies text[] not null default '{}';
alter table public.hr_employees add constraint hr_employees_leave_calendar_companies_check
  check (leave_calendar_companies <@ array['KJ', 'SK']::text[]);

with verified(company, employee_code, companies) as (values
  ('KJ', 'ARA0001', array['KJ','SK']),
  ('KJ', 'ARA0002', array['KJ','SK']),
  ('KJ', 'ARA0035', array['KJ','SK']),
  ('KJ', 'ARA0041', array['KJ']),
  ('KJ', 'ARA0061', array['KJ','SK']),
  ('SK', 'ARASK0001', array['KJ','SK']),
  ('SK', 'ARASK0002', array['KJ','SK']),
  ('SK', 'ARASK0060', array['SK']),
  ('SK', 'ARASK0058', array['KJ','SK']),
  ('SK', 'ARASK0036', array['KJ','SK'])
), changed as (
  update public.hr_employees e set leave_calendar_companies = v.companies, updated_at = now()
  from verified v where e.company = v.company and e.employee_code = v.employee_code
    and e.leave_calendar_companies is distinct from v.companies
  returning e.id, e.leave_calendar_companies
)
insert into public.hr_audit(employee_id, action, changes)
select id, 'update', jsonb_build_object('leave_calendar_companies', leave_calendar_companies, 'source', 'Infotech Company Access and E-LEAVE Super Admin verified 2026-10-29') from changed;
notify pgrst, 'reload schema';
commit;
