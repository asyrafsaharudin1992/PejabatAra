begin;

-- Several saved drafts for the same month, each with its own name (Draft 1, Draft 2, "With Hanis on leave" ...).
alter table public.hr_roster_drafts add column if not exists name text not null default 'Draft 1';
alter table public.hr_roster_drafts drop constraint if exists hr_roster_drafts_pkey;
alter table public.hr_roster_drafts add primary key (month, grp, company, name);

commit;
