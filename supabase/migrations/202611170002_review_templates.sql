-- Review templates HR makes itself (a third kind of performance review next to Review 1 and Review 2).
-- A template is a list of items, each marked out of its own full mark, and an optional list of results to choose from.
-- When HR assigns a template, a copy of it is kept on the review (`template`), so editing or archiving the template later never changes a review already given.
create table if not exists public.hr_review_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  items jsonb not null default '[]'::jsonb,
  outcomes jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hr_review_templates enable row level security;
alter table public.hr_reviews drop constraint if exists hr_reviews_form_type_check;
alter table public.hr_reviews add constraint hr_reviews_form_type_check check (form_type in ('standard', 'assistant', 'custom'));
alter table public.hr_reviews add column if not exists template jsonb;
alter table public.hr_reviews add column if not exists custom jsonb not null default '{}'::jsonb;
