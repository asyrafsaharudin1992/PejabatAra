-- Quality & Corporate daily tracker migrated from the legacy Google Sheet.
-- One row represents one working date; each activity remains independently editable.

create table if not exists public.office_trackers (
  tracker_date date primary key,
  clinical_audit_individual_feedback text not null default '',
  clinical_audit_reporting text not null default '',
  follow_up_referred_cases text not null default '',
  in_house_guidelines text not null default '',
  documenting_in_plato text not null default '',
  graphic_design text not null default '',
  email_correspondence text not null default '',
  new_membership_data_update text not null default '',
  cme_for_doctors text not null default '',
  google_review_response text not null default '',
  locum_qr_scan_review text not null default '',
  damage_control text not null default '',
  social_media text not null default '',
  in_house_app_system_maintenance text not null default '',
  corporate_collaborations text not null default '',
  locumhub_performance_key_in text not null default '',
  locum_interview_feedback text not null default '',
  birthday_wishes text not null default '',
  others text not null default '',
  desktop_ops_drive_clearance text not null default '',
  locum_directory_update text not null default '',
  finding_replacement text not null default '',
  meeting text not null default '',
  doctors_schedule_locum_slots text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.office_trackers enable row level security;

do $$ begin
  create policy "signed in users read office trackers" on public.office_trackers for select
    using (auth.uid() is not null);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admins manage office trackers" on public.office_trackers for all
    using (public.current_role() = 'super_admin')
    with check (public.current_role() = 'super_admin');
exception when duplicate_object then null;
end $$;
