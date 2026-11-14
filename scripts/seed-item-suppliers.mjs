// Adds, for every item, the suppliers it was bought from on permanent orders (KJ and SK) to proc_item_suppliers, and makes the one bought most often
// (the latest if they tie) the preferred supplier. Items the CPO has saved by hand (rows with auto = false) are left alone; the rest are refreshed.
// Usage: node scripts/seed-item-suppliers.mjs [--apply]   (dry run by default)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const apply = process.argv.includes('--apply');
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const hit = line.match(/^([A-Z_]+)=(.*)$/); if (hit && !process.env[hit[1]]) process.env[hit[1]] = hit[2].replace(/^["']|["']$/g, ''); }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } });
const all = async (query) => { const rows = []; for (let from = 0; ; from += 1000) { const { data, error } = await query(from, from + 999); if (error) { console.error(error.message); process.exit(1); } rows.push(...data); if (data.length < 1000) break; } return rows; };

const lines = await all((from, to) => db.from('proc_order_lines').select('order_id,line,plato_id,proc_orders!inner(order_date,supplier,location,status)').not('plato_id', 'is', null).eq('proc_orders.status', 'Permanent').neq('proc_orders.location', 'SY').order('order_id').order('line').range(from, to));
const per = new Map();
for (const row of lines) {
  const order = Array.isArray(row.proc_orders) ? row.proc_orders[0] : row.proc_orders;
  if (!order?.supplier) continue;
  const item = per.get(row.plato_id) || new Map();
  const entry = item.get(order.supplier) || { times: 0, last: '' };
  entry.times += 1; if (order.order_date > entry.last) entry.last = order.order_date;
  item.set(order.supplier, entry); per.set(row.plato_id, item);
}
const manual = new Set((await all((from, to) => db.from('proc_item_suppliers').select('plato_id').eq('auto', false).range(from, to))).map((row) => row.plato_id));
const rows = [];
for (const [id, suppliers] of per) {
  if (manual.has(id)) continue;
  const ranked = [...suppliers.entries()].sort((a, b) => b[1].times - a[1].times || b[1].last.localeCompare(a[1].last));
  ranked.forEach(([supplier], index) => rows.push({ plato_id: id, supplier, preferred: index === 0, note: '', auto: true }));
}
console.log(`${per.size} items were bought from at least one supplier; ${manual.size} have suppliers set by hand (skipped). To write: ${rows.length} supplier links for ${new Set(rows.map((row) => row.plato_id)).size} items, ${rows.filter((row) => !row.preferred).length} of them extra (second and later suppliers).`);
if (!apply) { console.log('Dry run only. Add --apply to write.'); process.exit(0); }
const known = new Set((await all((from, to) => db.from('proc_items').select('plato_id').order('plato_id').range(from, to))).map((row) => row.plato_id));
const safe = rows.filter((row) => known.has(row.plato_id));
const { error: clearError } = await db.from('proc_item_suppliers').delete().eq('auto', true);
if (clearError) { console.error(clearError.message); process.exit(1); }
for (let i = 0; i < safe.length; i += 500) { const { error } = await db.from('proc_item_suppliers').upsert(safe.slice(i, i + 500), { onConflict: 'plato_id,supplier' }); if (error) { console.error(error.message); process.exit(1); } }
console.log(`Saved ${safe.length} links.`);
