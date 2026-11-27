// usage (from the project folder): npx tsx scripts/upload-infotech-payslips.mts <folder of MM_CODE.pdf files>
// Puts the Infotech payslips (January to October 2026) in the private bucket "infotech-payslips", at 2026/MM/<employee id>.pdf.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { infotechPath } from '../api/_payslip-infotech.ts';
const { createClient } = createRequire(import.meta.url)('@supabase/supabase-js');
const env: any = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')]; }));
const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, realtime: { transport: class {} } });
const folder = process.argv[2];
const bucket = await db.storage.getBucket('infotech-payslips');
if (bucket.error) { const made = await db.storage.createBucket('infotech-payslips', { public: false, allowedMimeTypes: ['application/pdf'], fileSizeLimit: 1024 * 1024 }); if (made.error) throw made.error; }
else if (bucket.data.public) throw new Error('The bucket is public. Nothing was uploaded.');
const { data: staff, error } = await db.from('hr_employees').select('id,employee_code').limit(2000);
if (error) throw error;
const ids = new Map(staff.map((row: any) => [row.employee_code, row.id]));
const { data: slips } = await db.from('hr_payslips').select('employee_id,month').eq('year', 2026).lte('month', 10).limit(3000);
const known = new Set(slips.map((row: any) => `${row.employee_id}|${row.month}`));
const files = fs.readdirSync(folder).filter((name) => /^\d\d_[A-Z0-9]+\.pdf$/.test(name));
const plan = files.map((name) => { const month = Number(name.slice(0, 2)), id = ids.get(name.slice(3, -4)) as string; if (!id || !known.has(`${id}|${month}`)) throw new Error(`No AraOffice payslip for ${name}. Nothing was uploaded.`); return { name, path: infotechPath(id, 2026, month) }; });
let done = 0;
for (let at = 0; at < plan.length; at += 5) await Promise.all(plan.slice(at, at + 5).map(async (item) => { const result = await db.storage.from('infotech-payslips').upload(item.path, fs.readFileSync(`${folder}/${item.name}`), { contentType: 'application/pdf', upsert: true }); if (result.error) throw new Error(`${item.name}: ${result.error.message}`); done++; }));
let stored = 0;
for (let month = 1; month <= 10; month++) stored += (await db.storage.from('infotech-payslips').list(`2026/${String(month).padStart(2, '0')}`, { limit: 1000 })).data.length;
const open = await fetch(db.storage.from('infotech-payslips').getPublicUrl(plan[0].path).data.publicUrl);
console.log('uploaded', done, 'stored', stored, 'AraOffice slips', known.size, '| public link answers', open.status);
