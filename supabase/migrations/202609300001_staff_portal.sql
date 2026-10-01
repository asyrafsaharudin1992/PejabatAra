-- ARA Staff Portal: shared staff accounts, branch access, passover and training.
-- Run this migration in a new Supabase project created in the Singapore region.

create extension if not exists pgcrypto;

create type public.portal_role as enum ('super_admin', 'supervisor', 'content_editor', 'staff');
create type public.account_status as enum ('active', 'invited', 'inactive');
create type public.shift_type as enum ('AM', 'PM');
create type public.shift_state as enum ('in_progress', 'handed_over', 'received');
create type public.item_status as enum ('pending', 'done', 'not_required');

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  timezone text not null default 'Asia/Kuala_Lumpur',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  department text,
  role public.portal_role not null default 'staff',
  status public.account_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_branches (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (profile_id, branch_id)
);

create table public.shift_handovers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  shift_date date not null,
  shift_type public.shift_type not null,
  starts_at timestamptz,
  ends_at timestamptz,
  issue_summary text not null default 'Tiada isu kritikal dilaporkan.',
  state public.shift_state not null default 'in_progress',
  created_by uuid not null references public.profiles(id),
  handed_over_by uuid references public.profiles(id),
  handed_over_at timestamptz,
  received_by uuid references public.profiles(id),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, shift_date, shift_type)
);

create table public.shift_staff (
  handover_id uuid not null references public.shift_handovers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  primary key (handover_id, profile_id)
);

create table public.handover_items (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.shift_handovers(id) on delete cascade,
  kind text not null check (kind in ('passover', 'checklist')),
  section_key text,
  section_title text,
  title text not null,
  detail text,
  status public.item_status not null default 'pending',
  position integer not null default 0,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  branch_id uuid not null references public.branches(id),
  actor_id uuid not null references public.profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.portal_state (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  state_key text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (branch_id, state_key)
);

create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null,
  category text not null,
  article_type text not null,
  content jsonb not null default '[]'::jsonb,
  owner_id uuid references public.profiles(id),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.training_modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null,
  required boolean not null default false,
  published boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules(id) on delete cascade,
  title text not null,
  content text not null,
  duration_minutes integer not null default 5,
  position integer not null default 0
);

