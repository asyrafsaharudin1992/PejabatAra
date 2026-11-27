// Puts the incentive (and care coordinator) lines HR keyed into Infotech after the payslips were first brought over, onto those AraOffice payslips, and
// replaces the staff member's Infotech PDF. Gross and nett go up by the line; EPF, SOCSO, PCB and the year-to-date taxable wages stay (an incentive is not
// taxed). A slip is changed only when its new Infotech page prints exactly the saved gross and nett plus that line.
// pages.json comes from scripts/payslip-text.swift on the new files; <pdf folder> holds one MM_CODE.pdf per page (scripts/split-pdf.swift).
//   npx tsx scripts/apply-infotech-incentives.mts <pages.json> <report.txt> <pdf folder>          check only
//   npx tsx scripts/apply-infotech-incentives.mts <pages.json> <report.txt> <pdf folder> save     back up, then save
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { infotechPath } from '../api/_payslip-infotech.ts';
const { createClient } = createRequire(import.meta.url)('@supabase/supabase-js');
const env: any = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')]; }));
const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, realtime: { transport: class {} } });
const [pagesFile, reportFile, folder, mode] = process.argv.slice(2);
const save = mode === 'save';
const pages: any[] = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
const round = (value: number) => Math.round(value * 100) / 100, number = (text: string) => Number(text.replace(/,/g, ''));
// The Infotech incentive report: a heading per company and month, then "code <tab> amount".
const report = new Map<string, number>(); let month = 0;
for (const line of fs.readFileSync(reportFile, 'utf8').split('\n')) {
  const heading = line.match(/^(?:KJ|SK) (April|Oktober)/); if (heading) month = heading[1] === 'April' ? 4 : 10;
  const row = line.match(/^(ARA\w+)\t([\d.]+)/); if (row) report.set(`${month}|${row[1]}`, Number(row[2]));
}
const { data: staff, error: staffError } = await db.from('hr_employees').select('id,employee_code').limit(2000);
if (staffError) throw staffError;
const ids = new Map(staff.map((row: any) => [row.employee_code, row.id]));
const writes: any[] = []; const seen = new Set<string>(); let failed = 0, already = 0;
for (const page of pages) {
  const code = page.text.match(/\b(?:INTR)?ARA(?:SK)?\d{2,4}\b/)[0], at = Number(page.file.slice(5, 7)), key = `${at}|${code}`;
  seen.add(key);
  const { data: slip, error } = await db.from('hr_payslips').select('result,status').eq('employee_id', ids.get(code)).eq('year', 2026).eq('month', at).maybeSingle();
  if (error) throw error;
  if (!slip) { if (report.has(key)) { failed++; console.log('NO  ', code, `month ${at}`, 'no payslip in AraOffice'); } continue; }
  const r = slip.result, printed = new Set<number>((page.text.match(/\d[\d,]*\.\d\d/g) || []).map(number));
  const care = page.text.includes('CARE COORDINAT') && !(r.allowances || []).some((item: any) => /care coordinat/i.test(item.name));
  const listed = (r.allowances || []).some((item: any) => /^incentives?$/i.test(item.name)) || r.infotechIncentive !== undefined;
  const incentive = report.get(key) || 0;
  if (incentive && listed) { already++; continue; }
  // The care coordinator line is not in the incentive report: its amount is what the printed gross wages went up by.
  let amount = incentive, name = 'Incentives';
  if (!incentive && care) { name = 'Allowance Care Coordinater'; const found = [...printed].filter((value) => value > 0 && value <= 500 && printed.has(round(r.gross + value)) && printed.has(round(r.net + value))); amount = found.length === 1 ? found[0] : 0; if (!amount) { failed++; console.log('NO  ', code, `month ${at}`, 'care coordinator amount not clear'); continue; } }
  if (!amount) {
    if (!printed.has(round(r.gross)) || !printed.has(round(r.net))) { failed++; console.log('NO  ', code, `month ${at}`, 'page no longer shows the saved gross/nett, and no incentive explains it'); }
    continue;
  }
  const text = incentive ? page.text.includes('INCENTIVES') : care;
  const ok = text && !(incentive && care) && r.source === 'Infotech' && slip.status === 'locked' && printed.has(amount) && printed.has(round(r.gross + amount)) && printed.has(round(r.net + amount)) && printed.has(round((r.deductions || 0) + (r.noPay || 0))) && fs.existsSync(`${folder}/${String(at).padStart(2, '0')}_${code}.pdf`);
  if (!ok) { failed++; console.log('NO  ', code, `month ${at}`, name, amount); continue; }
  console.log('ok  ', code, `month ${at}`, `${name} ${amount.toFixed(2)} | gross ${r.gross.toFixed(2)} > ${round(r.gross + amount).toFixed(2)} | nett ${r.net.toFixed(2)} > ${round(r.net + amount).toFixed(2)}`);
  writes.push({ id: ids.get(code), code, month: at, before: r, amount, name, result: { ...r, allowances: [...(r.allowances || []), { name, amount }], gross: round(r.gross + amount), net: round(r.net + amount) } });
}
for (const key of report.keys()) if (!seen.has(key)) { failed++; console.log('NO  ', key, 'is in the report but has no payslip page'); }
for (const at of [4, 10]) { const list = writes.filter((item) => item.month === at); console.log(`Month ${at}: ${list.length} slips, RM ${list.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}`); }
console.log(`${pages.length} pages looked at, ${writes.length} to save, ${already} already have the line, ${failed} that do not match.`);
if (!save) { console.log('Check only. Nothing was saved.'); process.exit(0); }
if (failed || !writes.length) { console.log('Nothing was saved.'); process.exit(1); }
const file = `${os.homedir()}/Downloads/Payslip Infotech 2026/backup/payslips-before-incentive-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify(writes.map((item) => ({ employee_id: item.id, code: item.code, year: 2026, month: item.month, result: item.before })), null, 1), { mode: 0o600, flag: 'wx' });
let saved = 0, uploaded = 0;
for (const item of writes) {
  const { data, error } = await db.from('hr_payslips').update({ result: item.result }).eq('employee_id', item.id).eq('year', 2026).eq('month', item.month).eq('status', 'locked').select('month');
  if (error) throw error;
  if (!data.length) continue;
  saved++;
  const put = await db.storage.from('infotech-payslips').upload(infotechPath(item.id, 2026, item.month), fs.readFileSync(`${folder}/${String(item.month).padStart(2, '0')}_${item.code}.pdf`), { contentType: 'application/pdf', upsert: true });
  if (put.error) throw new Error(`${item.code} month ${item.month}: PDF not replaced (${put.error.message})`);
  uploaded++;
}
console.log(`Saved ${saved} slips, replaced ${uploaded} PDFs. Backup: ${file}`);
