// Keeps on each January-October 2026 payslip what Infotech printed: the designation of that month, the bank, and every line of the Earnings and Deductions
// columns (increment, advance and other deduction names, OT and rest / holiday lines, no pay). The AraOffice payslip then prints those lines. No money figure
// of the slip changes; a slip is taken only when the printed lines add up to its totals. rows.json comes from scripts/payslip-rows.swift.
//   npx tsx scripts/align-infotech-print.mts <rows.json>          check only
//   npx tsx scripts/align-infotech-print.mts <rows.json> save     back up the slips, then save
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
const { createClient } = createRequire(import.meta.url)('@supabase/supabase-js');
const env: any = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')]; }));
const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, realtime: { transport: class {} } });
const save = process.argv[3] === 'save';
const pages: any[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const round = (value: number) => Math.round(value * 100) / 100, number = (text: string) => Number(text.replace(/,/g, ''));
const { data: staff, error: staffError } = await db.from('hr_employees').select('id,employee_code').limit(2000);
if (staffError) throw staffError;
const ids = new Map(staff.map((row: any) => [row.employee_code, row.id]));
const writes: any[] = []; let failed = 0, none = 0, same = 0;
for (const page of pages) {
  const code = page.text.match(/\b(?:INTR)?ARA(?:SK)?\d{2,4}\b/)[0], month = Number(page.file.slice(5, 7));
  const { data: slip, error } = await db.from('hr_payslips').select('result,status').eq('employee_id', ids.get(code)).eq('year', 2026).eq('month', month).maybeSingle();
  if (error) throw error;
  if (!slip) { none++; continue; } // a page with no pay at all is not kept in AraOffice
  const r = slip.result;
  // The INCREMENT line is information only: its figure is part of the basic pay, so it is kept in the words and not added.
  const rows = (list: string[][]) => (list || []).map(([name, amount]): [string, number | null] => /^INCREMENT :/.test(name) ? [`${name} ${amount}`.replace(/\s+/g, ' ').trim(), null] : [name, amount ? number(amount) : null]);
  const earnings = rows(page.earnings), deductions = rows(page.deductions);
  const total = (list: [string, number | null][]) => round(list.reduce((sum, [, value]) => sum + (value ?? 0), 0));
  const noPay = r.noPay || 0, wantEarnings = round(r.gross + noPay + (r.infotechIncentive || 0)), wantDeductions = round((r.deductions || 0) + noPay);
  const bankName = page.text.match(/Bank Name1 : (.+?)\s+Ac\.No1/)?.[1]?.trim() || '', account = page.text.match(/Ac\.No1 : ?(\d+)/)?.[1] || '';
  // What is left after the statutory lines must be the money total of the other deductions.
  const statutory = round(['kwspEmployee', 'socsoEmployee', 'eisEmployee', 'skbbk', 'pcb'].reduce((sum, key) => sum + (Number(r[key]) || 0), 0));
  const problem = r.source !== 'Infotech' || slip.status !== 'locked' ? 'not a locked Infotech slip'
    : !page.designation ? 'designation not read'
    : total(earnings) !== wantEarnings ? `earnings lines add to ${total(earnings)}, slip ${wantEarnings}`
    : total(deductions) !== wantDeductions ? `deduction lines add to ${total(deductions)}, slip ${wantDeductions} (statutory ${statutory})` : '';
  if (problem) { failed++; console.log('NO  ', code, `month ${month}`, problem); continue; }
  const printed = { designation: page.designation, bankName, account, earnings, deductions };
  if (JSON.stringify(r.printed) === JSON.stringify(printed)) { same++; continue; }
  writes.push({ id: ids.get(code), code, month, before: r, result: { ...r, printed } });
}
console.log(`${pages.length} pages looked at, ${writes.length} to save, ${same} already saved, ${failed} that do not match, ${none} with no payslip in AraOffice.`);
if (!save) { console.log('Check only. Nothing was saved.'); process.exit(0); }
if (failed || !writes.length) { console.log('Nothing was saved.'); process.exit(1); }
const file = `${os.homedir()}/Downloads/Payslip Infotech 2026/backup/payslips-before-print-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify(writes.map((item) => ({ employee_id: item.id, code: item.code, year: 2026, month: item.month, result: item.before })), null, 1), { mode: 0o600, flag: 'wx' });
let saved = 0;
for (const item of writes) {
  const { data, error } = await db.from('hr_payslips').update({ result: item.result }).eq('employee_id', item.id).eq('year', 2026).eq('month', item.month).eq('status', 'locked').select('month');
  if (error) throw error;
  saved += data.length;
}
console.log(`Saved ${saved}. Backup: ${file}`);
