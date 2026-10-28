-- Individual sign-in: a staff member sets their own password after the first sign-in (which still uses
-- name + staff code + the last 4 IC digits). Only a salted hash is stored. HR can clear it so the
-- staff member signs in with the IC digits again and sets a new one.
alter table public.assessment_staff add column if not exists password_hash text;
alter table public.assessment_staff add column if not exists password_set_at timestamptz;
