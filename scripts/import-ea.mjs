// Imports the Borang EA figures exported from Infotech (EA Form > Export to Excel) into hr_ea_annual.
// Usage: node scripts/import-ea.mjs <year> <parsed.json> [<parsed2.json> ...]   (dry run; add --apply to write)
// The JSON files come from reading each "EA Details" sheet: [{ code, name, fields: { 'B1(A)': '...', ... }, lines: ['LABEL~exemption~cp58~amount~eaAmount'] }].
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const apply = process.argv.includes('--apply');
const [year, ...files] = process.argv.slice(2).filter((item) => item !== '--apply');
if (!/^\d{4}$/.test(year || '') || !files.length) { console.error('Usage: node scripts/import-ea.mjs <year> <parsed.json>... [--apply]'); process.exit(1); }
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const hit = line.match(/^([A-Z_]+)=(.*)$/); if (hit && !process.env[hit[1]]) process.env[hit[1]] = hit[2].replace(/^["']|["']$/g, ''); }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } });

const number = (value) => Math.round((Number(String(value ?? '').replace(/,/g, '')) || 0) * 100) / 100;
const lineAmount = (person, label) => number(person.lines.filter((item) => item.split('~')[0].trim().toUpperCase() === label).reduce((sum, item) => sum + number(item.split('~')[4] || item.split('~')[3]), 0));

const { data: staff, error } = await db.from('hr_employees').select('id,employee_code,company,full_name').limit(2000);
if (error) { console.error('Could not read hr_employees:', error.message); process.exit(1); }
const byCode = new Map(staff.map((row) => [row.employee_code, row]));

const rows = [], missing = [];
for (const file of files) for (const person of JSON.parse(readFileSync(file, 'utf8'))) {
  const match = byCode.get(person.code);
  if (!match) { missing.push(`${person.code} ${person.name}`); continue; }
  const f = person.fields;
  rows.push({ employee_id: match.id, year: Number(year), gross_wages: number(f['B1(A)']), fees_bonus: number(f['B1(B)']), allowances: number(f['B1(C)']), mtd: number(f.D1), child_relief: number(f.D6), kwsp: number(f.E1),
    socso: lineAmount(person, 'EMP. SOCSO'), eis: lineAmount(person, 'EMP. EIS'),
    details: person.lines.map((item) => { const [name, exemption, cp58, amount, eaAmount] = item.split('~'); return { name, exemption, cp58, amount: number(amount), eaAmount: number(eaAmount) }; }), source: 'Infotech' });
}
console.log(`${rows.length} staff matched, ${missing.length} not found in AraOffice${missing.length ? ':\n  ' + missing.join('\n  ') : ''}`);
console.log('Totals: gross', rows.reduce((s, r) => s + r.gross_wages, 0).toFixed(2), '· PCB', rows.reduce((s, r) => s + r.mtd, 0).toFixed(2), '· KWSP', rows.reduce((s, r) => s + r.kwsp, 0).toFixed(2));
if (!apply) { console.log('Dry run only. Add --apply to write.'); process.exit(0); }
const { error: writeError } = await db.from('hr_ea_annual').upsert(rows, { onConflict: 'employee_id,year' });
if (writeError) { console.error('Write failed:', writeError.message); process.exit(1); }
console.log(`Saved ${rows.length} rows for ${year}.`);
