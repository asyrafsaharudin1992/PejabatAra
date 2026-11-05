-- HR > Miscellaneous: a "To print" section (files or links HR prints often) and an optional due date on a note, which shows on the HR calendar until the note is marked done.
alter table public.hr_misc_items add column if not exists due_on date;
alter table public.hr_misc_items add column if not exists done boolean not null default false;
alter table public.hr_misc_items drop constraint if exists hr_misc_items_kind_check;
alter table public.hr_misc_items add constraint hr_misc_items_kind_check check (kind in ('link', 'poster', 'note', 'print'));
