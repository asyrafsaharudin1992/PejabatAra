-- The OT policy HR can edit (OT > Settings): rates, the rest taken off, the OT block, and the hours for a half or full day.
-- One JSON column on the single settings row. When it is empty the system uses the memo defaults (api/_ot-rules.ts).
alter table public.hr_attendance_settings add column if not exists ot_policy jsonb;
