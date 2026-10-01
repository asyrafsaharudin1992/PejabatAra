import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

export async function officeAccess(req, adminOnly = false) {
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) throw Object.assign(new Error('Sign in required.'), { status: 401 });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Please sign in again.'), { status: 401 });
  const { data: profile, error: profileError } = await db.from('profiles').select('role,status,department').eq('id', data.user.id).single();
  if (profileError || profile?.status !== 'active' || (profile.role !== 'super_admin' && (adminOnly || profile.department !== 'Quality & Corporate'))) {
    throw Object.assign(new Error('Access restricted.'), { status: 403 });
  }
  return { db, user: data.user, profile };
}

const schemas = {
  tasks: { table: 'office_tasks', fields: { id:'id', title:'title', category:'category', description:'description', frequency:'frequency', frequencyDetail:'frequency_detail', completed:'completed', subtasks:'subtasks', deadline:'deadline', createdAt:'created_at' } },
  notes: { table:'office_notes', fields:{ id:'id', title:'title', content:'content', duedate:'due_date', category:'category', completed:'completed', updatedAt:'updated_at' } },
  categories: { table:'office_categories', fields:{ name:'name', color:'color' } },
  portal: { table:'office_portal_links', fields:{ id:'id', folder:'folder', title:'title', url:'url', createdAt:'created_at' } },
  history: { table:'office_task_history', fields:{ id:'id', taskId:'task_id', title:'title', dateCompleted:'date_completed', remarks:'remarks', subtasks:'subtasks' } },
};

export function workspaceHandler(resource) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const { db, user } = await officeAccess(req);
      const { table, fields } = schemas[resource];
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const mapped = {};
      for (const [source, target] of Object.entries(fields)) if (body[source] !== undefined && source !== 'id') mapped[target] = body[source];
      if (mapped.due_date === '') mapped.due_date = null;
      if (mapped.deadline === '') mapped.deadline = null;
      const decode = (row) => Object.fromEntries(Object.entries(fields).map(([target, source]) => [target, row[source]]));
      let query;
      if (req.method === 'GET') query = db.from(table).select('*');
      else if (req.method === 'POST') {
        if (resource !== 'categories' && resource !== 'history') mapped.id = crypto.randomUUID();
        if (resource === 'history') { mapped.completed_by = user.id; mapped.date_completed ||= new Date().toISOString(); }
        if (resource === 'notes' || resource === 'portal') mapped.created_by = user.id;
        query = db.from(table).insert(mapped).select('*');
      } else if (req.method === 'PATCH' || req.method === 'DELETE') {
        query = req.method === 'PATCH' ? db.from(table).update(mapped) : db.from(table).delete();
        if (resource === 'history') {
          const task = req.query.id || body.taskId, date = req.query.date || body.dateCompleted;
          if (!task || !date) return res.status(400).json({ error:'Task and completion date are required.' });
          query = query.eq('task_id', task).eq('date_completed', date);
        } else {
          const key = resource === 'categories' ? 'name' : 'id';
          if (!req.query[key]) return res.status(400).json({ error:`${key} is required.` });
          query = query.eq(key, req.query[key]);
        }
        query = query.select('*');
      } else return res.status(405).json({ error:'Method not allowed.' });
      const { data, error } = await query;
      if (error) throw error;
      if (req.method === 'GET') return res.status(200).json((data || []).map(decode));
      if (!data?.length) return res.status(404).json({ error:'Record not found.' });
      return res.status(200).json(req.method === 'POST' ? decode(data[0]) : { success:true });
    } catch (error) { return res.status(error.status || 400).json({ error: error.message || 'Request failed.' }); }
  };
}
