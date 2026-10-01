import dotenv from 'dotenv';
import fs from 'node:fs';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const spreadsheetId = process.env.GOOGLE_SHEET_ID || '1z41IbJtvILMYHz9EqvpflzZD3kTFLF0R9q-0OnzzQFE';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const serviceAccount = serviceAccountJson && fs.existsSync(serviceAccountJson)
  ? JSON.parse(fs.readFileSync(serviceAccountJson, 'utf8'))
  : null;
const googleEmail = serviceAccount?.client_email || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const googlePrivateKey = serviceAccount?.private_key || process.env.GOOGLE_PRIVATE_KEY;
if (!supabaseUrl || !serviceRoleKey || !googleEmail || !googlePrivateKey) {
  throw new Error('Set VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and GOOGLE_SERVICE_ACCOUNT_JSON (or the Google email/private key variables) before running the migration.');
}

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: googleEmail, private_key: googlePrivateKey.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false }, realtime: { transport: WebSocket as any } });

async function rows(sheet: string, range: string) {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheet}!${range}` });
  return response.data.values || [];
}

const json = (value: unknown, fallback: unknown) => {
  if (!value) return fallback;
  try { return JSON.parse(String(value)); } catch { return fallback; }
};

async function main() {
  const categoryRows = await rows('Categories', 'A:B');
  const categories = categoryRows.slice(1).filter((r) => r[0]).map((r) => ({ name: r[0], color: r[1] || 'bg-slate-100 text-slate-600' }));
  if (categories.length) await db.from('office_categories').upsert(categories, { onConflict: 'name' });

  const taskRows = await rows('Tasks', 'A:I');
  const tasks = taskRows.slice(1).filter((r) => r[0] && r[2]).map((r) => ({
    id: r[0], category: r[1] || 'General', title: r[2], description: r[3] || '', frequency: r[4] || 'DAILY',
    completed: String(r[5]).toLowerCase() === 'completed', subtasks: json(r[6], []), created_at: r[7] || new Date().toISOString(), frequency_detail: r[8] || '',
  }));
  if (tasks.length) await db.from('office_tasks').upsert(tasks, { onConflict: 'id' });

  const noteRows = await rows('Notes', 'A:G');
  const notes = noteRows.slice(1).filter((r) => r[0]).map((r) => ({ id: r[0], title: r[1] || '', content: r[2] || '', updated_at: r[3] || new Date().toISOString(), due_date: r[4] || null, category: r[5] || null, completed: String(r[6]).toLowerCase() === 'completed' }));
  if (notes.length) await db.from('office_notes').upsert(notes, { onConflict: 'id' });

  const historyRows = await rows('History', 'A:E');
  const history = historyRows.slice(1).filter((r) => r[0] && r[2]).map((r) => ({ task_id: r[0], title: r[1] || r[0], date_completed: String(r[2]).slice(0, 10), remarks: r[3] || '', subtasks: String(r[4] || '').split(' | ').filter(Boolean) }));
  if (history.length) await db.from('office_task_history').upsert(history, { onConflict: 'task_id,date_completed' });

  const settingsRows = await rows('StaffSettings', 'A:E');
  for (const row of settingsRows.slice(1).filter((r) => r[0])) {
    const { data: profile } = await db.from('profiles').select('id').eq('email', row[0]).maybeSingle();
    if (profile) await db.from('office_staff_settings').upsert({ profile_id: profile.id, off_days: json(row[2], String(row[2] || '').split(',').filter(Boolean)), leave_periods: json(row[3], []), updated_at: row[4] || new Date().toISOString() }, { onConflict: 'profile_id' });
  }

  const linkRows = await rows('Portal', 'A:E');
  const links = linkRows.slice(1).filter((r) => r[0] && r[3]).map((r) => ({ id: r[0], folder: r[1] || 'General', title: r[2] || 'Link', url: r[3], created_at: r[4] || new Date().toISOString() }));
  if (links.length) await db.from('office_portal_links').upsert(links, { onConflict: 'id' });

  console.log(`Migrated ${categories.length} categories, ${tasks.length} tasks, ${notes.length} notes, ${history.length} history entries and ${links.length} portal links.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
