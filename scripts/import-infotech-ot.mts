// Brings the OT claims approved in Infotech (Attendance Request Status Report, CSV, one file per company) into hr_attendance_ot for the days before
// AraOffice took over (up to 19 October 2026), so the OT reports cover those months. Locked payslips are not touched. Run from the project folder:
//   npx tsx scripts/import-infotech-ot.mts <folder with the CSV files>          check only
//   npx tsx scripts/import-infotech-ot.mts <folder with the CSV files> save     save the new rows
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { payPeriod } from '../src/lib/payrollRun.ts';
const { createClient } = createRequire(import.meta.url)('@supabase/supabase-js');
const env: any = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')]; }));
const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, realtime: { transport: class {} } });
const folder = process.argv[2], save = process.argv[3] === 'save';
const LAST = '2026-10-19';
function csv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (quoted) { if (char === '"' && text[at + 1] === '"') { cell += '"'; at++; } else if (char === '"') quoted = false; else cell += char; }
    else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const iso = (text: string) => /^(\d\d)-(\d\d)-(\d{4})$/.test(text) ? text.split('-').reverse().join('-') : '';
const hours = (text: string) => Number(text) || 0;
const { data: staff, error } = await db.from('hr_employees').select('id,employee_code').limit(2000);
if (error) throw error;
const ids = new Map(staff.map((row: any) => [row.employee_code, row.id]));
const rows: any[] = [], claims: any[] = [], skipped: Record<string, number> = {};
const skip = (why: string) => { skipped[why] = (skipped[why] || 0) + 1; };
for (const name of fs.readdirSync(folder).filter((file) => file.endsWith('.csv'))) {
  for (const line of csv(fs.readFileSync(`${folder}/${name}`, 'utf8').replace(/^﻿/, ''))) {
    const at = line.indexOf('Emp Code :'), end = line.indexOf('Total :');
    if (at < 0 || end < 0) continue;
    const code = line[at + 1].trim(), cell = line.slice(at + 6, end);
    // One claim: date, day, ..., approved OT hours at 1.0 / 1.5 / 2.0 / 3.0 / flat (26-30), status (31), approver (33), remarks (34).
    if (cell.length !== 38) throw new Error(`${name}: a row of ${code} is not in the expected layout (${cell.length} columns).`);
    const date = iso(cell[0]), status = cell[31].trim().toUpperCase(), id = ids.get(code);
    if (!date || date > LAST) { skip('date outside the range'); continue; }
    if (status !== 'APPROVED') { skip(`status ${status || 'blank'}`); continue; }
    const parts = ([[26, 1], [27, 1.5], [28, 2], [29, 3]] as const).map(([column, multiplier]) => ({ minutes: Math.round(hours(cell[column]) * 60), multiplier })).filter((part) => part.minutes > 0);
    const flat = hours(cell[30]);
    claims.push({ code, date, parts, flat, known: Boolean(id) });
    if (!id) { skip('staff not in AraOffice'); continue; }
    if (!parts.length) { skip(flat ? 'flat claim only (no rate column to keep it in)' : 'no approved hours'); continue; }
    const total = parts.reduce((sum, part) => sum + part.minutes, 0), main = [...parts].sort((a, b) => b.minutes - a.minutes)[0];
    rows.push({ employee_id: id, work_date: date, captured_minutes: total, status: 'approved', approved_minutes: total, multiplier: main.multiplier, parts: parts.length > 1 ? parts : [], note: `Brought over from Infotech (approved there: ${cell[33].trim().slice(0, 80)})${flat ? `, flat ${flat.toFixed(2)}` : ''}`, decided_by: 'Infotech migration', decided_at: new Date(`${iso(cell[37]) || date}T00:00:00+08:00`).toISOString() });
  }
}
if (new Set(rows.map((row) => `${row.employee_id}|${row.work_date}`)).size !== rows.length) throw new Error('The same person and day appears twice. Nothing was saved.');
const { data: existing, error: readError } = await db.from('hr_attendance_ot').select('employee_id,work_date').lte('work_date', LAST).limit(5000);
if (readError) throw readError;
const have = new Set(existing.map((row: any) => `${row.employee_id}|${row.work_date}`));
const fresh = rows.filter((row) => !have.has(`${row.employee_id}|${row.work_date}`));
console.log('claims read', claims.length, '| to add', fresh.length, '| already there', rows.length - fresh.length, '| left out', JSON.stringify(skipped));
// Compare, for each pay month, the approved hours at each rate with the hours printed on the Infotech payslips.
const pagesFile = `${folder}/../Payslip Infotech 2026/pages.json`;
if (fs.existsSync(pagesFile)) {
  const pages: any[] = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
  for (let month = 1; month <= 10; month++) {
    const period = payPeriod(2026, month); let same = 0; const differ: string[] = [];
    const slip = new Map<string, number>(), asked = new Map<string, number>();
    for (const page of pages.filter((item) => Number(item.file.slice(5, 7)) === month)) { const code = page.text.match(/\b(?:INTR)?ARA(?:SK)?\d{2,4}\b/)?.[0]; for (const match of page.text.matchAll(/- \[OT ([\d.]+)\] ([\d.]+) Hrs/g)) slip.set(code, (slip.get(code) || 0) + Number(match[2])); }
    for (const claim of claims.filter((item) => item.date >= period.from && item.date <= period.to)) { const sum = claim.parts.reduce((total: number, part: any) => total + part.minutes / 60, 0); if (sum) asked.set(claim.code, (asked.get(claim.code) || 0) + sum); }
    for (const code of new Set([...slip.keys(), ...asked.keys()])) if (Math.abs((slip.get(code) || 0) - (asked.get(code) || 0)) < 0.05) same++; else differ.push(`${code} slip ${slip.get(code) || 0}h claim ${Math.round((asked.get(code) || 0) * 100) / 100}h`);
    console.log(`month ${month}: same ${same}, differ ${differ.length}${differ.length ? ` (${differ.join('; ')})` : ''}`);
  }
}
if (!save) { console.log('Check only. Nothing was saved.'); process.exit(0); }
if (!fresh.length) { console.log('Nothing new to save.'); process.exit(0); }
for (let at = 0; at < fresh.length; at += 200) { const result = await db.from('hr_attendance_ot').upsert(fresh.slice(at, at + 200), { onConflict: 'employee_id,work_date', ignoreDuplicates: true }); if (result.error) throw result.error; }
console.log('Saved', fresh.length);
