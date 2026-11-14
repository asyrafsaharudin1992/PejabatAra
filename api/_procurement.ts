import { errorReply, officeAccess } from './_office-db.js';

// Office Procurement (the CPO): a read-only view of the Plato copy kept in the proc_* tables (see migration 202611140001).
// Everything is read on demand when a page is opened; nothing polls. The CEO can read it too.
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
const INTERNAL = /^KLINIK ARA 24 JAM/i; // the clinics' own branches as supplier: stock sent between KJ and SK
const yyyymm = (date: string) => date.slice(0, 4) + date.slice(5, 7);

// Supabase returns at most 1000 rows per read, so longer lists are read in pages.
async function all(query: (from: number, to: number) => any) {
  const rows: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  return rows;
}

async function stockRows(db: any, location: string) {
  const rows = await all((from, to) => db.from('proc_stock').select('plato_id,location,qty,uom,cost_unit,total_cost,expiry,as_of').eq('location', location).order('plato_id').range(from, to));
  const items = new Map<string, any>();
  for (let i = 0; i < rows.length; i += 150) {
    const ids = rows.slice(i, i + 150).map((row) => row.plato_id);
    const { data, error } = await db.from('proc_items').select('plato_id,name,type,category,supplier,selling_price,kind,low_stock,inactive').in('plato_id', ids);
    if (error) throw error;
    (data || []).forEach((item: any) => items.set(item.plato_id, item));
  }
  const now = yyyymm(today());
  const soon = yyyymm(addDays(today(), 92));
  return rows.map((row) => {
    const item = items.get(row.plato_id) || {};
    const level = Number(item.low_stock?.[location]);
    return { id: row.plato_id, location: row.location, name: item.name || row.plato_id, type: item.type || '', category: item.category || '', supplier: item.supplier || '', kind: item.kind || 'stocked', qty: Number(row.qty), uom: row.uom, costUnit: row.cost_unit === null ? null : Number(row.cost_unit), totalCost: row.total_cost === null ? null : Number(row.total_cost), sellingPrice: item.selling_price === null || item.selling_price === undefined ? null : Number(item.selling_price), expiry: row.expiry, asOf: row.as_of,
      reorderAt: Number.isFinite(level) && item.low_stock?.[location] !== null && item.low_stock?.[location] !== '' ? level : null,
      low: Number.isFinite(level) && item.low_stock?.[location] !== null && item.low_stock?.[location] !== '' && Number(row.qty) <= level,
      expired: Boolean(row.expiry) && row.expiry <= now, expiring: Boolean(row.expiry) && row.expiry > now && row.expiry <= soon, inactive: Boolean(item.inactive?.all || item.inactive?.[location]) };
  });
}

