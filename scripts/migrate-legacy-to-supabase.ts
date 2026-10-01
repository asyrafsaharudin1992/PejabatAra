import dotenv from 'dotenv';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
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

async function save(table: string, records: any[], onConflict: string) {
  if (!records.length) return;
  const { error } = await db.from(table).upsert(records, { onConflict, ignoreDuplicates: true });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function migrateHistory() {
  const historyRows = await rows('History', 'A:E');
  const occurrences = new Map<string, number>();
  const history = historyRows.slice(1).filter((r) => r[0] && r[2]).map((r, index) => {
    const date = new Date(String(r[2]));
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid history date at row ${index + 2}`);
    const identity = JSON.stringify([spreadsheetId, ...r]);
    const occurrence = occurrences.get(identity) || 0;
    occurrences.set(identity, occurrence + 1);
    // Stable IDs make repeat imports safe while preserving duplicate source rows.
    const hash = createHash('sha256').update(`${identity}:${occurrence}`).digest('hex');
    const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
    return { id, task_id: String(r[0]), title: r[1] || r[0], date_completed: date.toISOString(), remarks: r[3] || '', subtasks: String(r[4] || '').split(' | ').filter(Boolean) };
  });
  await save('office_task_history', history, 'id');
  const byId = new Map<string, any>();
  for (let offset = 0; offset < history.length; offset += 100) {
    const { data: stored, error } = await db.from('office_task_history').select('id,date_completed,task_id,title,remarks,subtasks').in('id', history.slice(offset, offset + 100).map((r) => r.id));
    if (error) throw new Error(`History verification failed: ${error.message}`);
    for (const row of stored || []) byId.set(row.id, row);
  }
  for (const expected of history) {
    const actual = byId.get(expected.id);
    if (!actual || new Date(actual.date_completed).toISOString() !== expected.date_completed || actual.task_id !== expected.task_id || actual.title !== expected.title || actual.remarks !== expected.remarks || JSON.stringify(actual.subtasks) !== JSON.stringify(expected.subtasks)) {
      throw new Error(`History verification mismatch: ${expected.id}`);
    }
  }
  console.log(`Verified ${history.length} history entries against the source, including timestamps and content.`);
  return history.length;
}

async function main() {
  if (process.argv.includes('--history-only')) {
    await migrateHistory();
    return;
  }
  const categoryRows = await rows('Categories', 'A:B');
  const categories = categoryRows.slice(1).filter((r) => r[0]).map((r) => ({ name: r[0], color: r[1] || 'bg-slate-100 text-slate-600' }));
  await save('office_categories', categories, 'name');

  const taskRows = await rows('Tasks', 'A:I');
  const tasks = taskRows.slice(1).filter((r) => r[0] && r[2]).map((r) => ({
    id: r[0], category: r[1] || 'General', title: r[2], description: r[3] || '', frequency: r[4] || 'DAILY',
    completed: String(r[5]).toLowerCase() === 'completed', subtasks: json(r[6], []), created_at: r[7] || new Date().toISOString(), frequency_detail: r[8] || '',
  }));
  await save('office_tasks', tasks, 'id');

  const noteRows = await rows('Notes', 'A:G');
  const notes = noteRows.slice(1).filter((r) => r[0]).map((r) => ({ id: r[0], title: r[1] || '', content: r[2] || '', updated_at: r[3] || new Date().toISOString(), due_date: r[4] || null, category: r[5] || null, completed: String(r[6]).toLowerCase() === 'completed' }));
  await save('office_notes', notes, 'id');

  const historyCount = await migrateHistory();

  const settingsRows = await rows('StaffSettings', 'A:E');
  for (const row of settingsRows.slice(1).filter((r) => r[0])) {
    const { data: profile, error } = await db.from('profiles').select('id').ilike('email', String(row[0]).trim()).maybeSingle();
    if (error) throw new Error(`Settings profile lookup: ${error.message}`);
    if (profile) await save('office_staff_settings', [{ profile_id: profile.id, off_days: json(row[2], String(row[2] || '').split(',').filter(Boolean)), leave_periods: json(row[3], []), updated_at: row[4] || new Date().toISOString() }], 'profile_id');
    else console.warn('Skipped legacy staff settings: no matching authenticated profile.');
  }

  const linkRows = await rows('Portal', 'A:E');
  const links = linkRows.slice(1).filter((r) => r[0] && r[3]).map((r) => ({ id: r[0], folder: r[1] || 'General', title: r[2] || 'Link', url: r[3], created_at: r[4] || new Date().toISOString() }));
  await save('office_portal_links', links, 'id');

  console.log(`Import completed without overwriting existing records: ${categories.length} categories, ${tasks.length} tasks, ${notes.length} notes, ${historyCount} history entries and ${links.length} portal links processed.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
