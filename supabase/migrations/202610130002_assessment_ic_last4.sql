-- Assessment Room sign-in also asks for the last four digits of the staff
-- member's IC, because staff codes are sequential and easy to guess. Only a
-- salted scrypt hash is kept ("salt:hash"); the digits themselves are never stored.
alter table public.assessment_staff add column if not exists ic4_hash text;
