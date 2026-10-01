import { supabase } from './supabase';

export async function loadQualityWorkspace(includeUsers = false) {
  if (!supabase) throw new Error('Supabase is not configured');
  const [tasks, notes, history, categories, links, settings, users] = await Promise.all([
    supabase.from('office_tasks').select('*').order('created_at', { ascending: true }),
    supabase.from('office_notes').select('*').order('updated_at', { ascending: false }),
    supabase.from('office_task_history').select('*').order('date_completed', { ascending: false }),
    supabase.from('office_categories').select('name,color').order('name'),
    supabase.from('office_portal_links').select('*').order('created_at', { ascending: false }),
    supabase.from('office_staff_settings').select('*, profiles(email,full_name)'),
    includeUsers ? supabase.from('profiles').select('id,email,full_name,role,status,department,created_at').order('full_name') : Promise.resolve({ data: [], error: null }),
  ]);
  const firstError = [tasks, notes, history, categories, links, settings, users].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  return {
    tasks: (tasks.data || []).map((row: any) => ({ id: row.id, category: row.category, title: row.title, description: row.description, frequency: row.frequency, frequencyDetail: row.frequency_detail, subtasks: row.subtasks, completed: row.completed, deadline: row.deadline, createdAt: row.created_at })),
    notes: (notes.data || []).map((row: any) => ({ id: row.id, title: row.title, content: row.content, updatedAt: row.updated_at, duedate: row.due_date, category: row.category, completed: row.completed })),
    history: (history.data || []).map((row: any) => ({ taskId: row.task_id, title: row.title, dateCompleted: row.date_completed, remarks: row.remarks, subtasks: row.subtasks || [] })),
    categories: (categories.data || []).map((row: any) => ({ name: row.name, color: row.color })),
    links: (links.data || []).map((row: any) => ({ id: row.id, folder: row.folder, title: row.title, url: row.url, createdAt: row.created_at })),
    settings: (settings.data || []).map((row: any) => ({ email: row.profiles?.email || '', name: row.profiles?.full_name || '', offdays: row.off_days || [], leaveperiods: row.leave_periods || [], updatedat: row.updated_at })),
    users: (users.data || []).map((row: any) => ({ email: row.email, fullName: row.full_name, role: row.role === 'super_admin' ? 'Superadmin' : row.role === 'content_editor' ? 'ContentEditor' : row.role === 'supervisor' ? 'Supervisor' : 'Staff', status: row.status, department: row.department, lastLogin: row.created_at })),
  };
}
