-- Leave Year End and backup approver support.
alter table public.hr_employees
  add column if not exists leave_backup_approver_id uuid references public.hr_employees(id) on delete set null;
alter table public.hr_leave_requests
  add column if not exists backup_approver_id uuid references public.hr_employees(id) on delete set null;
create index if not exists hr_employees_leave_backup_approver_idx on public.hr_employees(leave_backup_approver_id);
create index if not exists hr_leave_requests_backup_approver_idx on public.hr_leave_requests(backup_approver_id, status);

create table if not exists public.hr_leave_year_closures (
  target_year integer primary key,
  source_year integer not null,
  bf_expiry date not null,
  staff_count integer not null,
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz not null default now()
);
alter table public.hr_leave_year_closures enable row level security;
revoke all on public.hr_leave_year_closures from anon, authenticated;

-- Runs the whole year-end operation atomically after the API has prepared a reviewed preview.
create or replace function public.hr_process_leave_year_end(
  p_target_year integer,
  p_bf_expiry date,
  p_processed_by uuid,
  p_balances jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_year integer := p_target_year - 1;
  v_count integer;
  v_active integer;
  v_row jsonb;
  v_group_row jsonb;
  v_employee uuid;
  v_group text;
  v_eligible numeric(6,2);
  v_bf numeric(6,2);
  v_credit numeric(6,2);
  v_forfeit numeric(6,2);
  v_total numeric(6,2);
  v_balance numeric(6,2);
  v_preview_bf numeric(6,2);
  v_old_balance numeric(6,2);
  v_old_bf numeric(6,2);
  v_old_expiry date;
begin
  if p_target_year <> extract(year from (now() at time zone 'Asia/Kuala_Lumpur'))::integer then
    raise exception 'Year End can only process the current leave year from 1 January onwards.';
  end if;
  if p_bf_expiry <= make_date(v_source_year, 12, 31) or p_bf_expiry > make_date(p_target_year, 12, 31) then
    raise exception 'Choose a brought-forward expiry date within the new leave year.';
  end if;
  if jsonb_typeof(p_balances) <> 'array' then raise exception 'Year-end preview is missing.'; end if;
  if exists (select 1 from public.hr_leave_year_closures where target_year = p_target_year) then
    raise exception 'This leave year has already been processed.';
  end if;
  if exists (
    select 1 from public.hr_leave_requests
    where status in ('pending', 'supervisor_approved')
      and start_date <= make_date(v_source_year, 12, 31)
      and end_date >= make_date(v_source_year, 1, 1)
  ) then raise exception 'Resolve every pending leave request from the previous year before processing.'; end if;

  select count(*) into v_active from public.hr_employees where status = 'Active';
  select count(*) into v_count from jsonb_array_elements(p_balances);
  if v_count <> v_active then raise exception 'Every active staff member must have a year-end preview.'; end if;

  -- Ensure each active staff member has exactly one reviewed AL and ML row.
  for v_row in select value from jsonb_array_elements(p_balances) loop
    v_employee := (v_row->>'employeeId')::uuid;
    if not exists (select 1 from public.hr_employees where id = v_employee and status = 'Active') then
      raise exception 'The staff list changed. Refresh the year-end preview.';
    end if;
    if (select count(*) from jsonb_array_elements(p_balances) as x(item) where item->>'employeeId' = v_employee::text) <> 1 then
      raise exception 'The year-end preview contains a duplicate staff member.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_row->'groups') as g(item)
      where item->>'group' not in ('AL', 'ML')
    ) or (select count(*) from jsonb_array_elements(v_row->'groups')) <> 2
      or (select count(distinct item->>'group') from jsonb_array_elements(v_row->'groups') as g(item)) <> 2 then
      raise exception 'Each staff member must have annual and medical leave in the preview.';
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(p_balances) loop
    v_employee := (v_row->>'employeeId')::uuid;
    for v_group_row in select value from jsonb_array_elements(v_row->'groups') loop
      v_group := v_group_row->>'group';
      v_eligible := (v_group_row->>'eligible')::numeric;
      v_preview_bf := (v_group_row->>'broughtForward')::numeric;
      v_credit := 0;
      v_forfeit := 0;
      if v_eligible < 0 or v_preview_bf < 0 or v_eligible > 366 or v_preview_bf > 366 then raise exception 'Leave figures must be between 0 and 366.'; end if;
      select balance, brought_forward, bf_expiry into v_old_balance, v_old_bf, v_old_expiry
        from public.hr_leave_balances where employee_id = v_employee and leave_group = v_group and year = v_source_year for update;
      if found then
        v_bf := greatest(0, coalesce(v_old_balance, 0) - case when v_old_expiry is not null and v_old_expiry <= make_date(v_source_year, 12, 31) then coalesce(v_old_bf, 0) else 0 end);
      else
        raise exception 'A previous-year AL or ML balance is missing. Set up every balance and refresh the preview.';
      end if;
      if abs(v_bf - v_preview_bf) > 0.009 then raise exception 'A leave balance changed after the preview. Refresh and review it again.'; end if;
      if exists (select 1 from public.hr_leave_balances where employee_id = v_employee and leave_group = v_group and year = p_target_year) then
        raise exception 'A new-year balance already exists. Refresh the preview.';
      end if;
      v_total := case when v_group = 'AL' then v_eligible + v_bf else 0 end;
      v_balance := case when v_group = 'AL' then v_total else v_eligible + v_bf end;
      insert into public.hr_leave_balances(employee_id, leave_group, year, eligible, brought_forward, forfeit, credit, earn, total, taken, balance, advance, bf_expiry, source, as_of)
      values (v_employee, v_group, p_target_year, v_eligible, v_bf, v_forfeit, v_credit, 0, v_total, 0, v_balance, 0,
        case when v_bf > 0 then p_bf_expiry else null end, 'year_end', (now() at time zone 'Asia/Kuala_Lumpur')::date);
      insert into public.hr_audit(employee_id, action, changes, changed_by)
      values (v_employee, 'update', jsonb_build_object('leave_year_end', jsonb_build_object('year', p_target_year, 'group', v_group, 'eligible', v_eligible, 'brought_forward', v_bf, 'bf_expiry', case when v_bf > 0 then p_bf_expiry else null end)), p_processed_by);
    end loop;
  end loop;
  insert into public.hr_leave_year_closures(target_year, source_year, bf_expiry, staff_count, processed_by)
  values (p_target_year, v_source_year, p_bf_expiry, v_active, p_processed_by);
  return jsonb_build_object('success', true, 'targetYear', p_target_year, 'sourceYear', v_source_year, 'staffCount', v_active);
end;
$$;
revoke all on function public.hr_process_leave_year_end(integer, date, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.hr_process_leave_year_end(integer, date, uuid, jsonb) to service_role;
