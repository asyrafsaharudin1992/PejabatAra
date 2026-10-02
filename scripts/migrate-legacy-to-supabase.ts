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

async function save(table: string, records: any[], onConflict: string) {
  if (!records.length) return;
  const { error } = await db.from(table).upsert(records, { onConflict, ignoreDuplicates: true });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function migrateTrackers() {
  const trackerRows = await rows('Tracker', 'A:Y');
  const trackerColumns = [
    'tracker_date',
    'clinical_audit_individual_feedback',
    'clinical_audit_reporting',
    'follow_up_referred_cases',
    'in_house_guidelines',
    'documenting_in_plato',
    'graphic_design',
    'email_correspondence',
    'new_membership_data_update',
    'cme_for_doctors',
    'google_review_response',
    'locum_qr_scan_review',
    'damage_control',
    'social_media',
    'in_house_app_system_maintenance',
    'corporate_collaborations',
    'locumhub_performance_key_in',
    'locum_interview_feedback',
    'birthday_wishes',
    'others',
    'desktop_ops_drive_clearance',
    'locum_directory_update',
    'finding_replacement',
    'meeting',
    'doctors_schedule_locum_slots',
  ];
  const trackers = trackerRows.slice(1).filter((row) => row[0]).map((row) =>
    Object.fromEntries(trackerColumns.map((column, index) => [column, String(row[index] || '').trim()]))
  );
  await save('office_trackers', trackers, 'tracker_date');
  return trackers.length;
}

async function main() {
  if (process.argv.includes('--tracker-only')) {
    const trackerCount = await migrateTrackers();
    console.log(`Tracker import completed: ${trackerCount} dates processed. No other Google Sheet tabs were read.`);
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

  const linkRows = await rows('Portal', 'A:E');
  const links = linkRows.slice(1).filter((r) => r[0] && r[3]).map((r) => ({ id: r[0], folder: r[1] || 'General', title: r[2] || 'Link', url: r[3], created_at: r[4] || new Date().toISOString() }));
  await save('office_portal_links', links, 'id');

  const trackerCount = await migrateTrackers();

  console.log(`Import completed without overwriting existing records: ${categories.length} categories, ${tasks.length} tasks, ${notes.length} notes, ${links.length} portal links and ${trackerCount} tracker dates processed. User and History sheets are intentionally excluded.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
