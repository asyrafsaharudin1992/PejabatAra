import { supabase } from './supabase';

const trackerFields = [
  ['clinical_audit_individual_feedback', 'Clinical Audit - Individual feedback', 'Quality of Service'],
  ['clinical_audit_reporting', 'Clinical Audit - Reporting', 'Quality of Service'],
  ['follow_up_referred_cases', 'Follow up – referred cases', 'Quality of Service'],
  ['in_house_guidelines', 'In house guidelines', 'Quality of Service'],
  ['documenting_in_plato', 'Documenting in Plato', 'Quality of Service'],
  ['graphic_design', 'Graphic design', 'Others'],
  ['email_correspondence', 'Email correspondance', 'Others'],
  ['new_membership_data_update', 'New membership data update', 'TeamARA'],
  ['cme_for_doctors', 'CME for doctors', 'Quality of Service'],
  ['google_review_response', 'Google Review Response', 'Marketing'],
  ['locum_qr_scan_review', 'Locum QR scan review', 'Locum Doctors'],
  ['damage_control', 'Damage control', 'Quality of Service'],
  ['social_media', 'Social media (FB, IG, Thread)', 'Marketing'],
  ['in_house_app_system_maintenance', 'In-house app system maintanence', 'Others'],
  ['corporate_collaborations', 'Corporate collaborations', 'Collaborations'],
  ['locumhub_performance_key_in', 'LocumHub performance key-in', 'Locum Doctors'],
  ['locum_interview_feedback', 'Locum interview & feedback', 'Locum Doctors'],
  ['birthday_wishes', 'Birthday wishes', 'Marketing'],
  ['others', 'Others', 'Others'],
  ['desktop_ops_drive_clearance', 'Dekstop & Ops Drive Clearance', 'Others'],
  ['locum_directory_update', 'Locum’s directory update', 'Locum Doctors'],
  ['finding_replacement', 'Finding replacement', 'Locum Doctors'],
  ['meeting', 'Meeting', 'Others'],
  ['doctors_schedule_locum_slots', 'Doctors’ schedule/Locum slots', 'Locum Doctors'],
] as const;

const normalizeTitle = (value: string) => value.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const trackerRemark = (value: string) => {
  const clean = value.trim();
  if (/^done$/i.test(clean)) return '';
  return clean.replace(/^done\s*[:,–-]\s*/i, '').trim();
};

export async function loadQualityWorkspace(includeUsers = false) {
  if (!supabase) throw new Error('Supabase is not configured');
  const [tasks, notes, history, trackers, categories, links, settings, users] = await Promise.all([
    supabase.from('office_tasks').select('*').order('created_at', { ascending: true }),
    supabase.from('office_notes').select('*').order('updated_at', { ascending: false }),
    supabase.from('office_task_history').select('*').order('date_completed', { ascending: false }),
    supabase.from('office_trackers').select('*').order('tracker_date', { ascending: false }),
    supabase.from('office_categories').select('name,color').order('name'),
    supabase.from('office_portal_links').select('*').order('created_at', { ascending: false }),
    supabase.from('office_staff_settings').select('*'),
    // Profiles and settings both reference auth.users, not each other. Fetch
    // visible profiles separately under RLS instead of an unsupported join.
    supabase.from('profiles').select('id,email,full_name,role,status,department,created_at').order('full_name'),
  ]);
  const firstError = [tasks, notes, history, trackers, categories, links, settings, users].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  const profiles = new Map((users.data || []).map((profile) => [profile.id, profile]));
  const taskByTitle = new Map((tasks.data || []).map((task: any) => [normalizeTitle(task.title), task]));
  const historicalTrackerValues = new Set<string>();
  (trackers.data || []).forEach((row: any) => trackerFields.forEach(([field]) => {
    const rawValue = String(row[field] || '').trim();
    if (!rawValue) return;
    historicalTrackerValues.add(rawValue.replace(/\s+/g, ' ').trim().toLowerCase());
    const cleanedValue = trackerRemark(rawValue);
    if (cleanedValue) historicalTrackerValues.add(cleanedValue.replace(/\s+/g, ' ').trim().toLowerCase());
  }));
  const taskDescription = (value: unknown) => {
    const description = String(value || '').trim();
    if (!description) return '';
    const normalized = description.replace(/\s+/g, ' ').trim().toLowerCase();
    return historicalTrackerValues.has(normalized) ? '' : description;
  };
  const manualHistory = (history.data || []).map((row: any) => ({ taskId: row.task_id, title: row.title, dateCompleted: row.date_completed, remarks: row.remarks, subtasks: row.subtasks || [], source: 'manual' }));
  const manualKeys = new Set(manualHistory.map((entry: any) => `${entry.taskId}:${String(entry.dateCompleted).slice(0, 10)}`));
  const trackerHistory = (trackers.data || []).flatMap((row: any) => trackerFields.flatMap(([field, title, category]) => {
    const rawValue = String(row[field] || '').trim();
    if (!rawValue) return [];
    const matchedTask: any = taskByTitle.get(normalizeTitle(title));
    const taskId = matchedTask?.id || `tracker:${field}`;
    if (manualKeys.has(`${taskId}:${row.tracker_date}`)) return [];
    return [{
      taskId,
      title,
      category: matchedTask?.category || category,
      dateCompleted: row.tracker_date,
      remarks: trackerRemark(rawValue),
      subtasks: [],
      source: 'tracker',
      readOnly: true,
    }];
  }));
  return {
    tasks: (tasks.data || []).map((row: any) => ({ id: row.id, category: row.category, title: row.title, description: taskDescription(row.description), frequency: row.frequency, frequencyDetail: row.frequency_detail, subtasks: row.subtasks, completed: row.completed, deadline: row.deadline, createdAt: row.created_at })),
    notes: (notes.data || []).map((row: any) => ({ id: row.id, title: row.title, content: row.content, updatedAt: row.updated_at, duedate: row.due_date, category: row.category, completed: row.completed })),
    history: [...manualHistory, ...trackerHistory].sort((a: any, b: any) => String(b.dateCompleted).localeCompare(String(a.dateCompleted))),
    categories: (categories.data || []).map((row: any) => ({ name: row.name, color: row.color })),
    links: (links.data || []).map((row: any) => ({ id: row.id, folder: row.folder, title: row.title, url: row.url, createdAt: row.created_at })),
    settings: (settings.data || []).map((row: any) => ({ email: profiles.get(row.profile_id)?.email || '', name: profiles.get(row.profile_id)?.full_name || '', offdays: row.off_days || [], leaveperiods: row.leave_periods || [], updatedat: row.updated_at })),
    users: (includeUsers ? users.data || [] : []).map((row: any) => ({ email: row.email, fullName: row.full_name, role: row.role === 'super_admin' ? 'Superadmin' : row.role === 'content_editor' ? 'ContentEditor' : row.role === 'supervisor' ? 'Supervisor' : 'Staff', status: row.status, department: row.department, lastLogin: row.created_at })),
  };
}
