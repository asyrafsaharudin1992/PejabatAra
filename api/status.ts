import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

export default function handler(req: any, res: any) {
  if (req.query?.workspace === '1') return workspaceHandler(req, res);
  const mask = (str: string | undefined) => {
    if (!str) return "Missing";
    if (str.length < 10) return "Present (Too Short)";
    return `${str.substring(0, 5)}...${str.substring(str.length - 5)}`;
  };

  res.status(200).json({ 
    connected: true, 
    spreadsheetId: mask(process.env.GOOGLE_SHEET_ID),
    serviceAccountEmail: mask(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
    privateKey: mask(process.env.GOOGLE_PRIVATE_KEY),
    nodeVersion: process.version,
    env: process.env.NODE_ENV,
    time: new Date().toISOString()
  });
}

async function workspaceHandler(_req: any, res: any) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Supabase server configuration is missing.' });

  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as any } });
  const [tasks, notes, history, categories, links, settings, users] = await Promise.all([
    db.from('office_tasks').select('*').order('created_at', { ascending: true }),
    db.from('office_notes').select('*').order('updated_at', { ascending: false }),
    db.from('office_task_history').select('*').order('date_completed', { ascending: false }),
    db.from('office_categories').select('name,color').order('name'),
    db.from('office_portal_links').select('*').order('created_at', { ascending: false }),
    db.from('office_staff_settings').select('*, profiles(email,full_name)'),
    db.from('profiles').select('id,email,full_name,role,status,department,created_at').order('full_name'),
  ]);
  const error = [tasks, notes, history, categories, links, settings, users].find((result) => result.error)?.error;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({
    tasks: (tasks.data || []).map((row: any) => ({ id: row.id, category: row.category, title: row.title, description: row.description, frequency: row.frequency, frequencyDetail: row.frequency_detail, subtasks: row.subtasks, completed: row.completed, deadline: row.deadline, createdAt: row.created_at })),
    notes: (notes.data || []).map((row: any) => ({ id: row.id, title: row.title, content: row.content, updatedAt: row.updated_at, duedate: row.due_date, category: row.category, completed: row.completed })),
    history: (history.data || []).map((row: any) => ({ taskId: row.task_id, title: row.title, dateCompleted: row.date_completed, remarks: row.remarks, subtasks: row.subtasks || [] })),
    categories: (categories.data || []).map((row: any) => ({ name: row.name, color: row.color })),
    links: (links.data || []).map((row: any) => ({ id: row.id, folder: row.folder, title: row.title, url: row.url, createdAt: row.created_at })),
    settings: (settings.data || []).map((row: any) => ({ email: row.profiles?.email || '', name: row.profiles?.full_name || '', offdays: row.off_days || [], leaveperiods: row.leave_periods || [], updatedat: row.updated_at })),
    users: (users.data || []).map((row: any) => ({ email: row.email, fullName: row.full_name, role: row.role === 'super_admin' ? 'Superadmin' : row.role === 'content_editor' ? 'ContentEditor' : row.role === 'supervisor' ? 'Supervisor' : 'Staff', status: row.status, department: row.department, lastLogin: row.created_at })),
  });
}