export async function procurementHandler(req: any, res: any) {
  try {
    const { db, user, profile } = await officeAccess(req, false, ['procurement', 'ceo']);
    const offices: string[] = Array.isArray((user as any).app_metadata?.office_access) ? (user as any).app_metadata.office_access : [];
    const canEdit = profile.role === 'super_admin' || offices.includes('procurement');
    const action = String(req.query?.action || '');
    const text = (value: unknown, max = 100) => String(value ?? '').trim().slice(0, max);
    const day = today();

    // The home page: what needs a decision or a call today, and the totals.
    if (action === 'summary') {
      const [orders, stockKJ, stockSK, itemCount] = await Promise.all([
        all((from, to) => db.from('proc_orders').select('order_date,status,total,paid,due_date,supplier,location').neq('location', 'SY').order('order_date', { ascending: false }).range(from, to)),
        stockRows(db, 'KJ'), stockRows(db, 'SK'),
        all((from, to) => db.from('proc_items').select('plato_id,kind').range(from, to)),
      ]);
      const stock = [...stockKJ, ...stockSK].filter((row) => !row.inactive);
      const permanent = orders.filter((order) => order.status === 'Permanent');
      // Money owed: unpaid, a value above zero (the clinics' own transfers count too), and not older than 90 days.
      // Older unpaid invoices are almost always paid but never marked in Plato, so they are counted apart to be checked.
      const owing = permanent.filter((order) => !order.paid && Number(order.total) > 0);
      const staleDay = addDays(day, -90);
      const stale = owing.filter((order) => String(order.order_date) < staleDay);
      const unpaid = owing.filter((order) => String(order.order_date) >= staleDay);
      const month = day.slice(0, 7);
      const spend = (rows: any[]) => Math.round(rows.reduce((sum, order) => sum + Number(order.total || 0), 0) * 100) / 100;
      const by = (key: 'KJ' | 'SK', rows: any[]) => ({ low: rows.filter((r) => r.low).length, expiring: rows.filter((r) => r.expiring).length, expired: rows.filter((r) => r.expired).length, key });
      const split = (rows: any[]) => Object.fromEntries(['KJ', 'SK'].map((place) => [place, spend(rows.filter((order) => order.location === place))]));
      const count = (rows: any[]) => Object.fromEntries(['KJ', 'SK'].map((place) => [place, rows.filter((order) => order.location === place).length]));
      const thisMonth = permanent.filter((order) => String(order.order_date).startsWith(month));
      const overdueRows = unpaid.filter((order) => order.due_date && order.due_date < day);
      const soonRows = unpaid.filter((order) => order.due_date && order.due_date >= day && order.due_date <= addDays(day, 7));
      const places = {
        spendMonth: split(thisMonth), spendYear: split(permanent), unpaid: split(unpaid), overdue: count(overdueRows), dueSoon: count(soonRows), drafts: count(orders.filter((order) => order.status === 'Draft')),
        low: Object.fromEntries(['KJ', 'SK'].map((place) => [place, stock.filter((row) => row.low && row.location === place).length])),
        expiring: Object.fromEntries(['KJ', 'SK'].map((place) => [place, stock.filter((row) => (row.expiring || row.expired) && row.location === place).length])),
      };
      const months: Record<string, number> = {};
      const monthsBy: Record<string, Record<string, number>> = { KJ: {}, SK: {} };
      permanent.forEach((order) => { const key = String(order.order_date).slice(0, 7); months[key] = (months[key] || 0) + Number(order.total || 0); if (monthsBy[order.location]) monthsBy[order.location][key] = (monthsBy[order.location][key] || 0) + Number(order.total || 0); });
      return res.status(200).json({
        asOf: stockKJ[0]?.asOf || null, places,
        waiting: {
          overdue: unpaid.filter((order) => order.due_date && order.due_date < day).length,
          dueSoon: unpaid.filter((order) => order.due_date && order.due_date >= day && order.due_date <= addDays(day, 7)).length,
          low: stock.filter((row) => row.low).length,
          expiring: stock.filter((row) => row.expiring || row.expired).length,
          drafts: orders.filter((order) => order.status === 'Draft').length,
          stale: stale.length,
        },
        unpaidTotal: spend(unpaid), staleTotal: spend(stale), unpaidOutside: spend(unpaid.filter((order) => !INTERNAL.test(order.supplier || ''))), unpaidBetween: spend(unpaid.filter((order) => INTERNAL.test(order.supplier || ''))),
        stockByLocation: [by('KJ', stockKJ), by('SK', stockSK)],
        spend: { month: spend(permanent.filter((order) => String(order.order_date).startsWith(month))), year: spend(permanent), months, monthsBy },
        items: { total: itemCount.length, purchased: itemCount.filter((i) => i.kind === 'purchased').length, stocked: itemCount.filter((i) => i.kind === 'stocked').length, service: itemCount.filter((i) => i.kind === 'service').length },
        orders: permanent.length,
      });
    }

    if (action === 'stock') {
      const location = text(req.query?.location, 2);
      if (!['KJ', 'SK'].includes(location)) throw fail(400, 'Choose KJ or SK.');
      return res.status(200).json({ rows: await stockRows(db, location) });
    }

    // Reorder suggestions for one clinic: how fast each stocked item sells (from the Plato sales since July), how many days the stock lasts at that pace,
    // and how much to order to cover the target days. The supplier is the preferred one set in AraOffice, else the one it was last bought from.
    if (action === 'reorder') {
      const location = text(req.query?.location, 2);
      if (!['KJ', 'SK'].includes(location)) throw fail(400, 'Choose KJ or SK.');
      const target = Math.min(120, Math.max(7, Number(req.query?.target) || 30));
      const trigger = Math.min(target, Math.max(1, Number(req.query?.trigger) || 14));
      const [stock, sales, preferred, lines] = await Promise.all([
        stockRows(db, location),
        all((from, to) => db.from('proc_sales').select('plato_id,period_from,period_to,qty').eq('location', location).range(from, to)),
        all((from, to) => db.from('proc_item_suppliers').select('plato_id,supplier,preferred').range(from, to)),
        all((from, to) => db.from('proc_order_lines').select('plato_id,unit_cost,proc_orders!inner(order_date,supplier,status)').not('plato_id', 'is', null).eq('proc_orders.status', 'Permanent').range(from, to)),
      ]);
      const RECENT_FROM = ['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'].includes(String(req.query?.since)) ? String(req.query.since) : '2026-07-01', RECENT_DAYS = Math.round((new Date('2026-11-14T00:00:00Z').getTime() - new Date(`${RECENT_FROM}T00:00:00Z`).getTime()) / 86400000) + 1;
      const recent = new Map<string, number>(), year = new Map<string, number>();
      sales.forEach((row) => { year.set(row.plato_id, (year.get(row.plato_id) || 0) + Number(row.qty)); if (row.period_from >= RECENT_FROM) recent.set(row.plato_id, (recent.get(row.plato_id) || 0) + Number(row.qty)); });
      const pick = new Map<string, string>();
      preferred.filter((row) => row.preferred).forEach((row) => pick.set(row.plato_id, row.supplier));
      const last = new Map<string, { date: string; supplier: string; cost: number | null }>();
      lines.forEach((line) => { const order = Array.isArray(line.proc_orders) ? line.proc_orders[0] : line.proc_orders; if (!order) return; const seen = last.get(line.plato_id); if (!seen || order.order_date > seen.date) last.set(line.plato_id, { date: order.order_date, supplier: order.supplier, cost: line.unit_cost === null ? null : Number(line.unit_cost) }); });
      const rows = stock.filter((row) => !row.inactive && row.kind !== 'service').map((row) => {
        const sold = recent.get(row.id) || 0;
        const daily = sold / RECENT_DAYS;
        const cover = daily > 0 ? row.qty / daily : null;
        const need = daily > 0 && cover !== null && cover < trigger ? Math.max(0, Math.ceil(daily * target - row.qty)) : 0;
        const bought = last.get(row.id);
        return { id: row.id, name: row.name, uom: row.uom, qty: row.qty, reorderAt: row.reorderAt, sold, soldYear: year.get(row.id) || 0, daily: Math.round(daily * 100) / 100, cover: cover === null ? null : Math.round(cover), suggest: need, supplier: pick.get(row.id) || bought?.supplier || row.supplier || '', supplierFrom: pick.has(row.id) ? 'preferred' : bought ? 'last bought' : row.supplier ? 'Plato' : '', lastCost: bought?.cost ?? row.costUnit, expiring: row.expiring || row.expired, slow: sold === 0 && row.qty > 0 };
      });
      return res.status(200).json({ rows, target, trigger, days: RECENT_DAYS, from: RECENT_FROM });
    }

    // The charts page: money bought, who we buy from, what is owed, what the stock is worth, what sells and what is about to expire. Read once when the tab opens.
    if (action === 'charts') {
      const [orders, stockKJ, stockSK, sales] = await Promise.all([
        all((from, to) => db.from('proc_orders').select('order_date,status,total,paid,supplier,location').eq('status', 'Permanent').neq('location', 'SY').range(from, to)),
        stockRows(db, 'KJ'), stockRows(db, 'SK'),
        all((from, to) => db.from('proc_sales').select('location,period_from,qty,revenue,cost').range(from, to)),
      ]);
      const places = ['KJ', 'SK'] as const;
      const round = (value: number) => Math.round(value * 100) / 100;
      const monthKeys: string[] = []; for (let m = 1; m <= Number(day.slice(5, 7)); m += 1) monthKeys.push(`${day.slice(0, 4)}-${String(m).padStart(2, '0')}`);
      const spendByMonth = Object.fromEntries(places.map((place) => [place, monthKeys.map((key) => round(orders.filter((o) => o.location === place && String(o.order_date).startsWith(key)).reduce((sum, o) => sum + Number(o.total || 0), 0)))]));
      const bySupplier = new Map<string, { KJ: number; SK: number }>();
      orders.forEach((o) => { const row = bySupplier.get(o.supplier) || { KJ: 0, SK: 0 }; row[o.location as 'KJ' | 'SK'] += Number(o.total || 0); bySupplier.set(o.supplier, row); });
      const topSuppliers = [...bySupplier.entries()].sort((a, b) => (b[1].KJ + b[1].SK) - (a[1].KJ + a[1].SK)).slice(0, 8).map(([name, row]) => ({ name, KJ: round(row.KJ), SK: round(row.SK) }));
      const owing = orders.filter((o) => !o.paid && Number(o.total) > 0);
      const buckets = [['0–30 days', 0, 30], ['31–60 days', 31, 60], ['61–90 days', 61, 90], ['Over 90 days', 91, 9999]] as const;
      const age = (o: any) => Math.round((new Date(`${day}T00:00:00Z`).getTime() - new Date(`${o.order_date}T00:00:00Z`).getTime()) / 86400000);
      const owedByAge = { labels: buckets.map((b) => b[0]), ...Object.fromEntries(places.map((place) => [place, buckets.map(([, lo, hi]) => round(owing.filter((o) => o.location === place && age(o) >= lo && age(o) <= hi).reduce((sum, o) => sum + Number(o.total || 0), 0)))])) };
      const stock = { KJ: stockKJ.filter((r) => !r.inactive), SK: stockSK.filter((r) => !r.inactive) };
      const typeValue = new Map<string, { KJ: number; SK: number }>();
      places.forEach((place) => stock[place].forEach((r) => { const key = r.type || 'Other'; const row = typeValue.get(key) || { KJ: 0, SK: 0 }; row[place] += r.totalCost || 0; typeValue.set(key, row); }));
      const stockByType = [...typeValue.entries()].sort((a, b) => (b[1].KJ + b[1].SK) - (a[1].KJ + a[1].SK)).slice(0, 6).map(([name, row]) => ({ name, KJ: round(row.KJ), SK: round(row.SK) }));
      const quarters = [['2026-01-01', 'Jan–Mar'], ['2026-04-01', 'Apr–Jun'], ['2026-07-01', 'Jul–Sep'], ['2026-10-01', 'Oct–14 Nov']] as const;
      const salesBy = (place: string, from: string, field: 'revenue' | 'cost') => round(sales.filter((r) => r.location === place && r.period_from === from).reduce((sum, r) => sum + Number(r[field] || 0), 0));
      const quarterSales = { labels: quarters.map((q) => q[1]), ...Object.fromEntries(places.map((place) => [place, { revenue: quarters.map(([from]) => salesBy(place, from, 'revenue')), cost: quarters.map(([from]) => salesBy(place, from, 'cost')) }])) };
      const nowMonth = yyyymm(day); const expiryMonths: string[] = []; for (let i = 0; i < 7; i += 1) { const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1 + i, 1)); expiryMonths.push(d.toISOString().slice(0, 7).replace('-', '')); }
      const expiring = { labels: expiryMonths.map((m, i) => i === 0 ? 'Expired / this month' : `${m.slice(4)}/${m.slice(2, 4)}`), ...Object.fromEntries(places.map((place) => [place, expiryMonths.map((m, i) => stock[place].filter((r) => r.expiry && (i === 0 ? r.expiry <= m : r.expiry === m) && r.qty > 0).length)])) };
      void nowMonth;
      return res.status(200).json({ asOf: stockKJ[0]?.asOf || null, months: monthKeys, spendByMonth, topSuppliers, owedByAge, stockByType, quarterSales, expiring });
    }

    if (action === 'orders') {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.from)) ? String(req.query.from) : addDays(day, -90);
      const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.to)) ? String(req.query.to) : day;
      const rows = await all((a, b) => db.from('proc_orders').select('id,order_date,location,supplier,po_no,invoice_no,status,subtotal,tax,total,paid,pay_mode,ref,due_date').neq('location', 'SY').gte('order_date', from).lte('order_date', to).order('order_date', { ascending: false }).order('id').range(a, b));
      return res.status(200).json({ from, to, orders: rows });
    }

    if (action === 'order_lines') {
      const id = text(req.query?.id, 60);
      const { data, error } = await db.from('proc_order_lines').select('line,plato_id,item_name,batch,expiry,qty_ordered,qty_bonus,qty_received,amount,unit_cost').eq('order_id', id).order('line');
      if (error) throw error;
      return res.status(200).json({ lines: data || [] });
    }

    if (action === 'suppliers') {
      const [suppliers, orders] = await Promise.all([
        all((from, to) => db.from('proc_suppliers').select('*').order('name').range(from, to)),
        all((from, to) => db.from('proc_orders').select('supplier,total,paid,status,order_date,due_date').eq('status', 'Permanent').neq('location', 'SY').range(from, to)),
      ]);
      const stats = new Map<string, { orders: number; spend: number; unpaid: number; last: string }>();
      orders.forEach((order) => { const row = stats.get(order.supplier) || { orders: 0, spend: 0, unpaid: 0, last: '' }; row.orders += 1; row.spend += Number(order.total || 0); if (!order.paid) row.unpaid += Number(order.total || 0); if (order.order_date > row.last) row.last = order.order_date; stats.set(order.supplier, row); });
      return res.status(200).json({ suppliers: suppliers.map((s) => ({ ...s, ...(stats.get(s.name) || { orders: 0, spend: 0, unpaid: 0, last: '' }) })) });
    }

    if (action === 'items') {
      const q = text(req.query?.q, 60).replace(/[%,()]/g, ' ');
      const kind = text(req.query?.kind, 12);
      const type = text(req.query?.type, 30);
      const page = Math.max(0, Number(req.query?.page) || 0);
      let query = db.from('proc_items').select('plato_id,type,category,categories,ingredients,tags_auto,name,description,unit,supplier,selling_price,cost_price,track_stock,kind,proc_item_suppliers(supplier,preferred,auto)', { count: 'exact' }).order('name');
      if (['purchased', 'stocked', 'service'].includes(kind)) query = query.eq('kind', kind);
      if (type) query = query.eq('type', type);
      const category = text(req.query?.category, 80), ingredient = text(req.query?.ingredient, 80);
      if (category) query = query.contains('categories', [category]);
      if (ingredient) query = query.contains('ingredients', [ingredient]);
      if (req.query?.untagged === '1') query = query.eq('ingredients', '{}');
      if (q) query = query.or(`name.ilike.%${q}%,plato_id.ilike.%${q}%,category.ilike.%${q}%`);
      const { data, error, count } = await query.range(page * 50, page * 50 + 49);
      if (error) throw error;
      return res.status(200).json({ items: data || [], total: count || 0, page, canEdit });
    }

    // The lists to pick from when filtering and tagging: every category and active ingredient in use, with how many items carry it.
    if (action === 'facets') {
      const rows = await all((from, to) => db.from('proc_items').select('categories,ingredients').range(from, to));
      const tally = (key: 'categories' | 'ingredients') => { const map = new Map<string, number>(); rows.forEach((row) => (row[key] || []).forEach((name: string) => map.set(name, (map.get(name) || 0) + 1))); return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })); };
      const suppliers = await all((from, to) => db.from('proc_suppliers').select('name').order('name').range(from, to));
      return res.status(200).json({ categories: tally('categories'), ingredients: tally('ingredients'), suppliers: suppliers.map((row) => row.name), tagged: rows.filter((row) => (row.ingredients || []).length).length, total: rows.length });
    }

    // One item: the suppliers set by hand, and the suppliers it was really bought from (from the order lines).
    if (action === 'item_detail') {
      const id = text(req.query?.id, 200);
      const [mine, lines] = await Promise.all([
        db.from('proc_item_suppliers').select('supplier,preferred,note,auto').eq('plato_id', id).order('preferred', { ascending: false }).order('supplier'),
        db.from('proc_order_lines').select('unit_cost,qty_received,qty_ordered,amount,proc_orders!inner(order_date,supplier,location,status)').eq('plato_id', id).neq('proc_orders.location', 'SY').order('order_id').limit(400),
      ]);
      if (mine.error) throw mine.error;
      if (lines.error) throw lines.error;
      const bought = new Map<string, { supplier: string; times: number; last: string; lastCost: number | null }>();
      (lines.data || []).forEach((line: any) => { const order = Array.isArray(line.proc_orders) ? line.proc_orders[0] : line.proc_orders; if (!order || order.status !== 'Permanent') return; const row = bought.get(order.supplier) || { supplier: order.supplier, times: 0, last: '', lastCost: null }; row.times += 1; if (order.order_date >= row.last) { row.last = order.order_date; row.lastCost = line.unit_cost === null ? null : Number(line.unit_cost); } bought.set(order.supplier, row); });
      return res.status(200).json({ suppliers: mine.data || [], bought: [...bought.values()].sort((a, b) => b.last.localeCompare(a.last)), canEdit });
    }

    if (action === 'item_save') {
      if (!canEdit) throw fail(403, 'Only Procurement can change items.');
      if (req.method !== 'POST') throw fail(405, 'Use POST.');
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const id = text(body.id, 200);
      const clean = (value: unknown, limit: number) => [...new Set((Array.isArray(value) ? value : []).map((entry) => text(entry, 80)).filter(Boolean))].slice(0, limit);
      const { data: exists } = await db.from('proc_items').select('plato_id').eq('plato_id', id).maybeSingle();
      if (!exists) throw fail(404, 'Item not found.');
      const supplierRows = (Array.isArray(body.suppliers) ? body.suppliers : []).map((entry: any) => ({ plato_id: id, supplier: text(entry?.supplier, 150), preferred: Boolean(entry?.preferred), note: text(entry?.note, 200) })).filter((entry: any) => entry.supplier);
      const unique = [...new Map(supplierRows.map((entry: any) => [entry.supplier, entry])).values()].slice(0, 12) as any[];
      if (unique.filter((entry) => entry.preferred).length > 1) throw fail(400, 'Only one supplier can be the preferred one.');
      const { error } = await db.from('proc_items').update({ categories: clean(body.categories, 12), ingredients: clean(body.ingredients, 12), tags_auto: false }).eq('plato_id', id);
      if (error) throw error;
      const removed = await db.from('proc_item_suppliers').delete().eq('plato_id', id);
      if (removed.error) throw removed.error;
      if (unique.length) { const added = await db.from('proc_item_suppliers').insert(unique); if (added.error) throw added.error; }
      return res.status(200).json({ saved: true });
    }

    // Purchase history: every item bought on a permanent order since 1 January 2026, newest first, with filters. Read one page at a time.
    if (action === 'history') {
      const q = text(req.query?.q, 60).replace(/[%,()]/g, ' ');
      const supplier = text(req.query?.supplier, 150);
      const location = text(req.query?.location, 2);
      const month = /^\d{4}-\d{2}$/.test(String(req.query?.month)) ? String(req.query.month) : '';
      const page = Math.max(0, Number(req.query?.page) || 0);
      let query = db.from('proc_order_lines').select('order_id,line,plato_id,item_name,batch,expiry,qty_ordered,qty_bonus,qty_received,amount,unit_cost,proc_orders!inner(order_date,supplier,location,status,invoice_no)', { count: 'exact' }).eq('proc_orders.status', 'Permanent').gte('proc_orders.order_date', '2026-01-01');
      query = ['KJ', 'SK'].includes(location) ? query.eq('proc_orders.location', location) : query.neq('proc_orders.location', 'SY');
      if (supplier) query = query.eq('proc_orders.supplier', supplier);
      if (month) { const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10); query = query.gte('proc_orders.order_date', `${month}-01`).lt('proc_orders.order_date', next); }
      if (q) query = query.ilike('item_name', `%${q}%`);
      const { data, error, count } = await query.order('proc_orders(order_date)', { ascending: false }).order('order_id').order('line').range(page * 50, page * 50 + 49);
      if (error) throw error;
      const rows = (data || []).map((row: any) => { const order = Array.isArray(row.proc_orders) ? row.proc_orders[0] : row.proc_orders; const { proc_orders: _drop, ...line } = row; return { ...line, date: order?.order_date, supplier: order?.supplier, location: order?.location, invoice: order?.invoice_no }; });
      return res.status(200).json({ rows, total: count || 0, page });
    }

    throw fail(400, 'Unknown request.');
  } catch (error: any) {
    return errorReply(res, error, 'Could not read procurement data.');
  }
}
