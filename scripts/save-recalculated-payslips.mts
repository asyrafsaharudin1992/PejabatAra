// Keeps payslip 2 (the month worked out again) on each affected November 2026 slip, as result.recalculated. The figures that were paid do not change.
// The file is the list of { employee_id, code, paid, correct } worked out from the pay run's own calculation. A slip is taken only when the paid figures in
// the file are still those on the slip.
//   npx tsx scripts/save-recalculated-payslips.mts <file.json>          check only
//   npx tsx scripts/save-recalculated-payslips.mts <file.json> save     back up the slips, then save
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
const { createClient } = createRequire(import.meta.url)('@supabase/supabase-js');
const env: any = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')]; }));
const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, realtime: { transport: class {} } });
const save = process.argv[3] === 'save';
const list: any[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const writes: any[] = []; let failed = 0;
for (const item of list) {
  const { data: slip, error } = await db.from('hr_payslips').select('result,status').eq('employee_id', item.employee_id).eq('year', 2026).eq('month', 11).maybeSingle();
  if (error) throw error;
  const r = slip?.result;
  if (!r || slip.status !== 'locked' || r.net !== item.paid.net || r.gross !== item.paid.gross) { failed++; console.log('NO  ', item.code, 'the slip is not as it was when worked out'); continue; }
  const { leave, ...again } = item.correct;
  console.log('ok  ', item.code, `nett paid ${r.net.toFixed(2)} | should be ${again.net.toFixed(2)} | ${r.net >= again.net ? 'over' : 'under'} ${Math.abs(r.net - again.net).toFixed(2)}`);
  writes.push({ id: item.employee_id, code: item.code, before: r, result: { ...r, recalculated: again } });
}
console.log(`${list.length} looked at, ${writes.length} to save, ${failed} that do not match.`);
if (!save) { console.log('Check only. Nothing was saved.'); process.exit(0); }
if (failed || !writes.length) { console.log('Nothing was saved.'); process.exit(1); }
const file = `${os.homedir()}/Downloads/Payslip Infotech 2026/backup/payslips-before-recalculated-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify(writes.map((item) => ({ employee_id: item.id, code: item.code, year: 2026, month: 11, result: item.before })), null, 1), { mode: 0o600, flag: 'wx' });
let saved = 0;
for (const item of writes) {
  const { data, error } = await db.from('hr_payslips').update({ result: item.result }).eq('employee_id', item.id).eq('year', 2026).eq('month', 11).eq('status', 'locked').select('month');
  if (error) throw error;
  saved += data.length;
}
console.log(`Saved ${saved}. Backup: ${file}`);
