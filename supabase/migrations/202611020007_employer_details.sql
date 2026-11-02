-- The employer's statutory numbers that the KWSP, PERKESO and ePCB files carry. One row (key 'group'), read only by the HR office; the numbers are
-- typed into the database, not kept in the repository.
create table if not exists public.hr_employer_details (
  key text primary key,
  epf_no text not null default '',
  socso_no text not null default '',
  employer_e_no text not null default '',
  income_tax_no text not null default '',
  company_reg_no text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.hr_employer_details enable row level security;
revoke all on public.hr_employer_details from anon, authenticated;
