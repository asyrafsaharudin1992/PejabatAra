// Saves a copy of the AraOffice data in Supabase to a dated folder on this computer (outside the project, so
// it is never committed): one JSON and one CSV file per table, plus a summary of row counts.
//   npm run export:data              -> ~/AraOffice-Backup/<date-time>/
//   npm run export:data -- /some/folder
// Passwords, device keys and sign-in sessions are left out. The files hold staff IC numbers, bank and salary
// details, so keep the folder private (do not share it or put it in a public place).
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

config({ path: '.env.local', quiet: true });
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Supabase settings are missing in .env.local.'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket } });

const TABLES = [
  'profiles', 'branches',
  'hr_employees', 'hr_audit', 'hr_leave_balances', 'hr_leave_requests', 'hr_roster', 'hr_reviews',
  'incentive_claims',
  'assessment_staff', 'assessment_quizzes', 'assessment_attempts',
  'clinical_tasks', 'clinical_orders', 'clinical_reports', 'clinical_monthly_done', 'clinical_vaccine_bookings',
  'office_categories', 'office_notes', 'office_portal_links', 'office_staff_settings', 'office_task_history', 'office_tasks', 'office_trackers',
  'panels', 'panel_guides', 'service_catalog_items', 'service_faqs', 'service_folders', 'teamara_messages', 'portal_state',
];
// Never exported: secrets.
const SECRET_COLUMNS = new Set(['password_hash', 'ic4_hash']);

const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' }).replace(' ', '_').replace(/:/g, '').slice(0, 15);
const folder = process.argv[2] || join(homedir(), 'AraOffice-Backup', stamp);
mkdirSync(folder, { recursive: true });

const csvCell = (value) => { if (value === null || value === undefined) return ''; const text = typeof value === 'object' ? JSON.stringify(value) : String(value); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
async function readAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').range(from, from + 999);
    if (error) return { error };
    rows.push(...data);
    if (data.length < 1000) return { rows };
  }
}

const summary = [];
for (const table of TABLES) {
  const { rows, error } = await readAll(table);
  if (error) { summary.push({ table, rows: null, note: error.code === 'PGRST205' || error.code === '42P01' ? 'table not found' : error.message }); continue; }
  const clean = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([name]) => !SECRET_COLUMNS.has(name))));
  writeFileSync(join(folder, `${table}.json`), JSON.stringify(clean, null, 1));
  const columns = clean.length ? Object.keys(clean[0]) : [];
  writeFileSync(join(folder, `${table}.csv`), [columns.join(','), ...clean.map((row) => columns.map((name) => csvCell(row[name])).join(','))].join('\n'));
  summary.push({ table, rows: clean.length });
}
writeFileSync(join(folder, '_summary.json'), JSON.stringify({ savedAt: new Date().toISOString(), project: url, tables: summary }, null, 1));
console.log(`Saved to ${folder}`);
for (const item of summary) console.log(`${String(item.rows ?? '-').padStart(6)}  ${item.table}${item.note ? `  (${item.note})` : ''}`);
