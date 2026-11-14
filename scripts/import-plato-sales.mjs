// Imports the Plato Product Sales Report (Aggregate) exports into proc_sales.
// Usage: XLSX_LIB=<path to xlsx> node scripts/import-plato-sales.mjs <folder> [--apply]
// <folder> holds sales_KJ_q1.xls ... sales_SK_q4.xls: Jan-Mar, Apr-Jun, Jul-Sep, 1 Oct-14 Nov 2026. Dry run unless --apply.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const apply = process.argv.includes('--apply');
const folder = process.argv.slice(2).find((item) => !item.startsWith('--'));
if (!folder || !process.env.XLSX_LIB) { console.error('Usage: XLSX_LIB=<path to xlsx> node scripts/import-plato-sales.mjs <folder> [--apply]'); process.exit(1); }
const X = createRequire(import.meta.url)(process.env.XLSX_LIB);
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const hit = line.match(/^([A-Z_]+)=(.*)$/); if (hit && !process.env[hit[1]]) process.env[hit[1]] = hit[2].replace(/^["']|["']$/g, ''); }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } });
const PERIODS = { q1: ['2026-01-01', '2026-03-31'], q2: ['2026-04-01', '2026-06-30'], q3: ['2026-07-01', '2026-09-30'], q4: ['2026-10-01', '2026-11-14'] };
const money = (value) => { const text = String(value ?? '').trim(); const negative = /^\(.*\)$/.test(text); const number = Number(text.replace(/[^0-9.]/g, '')); return Number.isFinite(number) ? (negative ? -number : number) : 0; };

const ids = new Set();
for (let from = 0; ; from += 1000) { const { data, error } = await db.from('proc_items').select('plato_id').order('plato_id').range(from, from + 999); if (error) { console.error(error.message); process.exit(1); } data.forEach((row) => ids.add(row.plato_id)); if (data.length < 1000) break; }
const rows = []; let unknown = 0;
for (const location of ['KJ', 'SK']) for (const [key, [from, to]] of Object.entries(PERIODS)) {
  const book = X.readFile(`${folder}/sales_${location}_${key}.xls`);
  for (const row of X.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1 }).slice(1)) {
    const id = String(row[0] ?? '').trim();
    if (!id || row[1] === null || row[1] === undefined) continue; // category total rows have no inventory name
    if (!ids.has(id)) { unknown += 1; continue; }
    rows.push({ plato_id: id, location, period_from: from, period_to: to, qty: Number(row[5]) || 0, revenue: money(row[2]), cost: money(row[3]) });
  }
}
const merged = [...new Map(rows.map((row) => [`${row.plato_id}|${row.location}|${row.period_from}`, row])).values()];
console.log(`${merged.length} item rows (${unknown} not in the inventory list skipped). Qty sold: KJ ${merged.filter((r) => r.location === 'KJ').reduce((s, r) => s + r.qty, 0)}, SK ${merged.filter((r) => r.location === 'SK').reduce((s, r) => s + r.qty, 0)}`);
if (!apply) { console.log('Dry run only. Add --apply to write.'); process.exit(0); }
await db.from('proc_sales').delete().neq('location', '');
for (let i = 0; i < merged.length; i += 500) { const { error } = await db.from('proc_sales').insert(merged.slice(i, i + 500)); if (error) { console.error(error.message); process.exit(1); } }
console.log('Saved.');
