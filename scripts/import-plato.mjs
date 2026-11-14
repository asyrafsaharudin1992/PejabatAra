// Imports the Plato exports into the proc_* tables (CPO office).
// Usage: XLSX_LIB=/path/to/node_modules/xlsx node scripts/import-plato.mjs <folder> [--apply]
// <folder> holds: inventory_full.xls, stock_KJ.xls, stock_SK.xls, stock_SY.xls, suppliers.xls, orders_full.xlsx. Dry run unless --apply.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const apply = process.argv.includes('--apply');
const folder = process.argv.slice(2).find((item) => !item.startsWith('--'));
if (!folder || !process.env.XLSX_LIB) { console.error('Usage: XLSX_LIB=<path to xlsx> node scripts/import-plato.mjs <folder> [--apply]'); process.exit(1); }
const X = createRequire(import.meta.url)(process.env.XLSX_LIB);
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const hit = line.match(/^([A-Z_]+)=(.*)$/); if (hit && !process.env[hit[1]]) process.env[hit[1]] = hit[2].replace(/^["']|["']$/g, ''); }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } });

const sheet = (file) => { const book = X.readFile(`${folder}/${file}`); return X.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1 }).slice(1); };
const text = (value) => String(value ?? '').trim();
const money = (value) => { const cleaned = text(value).replace(/RM|,|\s/g, ''); return cleaned && cleaned !== '-' && !Number.isNaN(Number(cleaned)) ? Number(cleaned) : null; };
const yes = (value) => text(value).toLowerCase() === 'yes';
const day = (value) => { const hit = text(value).match(/^(\d{2})\/(\d{2})\/(\d{2})$/); return hit ? `20${hit[3]}-${hit[2]}-${hit[1]}` : null; };
const dueDate = (ref) => { const hit = text(ref).match(/DUE\s*DATE\s*:?\s*(\d{1,2})[\/\s-]+(\d{1,2}|[A-Za-z]{3,})[\/\s-]+(\d{4})/i); if (!hit) return null; const month = /^\d+$/.test(hit[2]) ? Number(hit[2]) : ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(hit[2].slice(0, 3).toLowerCase()) + 1; const d = Number(hit[1]); const iso = `${hit[3]}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`; const check = new Date(`${iso}T00:00:00Z`); return month >= 1 && month <= 12 && !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso ? iso : null; };

// Orders first, so items can be labelled "purchased".
const orderRows = sheet('orders_full.xlsx');
const ordered = new Set(orderRows.map((r) => text(r[15])).filter(Boolean));
const inventory = sheet('inventory_full.xls');
const stockByLocation = { KJ: sheet('stock_KJ.xls'), SK: sheet('stock_SK.xls'), SY: sheet('stock_SY.xls') };
const stocked = new Set(Object.values(stockByLocation).flat().map((r) => text(r[0])));

const items = inventory.map((r) => {
  const id = text(r[1]); const track = yes(r[10]);
  return { plato_id: id, type: text(r[2]), category: text(r[3]), name: text(r[4]), description: text(r[5]), unit: text(r[6]), supplier: text(r[7]), selling_price: money(r[8]), cost_price: money(r[9]), track_stock: track,
    inactive: { all: yes(r[11]), KJ: yes(r[12]), SK: yes(r[13]), SY: yes(r[14]) }, low_stock: { KJ: r[15] ?? null, SK: r[16] ?? null, SY: r[17] ?? null },
    kind: ordered.has(id) ? 'purchased' : track || stocked.has(id) ? 'stocked' : 'service' };
});
const known = new Set(items.map((i) => i.plato_id));
const stock = Object.entries(stockByLocation).flatMap(([location, rows]) => rows.filter((r) => text(r[0])).map((r) => ({ plato_id: text(r[0]), location, qty: Number(r[2]) || 0, uom: text(r[3]), cost_unit: money(r[5]), total_cost: money(r[6]), expiry: /^\d{6}$/.test(text(r[7])) ? text(r[7]) : null, as_of: '2026-11-14' })));
const suppliers = sheet('suppliers.xls').filter((r) => text(r[1])).map((r) => ({ name: text(r[1]), category: text(r[2]), mobile: text(r[3]), phone: text(r[4]), fax: text(r[5]), person: text(r[6]), email: text(r[7]), address: text(r[8]) }));

const orders = new Map(); const lines = [];
for (const r of orderRows) {
  const key = [day(r[1]), text(r[2]), text(r[3]), text(r[5])].join('|');
  if (!orders.has(key)) orders.set(key, { order_date: day(r[1]), location: text(r[2]), supplier: text(r[3]), po_no: text(r[4]), invoice_no: text(r[5]), status: text(r[7]), subtotal: Number(r[9]) || 0, tax: Number(r[10]) || 0, total: Number(r[11]) || 0, paid: yes(r[12]), pay_mode: text(r[13]), ref: text(r[14]), due_date: dueDate(r[14]), _lines: [] });
  orders.get(key)._lines.push({ plato_id: known.has(text(r[15])) ? text(r[15]) : null, item_name: text(r[16]) || text(r[15]), batch: text(r[17]), expiry: /^\d{6}$/.test(text(r[18])) ? text(r[18]) : null, qty_ordered: Number(r[20]) || 0, qty_bonus: Number(r[21]) || 0, qty_received: Number(r[23]) || 0, amount: Number(r[24]) || 0, unit_cost: r[25] == null ? null : Number(r[25]) });
}
const count = (rows, key) => rows.reduce((m, r) => (m[r[key]] = (m[r[key]] || 0) + 1, m), {});
console.log(`Items ${items.length}`, count(items, 'kind'), `\nStock rows ${stock.length}`, count(stock, 'location'), `(${stock.filter((s) => !known.has(s.plato_id)).length} not in inventory)\nSuppliers ${suppliers.length}\nOrders ${orders.size}, lines ${orderRows.length}, with a due date ${[...orders.values()].filter((o) => o.due_date).length}, unmatched item lines ${[...orders.values()].flatMap((o) => o._lines).filter((l) => !l.plato_id).length}`);
if (!apply) { console.log('Dry run only. Add --apply to write.'); process.exit(0); }

const chunk = async (table, rows, conflict) => { for (let i = 0; i < rows.length; i += 500) { const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict: conflict }); if (error) { console.error(`${table} failed:`, error.message); process.exit(1); } } console.log(`${table}: ${rows.length}`); };
await chunk('proc_items', items, 'plato_id');
await db.from('proc_stock').delete().neq('location', '');
await chunk('proc_stock', stock.filter((s) => known.has(s.plato_id)), 'plato_id,location');
await chunk('proc_suppliers', [...new Map(suppliers.map((s) => [s.name, s])).values()], 'name');
const orderList = [...orders.values()].map(({ _lines, ...order }) => order);
await chunk('proc_orders', orderList, 'order_date,location,supplier,invoice_no');
const saved = [];
for (let from = 0; ; from += 1000) { const { data, error } = await db.from('proc_orders').select('id,order_date,location,supplier,invoice_no').order('id').range(from, from + 999); if (error) { console.error(error.message); process.exit(1); } saved.push(...data); if (data.length < 1000) break; }
const idByKey = new Map(saved.map((o) => [[o.order_date, o.location, o.supplier, o.invoice_no].join('|'), o.id]));
const lineRows = [];
for (const [key, order] of orders) { const id = idByKey.get(key); order._lines.forEach((l, index) => lineRows.push({ ...l, order_id: id, line: index + 1 })); }
await chunk('proc_order_lines', lineRows, 'order_id,line');
console.log('Done.');
