// Makes the January-October 2026 slips already in AraOffice show the same lines as the Infotech payslips, read from the payslip text:
//   - TOTAL NO PAY (full basic pay, with unpaid leave or absence under deductions);
//   - an incentive Infotech lists under earnings but pays outside the nett wages;
//   - a notice-pay claim, shown as a deduction instead of two offsetting lines.
// No money figure is changed (basic, gross, deductions, net, tax stay). Run from the project folder:
//   npx tsx scripts/align-infotech-slips.mts <pages.json>          check only
//   npx tsx scripts/align-infotech-slips.mts <pages.json> save     back up the slips, then save
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
const { createClient } = createRequire(import.meta.url)('@supabase/supabase-js');
const env: any = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')]; }));
const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, realtime: { transport: class {} } });
const save = process.argv[3] === 'save';
const pages: any[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter((page: any) => /TOTAL NO PAY|INCENTIVES|TUNTUTAN GANTI NOTIS/.test(page.text));
const round = (value: number) => Math.round(value * 100) / 100, number = (text: string) => Number(text.replace(/,/g, ''));
const { data: staff } = await db.from('hr_employees').select('id,employee_code').limit(2000);
const ids = new Map(staff.map((row: any) => [row.employee_code, row.id]));
const backup: any[] = [], writes: any[] = []; let failed = 0;
for (const page of pages) {
  const code = page.text.match(/\b(?:INTR)?ARA(?:SK)?\d{2,4}\b/)[0], month = Number(page.file.slice(5, 7));
  const lines = [...page.text.matchAll(/- ([A-Za-z .\/]+?) - ([\d.]+) (Days?|Hours?|Hrs)\s*=\s*([\d,]+\.\d\d)/g)].map((m: any) => ({ kind: m[1], qty: Number(m[2]), unit: m[3], amount: number(m[4]) }));
  const noPay = round(lines.reduce((sum, line) => sum + line.amount, 0));
  const { data: slip, error } = await db.from('hr_payslips').select('result,inputs,status').eq('employee_id', ids.get(code)).eq('year', 2026).eq('month', month).maybeSingle();
  if (error) throw error;
  if (!slip) continue; // a page with no pay at all is not kept in AraOffice
  const r = slip.result, printed = new Set<number>((page.text.match(/\d[\d,]*\.\d\d/g) || []).map(number));
  const result = { ...r }; let inputs = slip.inputs; const changes: string[] = [];
  const base = r.source === 'Infotech' && slip.status === 'locked' && printed.has(round(r.net));
  let ok = base;
  const earnings = round(r.gross + noPay), deductions = round(r.deductions + noPay);
  if (page.text.includes('TOTAL NO PAY')) {
    ok = ok && lines.length > 0 && printed.has(round(r.basic + noPay)) && printed.has(deductions);
    if (r.noPay === undefined) {
      Object.assign(result, { noPay, noPayLines: lines });
      if (lines.every((line) => /unpaid/i.test(line.kind) && /day/i.test(line.unit))) inputs = { ...inputs, unpaidDays: round(lines.reduce((sum, line) => sum + line.qty, 0)) };
      changes.push(`no pay ${noPay}`);
    }
  }
  if (page.text.includes('INCENTIVES') && !(r.allowances || []).some((item: any) => /incentive/i.test(item.name)) && r.infotechIncentive === undefined) {
    // The incentive is the difference between the printed Total Earnings and the saved gross wages.
    const totals = [...printed].filter((value) => value > earnings && printed.has(round(value - earnings))).sort((a, b) => a - b);
    ok = ok && totals.length > 0 && printed.has(deductions);
    if (totals.length) { result.infotechIncentive = round(totals[0] - earnings); changes.push(`incentive ${result.infotechIncentive}`); }
  }
  const notice = (r.allowances || []).find((item: any) => item.name === 'Tuntutan Ganti Notis' && item.amount < 0);
  if (notice) {
    const offset = (r.allowances || []).find((item: any) => item.name === 'Other pay' && round(item.amount + notice.amount) === 0);
    ok = ok && Boolean(offset) && printed.has(round(-notice.amount)) && printed.has(deductions);
    if (offset) { result.allowances = r.allowances.filter((item: any) => item !== notice && item !== offset); result.deductionLines = [{ name: 'TUNTUTAN GANTI NOTIS', amount: round(-notice.amount) }]; changes.push(`notice claim ${-notice.amount}`); }
  }
  if (!ok) { failed++; console.log('NO  ', code, `month ${month}`); }
  else if (changes.length) {
    console.log('ok  ', code, `month ${month}`, changes.join(', '));
    backup.push({ employee_id: ids.get(code), code, year: 2026, month, result: r, inputs: slip.inputs });
    writes.push({ id: ids.get(code), month, result, inputs });
  }
}
console.log(`${pages.length} slips looked at, ${writes.length} to save, ${failed} that do not match.`);
if (!save) { console.log('Check only. Nothing was saved.'); process.exit(0); }
if (failed || !writes.length) { console.log('Nothing was saved.'); process.exit(1); }
const file = `${os.homedir()}/Downloads/Payslip Infotech 2026/backup/payslips-before-align-${Date.now()}.json`;
fs.mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
fs.writeFileSync(file, JSON.stringify(backup, null, 1), { mode: 0o600, flag: 'wx' });
let saved = 0;
for (const item of writes) {
  const { data, error } = await db.from('hr_payslips').update({ result: item.result, inputs: item.inputs }).eq('employee_id', item.id).eq('year', 2026).eq('month', item.month).eq('status', 'locked').select('month');
  if (error) throw error;
  saved += data.length;
}
console.log(`Saved ${saved}. Backup: ${file}`);
