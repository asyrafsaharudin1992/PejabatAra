-- Close the self-registration gap found in the security audit.
--
-- 1. New auth users no longer become active on their own. Accounts created from
--    Control Centre are still activated by /api/users straight after creation.
-- 2. Direct table reads (the browser uses the public anon key) now follow the
--    same office access the API enforces, instead of "any signed-in user".
--
-- The API uses the service role, so none of its routes are affected by RLS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'Staf'), '@', 1)),
    'invited'
  );
  return new;
end;
$$;

-- True for active System Admins, or active staff whose office_access includes
-- the office. office_access lives in app_metadata, which only the service role
-- can change, so users cannot grant it to themselves.
create or replace function public.has_office(office text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role = 'super_admin'
        or coalesce(auth.jwt() -> 'app_metadata' -> 'office_access', '[]'::jsonb) ? office
      )
  )
$$;

-- Quality & Corporate office tables
drop policy if exists "signed in users read office categories" on public.office_categories;
drop policy if exists "quality office reads categories" on public.office_categories;
create policy "quality office reads categories" on public.office_categories for select
  using (public.has_office('quality'));

drop policy if exists "signed in users read office tasks" on public.office_tasks;
drop policy if exists "quality office reads tasks" on public.office_tasks;
create policy "quality office reads tasks" on public.office_tasks for select
  using (public.has_office('quality'));

drop policy if exists "signed in users read office notes" on public.office_notes;
drop policy if exists "quality office reads notes" on public.office_notes;
create policy "quality office reads notes" on public.office_notes for select
  using (public.has_office('quality'));
drop policy if exists "users create office notes" on public.office_notes;
drop policy if exists "quality office creates own notes" on public.office_notes;
create policy "quality office creates own notes" on public.office_notes for insert
  with check (public.has_office('quality') and (created_by = auth.uid() or public.current_role() = 'super_admin'));

drop policy if exists "signed in users read office history" on public.office_task_history;
drop policy if exists "quality office reads history" on public.office_task_history;
create policy "quality office reads history" on public.office_task_history for select
  using (public.has_office('quality'));
drop policy if exists "users create office history" on public.office_task_history;
drop policy if exists "quality office records own history" on public.office_task_history;
create policy "quality office records own history" on public.office_task_history for insert
  with check (public.has_office('quality') and (completed_by = auth.uid() or public.current_role() = 'super_admin'));

drop policy if exists "signed in users read office links" on public.office_portal_links;
drop policy if exists "quality office reads links" on public.office_portal_links;
create policy "quality office reads links" on public.office_portal_links for select
  using (public.has_office('quality'));

drop policy if exists "signed in users read office trackers" on public.office_trackers;
drop policy if exists "quality office reads trackers" on public.office_trackers;
create policy "quality office reads trackers" on public.office_trackers for select
  using (public.has_office('quality'));

-- Clinical Assistants tables
-- panel_drive_files only exists where the panel realtime migration was applied.
do $$
begin
  if to_regclass('public.panel_drive_files') is not null then
    drop policy if exists "active staff read panel guides" on public.panel_drive_files;
    drop policy if exists "ca office reads panel drive files" on public.panel_drive_files;
    create policy "ca office reads panel drive files" on public.panel_drive_files for select to authenticated
      using (public.has_office('ca'));
  end if;
end $$;

drop policy if exists "active staff read panels" on public.panels;
drop policy if exists "ca office reads panels" on public.panels;
create policy "ca office reads panels" on public.panels for select
  using (public.has_office('ca'));

drop policy if exists "active staff read linked panel guides" on public.panel_guides;
drop policy if exists "ca office reads linked panel guides" on public.panel_guides;
create policy "ca office reads linked panel guides" on public.panel_guides for select
  using (status = 'linked' and public.has_office('ca'));

drop policy if exists "active staff read service folders" on public.service_folders;
drop policy if exists "ca office reads service folders" on public.service_folders;
create policy "ca office reads service folders" on public.service_folders for select
  using (public.has_office('ca'));

drop policy if exists "active staff read service items" on public.service_catalog_items;
drop policy if exists "ca office reads service items" on public.service_catalog_items;
create policy "ca office reads service items" on public.service_catalog_items for select
  using (active and public.has_office('ca'));

drop policy if exists "active staff read service faqs" on public.service_faqs;
drop policy if exists "ca office reads service faqs" on public.service_faqs;
create policy "ca office reads service faqs" on public.service_faqs for select
  using (active and public.has_office('ca'));

drop policy if exists "active staff read teamara messages" on public.teamara_messages;
drop policy if exists "ca office reads teamara messages" on public.teamara_messages;
create policy "ca office reads teamara messages" on public.teamara_messages for select
  using (public.has_office('ca'));
