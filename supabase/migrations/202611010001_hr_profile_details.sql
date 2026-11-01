-- More personal details on the staff profile, as Infotech keeps them: race, foreign ID, an address in parts,
-- the spouse's details and education. Read and written only through the API (the HR office and, for the
-- staff member's own profile, Individual Sign In), like the rest of hr_employees.
alter table public.hr_employees
  add column if not exists race text not null default '',
  add column if not exists foreign_id_no text not null default '',
  add column if not exists address_line1 text not null default '',
  add column if not exists address_line2 text not null default '',
  add column if not exists postcode text not null default '',
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists spouse_name text not null default '',
  add column if not exists spouse_ic text not null default '',
  add column if not exists spouse_employer text not null default '',
  add column if not exists spouse_phone text not null default '',
  add column if not exists education jsonb not null default '[]'::jsonb;   -- [{ level, institution, course, year }]

-- The old one-box address becomes the first address line, so nothing already written is lost.
update public.hr_employees set address_line1 = address where address <> '' and address_line1 = '';