create table public.training_progress (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.training_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (profile_id, lesson_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id),
  title text not null,
  body text not null,
  priority text not null default 'normal' check (priority in ('normal', 'important')),
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index handovers_branch_date_idx on public.shift_handovers(branch_id, shift_date desc);
create index handover_items_handover_idx on public.handover_items(handover_id, position);
create index audit_events_branch_created_idx on public.audit_events(branch_id, created_at desc);

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
    'active'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.current_role()
returns public.portal_role
language sql
stable
security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.can_access_branch(target_branch uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.current_role() = 'super_admin'
    or exists (
      select 1 from public.staff_branches
      where profile_id = auth.uid() and branch_id = target_branch
    )
$$;

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.staff_branches enable row level security;
alter table public.shift_handovers enable row level security;
alter table public.shift_staff enable row level security;
alter table public.handover_items enable row level security;
alter table public.audit_events enable row level security;
alter table public.portal_state enable row level security;
alter table public.knowledge_articles enable row level security;
alter table public.training_modules enable row level security;
alter table public.training_lessons enable row level security;
alter table public.training_progress enable row level security;
alter table public.announcements enable row level security;

create policy "staff view assigned branches" on public.branches for select
  using (public.can_access_branch(id));
create policy "users view own profile" on public.profiles for select
  using (id = auth.uid() or public.current_role() in ('super_admin', 'supervisor'));
create policy "admins manage profiles" on public.profiles for all
  using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');
create policy "users view own memberships" on public.staff_branches for select
  using (profile_id = auth.uid() or public.current_role() in ('super_admin', 'supervisor'));
create policy "admins manage memberships" on public.staff_branches for all
  using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');

create policy "branch members view handovers" on public.shift_handovers for select
  using (public.can_access_branch(branch_id));
create policy "branch members create handovers" on public.shift_handovers for insert
  with check (public.can_access_branch(branch_id) and created_by = auth.uid());
create policy "branch members update handovers" on public.shift_handovers for update
  using (public.can_access_branch(branch_id)) with check (public.can_access_branch(branch_id));

create policy "branch members view shift staff" on public.shift_staff for select
  using (exists (select 1 from public.shift_handovers h where h.id = handover_id and public.can_access_branch(h.branch_id)));
create policy "branch members manage shift staff" on public.shift_staff for all
  using (exists (select 1 from public.shift_handovers h where h.id = handover_id and public.can_access_branch(h.branch_id)))
  with check (exists (select 1 from public.shift_handovers h where h.id = handover_id and public.can_access_branch(h.branch_id)));

create policy "branch members view items" on public.handover_items for select
  using (exists (select 1 from public.shift_handovers h where h.id = handover_id and public.can_access_branch(h.branch_id)));
create policy "branch members create items" on public.handover_items for insert
  with check (created_by = auth.uid() and updated_by = auth.uid() and exists (select 1 from public.shift_handovers h where h.id = handover_id and public.can_access_branch(h.branch_id)));
create policy "branch members update items" on public.handover_items for update
  using (exists (select 1 from public.shift_handovers h where h.id = handover_id and public.can_access_branch(h.branch_id)))
  with check (updated_by = auth.uid() and exists (select 1 from public.shift_handovers h where h.id = handover_id and public.can_access_branch(h.branch_id)));

create policy "branch members view audit" on public.audit_events for select
  using (public.can_access_branch(branch_id));
create policy "users append own audit" on public.audit_events for insert
  with check (actor_id = auth.uid() and public.can_access_branch(branch_id));

create policy "branch members view portal state" on public.portal_state for select
  using (public.can_access_branch(branch_id));
create policy "branch members create portal state" on public.portal_state for insert
  with check (updated_by = auth.uid() and public.can_access_branch(branch_id));
create policy "branch members update portal state" on public.portal_state for update
  using (public.can_access_branch(branch_id))
  with check (updated_by = auth.uid() and public.can_access_branch(branch_id));

create policy "staff read published articles" on public.knowledge_articles for select
  using (published or public.current_role() in ('super_admin', 'content_editor'));
create policy "editors manage articles" on public.knowledge_articles for all
  using (public.current_role() in ('super_admin', 'content_editor'))
  with check (public.current_role() in ('super_admin', 'content_editor'));
create policy "staff read published modules" on public.training_modules for select
  using (published or public.current_role() in ('super_admin', 'content_editor'));
create policy "editors manage modules" on public.training_modules for all
  using (public.current_role() in ('super_admin', 'content_editor'))
  with check (public.current_role() in ('super_admin', 'content_editor'));
create policy "staff read lessons" on public.training_lessons for select
  using (exists (select 1 from public.training_modules m where m.id = module_id and (m.published or public.current_role() in ('super_admin', 'content_editor'))));
create policy "editors manage lessons" on public.training_lessons for all
  using (public.current_role() in ('super_admin', 'content_editor'))
  with check (public.current_role() in ('super_admin', 'content_editor'));
create policy "users manage own progress" on public.training_progress for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "supervisors view progress" on public.training_progress for select
  using (public.current_role() in ('super_admin', 'supervisor'));
create policy "staff view announcements" on public.announcements for select
  using (published_at is not null and (branch_id is null or public.can_access_branch(branch_id)));
create policy "editors manage announcements" on public.announcements for all
  using (public.current_role() in ('super_admin', 'content_editor'))
  with check (public.current_role() in ('super_admin', 'content_editor'));

insert into public.branches (name) values ('Kajang'), ('Seri Kembangan'), ('Semenyih');
