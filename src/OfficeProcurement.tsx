import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, CalendarClock, ClipboardList, ExternalLink, FileText, BarChart3, History, Hourglass, Home, ShoppingCart, IdCard, LogOut, Menu, PackageSearch, ReceiptText, Search, Truck, X } from 'lucide-react';
import { AraLogo } from './AraLogo';
import { SubTabs } from './SubTabs';
import { EmbeddedTabs } from './EmbeddedTabs';
import { StackTables } from './StackTables';
import { BarsChart, COLOR, money } from './CeoChartKit';
import ProcurementCharts from './ProcurementCharts';
import { officeFetch } from './lib/officeApi';
import { useOnDemandSummary } from './lib/useOnDemandSummary';
import { signOutSupabase } from './lib/supabase';

// Office Procurement (the CPO). The inventory, stock, suppliers and supplier orders are a read-only copy of Plato (the proc_* tables), until the clinic's own CMS replaces it.
// Every page reads once when it opens; nothing polls. The Refresh buttons read again.
type View = 'home' | 'charts' | 'stock' | 'reorder' | 'orders' | 'history' | 'suppliers' | 'items';
type Loc = 'KJ' | 'SK';
type Split = Record<Loc, number>;
type Summary = { asOf: string | null; places: { spendMonth: Split; spendYear: Split; unpaid: Split; stale: Split; overdue: Split; dueSoon: Split; drafts: Split; low: Split; expiring: Split }; waiting: { overdue: number; dueSoon: number; low: number; expiring: number; drafts: number; stale: number }; staleTotal: number; unpaidOutside: number; unpaidBetween: number; unpaidTotal: number; stockByLocation: { key: Loc; low: number; expiring: number; expired: number }[]; spend: { month: number; year: number; months: Record<string, number>; monthsBy: Record<Loc, Record<string, number>> }; items: { total: number; purchased: number; stocked: number; service: number }; orders: number };
type StockRow = { id: string; name: string; type: string; category: string; supplier: string; kind: Kind; qty: number; uom: string; costUnit: number | null; totalCost: number | null; sellingPrice: number | null; expiry: string | null; reorderAt: number | null; low: boolean; expired: boolean; expiring: boolean; inactive: boolean };
type Kind = 'purchased' | 'stocked' | 'service';
type Order = { id: string; order_date: string; location: string; supplier: string; po_no: string; invoice_no: string; status: string; subtotal: number; tax: number; total: number; paid: boolean; pay_mode: string; ref: string; due_date: string | null };
type Line = { line: number; plato_id: string | null; item_name: string; batch: string; expiry: string | null; qty_ordered: number; qty_bonus: number; qty_received: number; amount: number; unit_cost: number | null };
type Supplier = { name: string; category: string; mobile: string; phone: string; email: string; address: string; person: string; orders: number; spend: number; unpaid: number; last: string };
type Item = { plato_id: string; type: string; category: string; categories: string[]; ingredients: string[]; tags_auto?: boolean; name: string; description: string; unit: string; supplier: string; selling_price: number | null; cost_price: number | null; track_stock: boolean; kind: Kind; proc_item_suppliers?: { supplier: string; preferred: boolean; auto: boolean }[] };

const KIND: Record<Kind, { label: string; tone: string }> = { purchased: { label: 'Bought', tone: 'bg-sky-50 text-sky-700' }, stocked: { label: 'Stock only', tone: 'bg-violet-50 text-violet-700' }, service: { label: 'Service / other', tone: 'bg-slate-100 text-slate-600' } };
const PAD = '[&_th]:px-4 [&_td]:px-4 [&_th]:py-2.5 [&_td]:py-3 [&_td]:align-middle [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap';
const side = 'flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold transition';
const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_5px_20px_rgba(20,35,59,0.03)] sm:p-5';
const field = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800';
const rm = (value: number | null | undefined) => value === null || value === undefined ? '—' : `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const places = (split: Record<string, number> | undefined, money = false) => split ? (['KJ', 'SK'] as const).map((place) => `${place} ${money ? rm(split[place]).replace('RM ', '') : split[place]}`).join(' · ') : '';
const num = (value: number) => value.toLocaleString('en-MY', { maximumFractionDigits: 2 });
const dmy = (date: string | null) => date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}` : '—';
const ym = (value: string | null) => value && /^\d{6}$/.test(value) ? `${value.slice(4)}/${value.slice(0, 4)}` : '—';
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

async function call<T>(query: string): Promise<T> {
  const response = await officeFetch(`/api/status?resource=procurement&${query}`);
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
const KindBadge = ({ kind }: { kind: Kind }) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND[kind].tone}`}>{KIND[kind].label}</span>;
const Empty = ({ children }: { children: string }) => <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{children}</p>;

function Hero({ title, note }: { title: string; note: string }) {
  return <section className="ara-hero rounded-[18px] px-4 py-3 text-white sm:rounded-[30px] sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office Procurement · Klinik ARA 24 Jam</p><h2 className="mt-1 text-xl font-semibold tracking-tight sm:mt-3 sm:text-3xl">{title}</h2><p className="mt-2 hidden max-w-2xl text-sm leading-6 text-[#b9cfdd] sm:block sm:text-base sm:leading-7">{note}</p></section>;
}

function HomePage({ go, onError }: { go: (view: View, filter?: string) => void; onError: (message: string) => void }) {
  const { data, busy, refresh } = useOnDemandSummary<Summary | null>('procurement', () => call<Summary>('action=summary').catch((cause: Error) => { onError(cause.message); return null; }));
  const w = data?.waiting;
  const tiles = [
    { label: 'Overdue invoices', value: w?.overdue, split: data?.places.overdue, note: 'Unpaid, past the due date', icon: AlertTriangle, hot: true, onClick: () => go('orders', 'overdue') },
    { label: 'Due in 7 days', value: w?.dueSoon, split: data?.places.dueSoon, note: 'Unpaid, due this week', icon: CalendarClock, hot: false, onClick: () => go('orders', 'unpaid') },
    { label: 'Low stock', value: w?.low, split: data?.places.low, note: 'At or under the reorder level', icon: PackageSearch, hot: true, onClick: () => go('stock', 'low') },
    { label: 'Expiring / expired', value: w?.expiring, split: data?.places.expiring, note: 'Within 3 months, or past', icon: Hourglass, hot: true, onClick: () => go('stock', 'expiring') },
    { label: 'Unpaid over 90 days', value: w?.stale, split: data?.places.stale, note: 'Likely paid but not marked in Plato. Please check', icon: History, hot: false, onClick: () => go('orders', 'old') },
    { label: 'Draft orders', value: w?.drafts, split: data?.places.drafts, note: 'Not yet made permanent in Plato', icon: FileText, hot: false, onClick: () => go('orders', 'draft') },
  ];
  const total = w ? w.overdue + w.low + w.expiring : null;
  const monthKeys = Object.keys(data?.spend.months || {}).sort().slice(-6);
  return <div className="space-y-5">
    <section aria-label="Waiting for you" className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-semibold tracking-tight">Waiting for you</h3><button type="button" onClick={refresh} disabled={busy} className="ml-auto rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-[#0b587b] disabled:opacity-50">{busy ? 'Loading…' : 'Refresh'}</button><span className={`rounded-full px-3 py-1 text-xs font-semibold ${total ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{total === null ? 'Loading…' : total ? 'Needs a look' : 'All clear'}</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-3">{tiles.map((tile) => <button key={tile.label} type="button" onClick={tile.onClick} className="relative flex flex-col gap-1.5 rounded-xl border border-slate-100 p-2.5 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-3 sm:p-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500 sm:h-9 sm:w-9"><tile.icon className="h-[17px] w-[17px] sm:h-[18px] sm:w-[18px]" strokeWidth={1.8} /></span>
        <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-4 text-[#14233b] sm:text-sm sm:leading-normal">{tile.label}</span><span className="hidden text-xs text-slate-500 sm:block">{tile.note}</span>{tile.split && <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-700">{places(tile.split)}</span>}</span>
        <span className={`absolute right-2.5 top-2.5 grid h-7 min-w-7 shrink-0 place-items-center rounded-full px-2 text-sm font-semibold sm:static ${tile.value ? tile.hot ? 'bg-rose-500 text-white' : 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-400'}`}>{data ? tile.value ?? '—' : '…'}</span></button>)}</div>
      {data?.asOf && <p className="mt-3 text-[11px] text-slate-400">Stock is the Plato copy of {dmy(data.asOf)}. It does not update by itself.</p>}
    </section>
    <section aria-label="At a glance" className="space-y-2">
      <h3 className="text-base font-semibold tracking-tight">At a glance</h3>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">{[
        { title: 'Spend this month', value: rm(data?.spend.month), note: 'Permanent orders', split: places(data?.places.spendMonth, true) },
        { title: 'Spend this year', value: rm(data?.spend.year), note: `${data?.orders ?? '—'} invoices`, split: places(data?.places.spendYear, true) },
        { title: 'Unpaid to suppliers', value: rm(data?.unpaidTotal), note: data ? `Outside ${rm(data.unpaidOutside)} · Between branches ${rm(data.unpaidBetween)}` : 'Not marked paid, last 90 days', split: places(data?.places.unpaid, true) },
        { title: 'Items', value: data ? String(data.items.total) : '—', note: data ? `${data.items.purchased} bought · ${data.items.stocked} stock only · ${data.items.service} service/other` : '', split: '' },
      ].map((item) => <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"><p className="text-xs font-medium text-slate-500">{item.title}</p><p className="mt-1 text-lg font-semibold tracking-tight text-[#17364c] sm:text-2xl">{item.value}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.note}</p>{item.split && <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-700">{item.split}</p>}</div>)}</div>
    </section>
    <div className="grid gap-5 xl:grid-cols-2">
      <section aria-label="Stock by clinic" className={card}><h3 className="text-base font-semibold tracking-tight">Stock by clinic</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">{(data?.stockByLocation || [{ key: 'KJ' }, { key: 'SK' }] as Summary['stockByLocation']).map((row) => <button key={row.key} type="button" onClick={() => go('stock', row.key)} className="rounded-xl border border-slate-100 p-3 text-left hover:bg-slate-50"><p className="text-sm font-semibold text-[#14233b]">{row.key}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Low <b className="text-slate-800">{data ? row.low : '…'}</b><br />Expiring <b className="text-slate-800">{data ? row.expiring : '…'}</b><br />Expired <b className={data && row.expired ? 'text-rose-600' : 'text-slate-800'}>{data ? row.expired : '…'}</b></p></button>)}</div></section>
      {data ? <BarsChart title="Spend by month" note="Permanent orders, last 6 months, Kajang and Seri Kembangan." categories={monthKeys.map((key) => `${key.slice(5)}/${key.slice(2, 4)}`)} series={[{ name: 'Kajang (KJ)', color: COLOR.KJ, values: monthKeys.map((key) => data.spend.monthsBy.KJ[key] || 0) }, { name: 'Seri Kembangan (SK)', color: COLOR.SK, values: monthKeys.map((key) => data.spend.monthsBy.SK[key] || 0) }]} format={money} empty="No orders yet." /> : <section aria-label="Spend by month" className={card}><h3 className="text-base font-semibold tracking-tight">Spend by month</h3><Empty>Loading…</Empty></section>}
    </div>
  </div>;
}

const PAGE = 50;
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  if (total <= PAGE) return null;
  const last = Math.ceil(total / PAGE) - 1;
  return <div className="flex items-center justify-between text-xs"><button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-[#0b587b] disabled:opacity-40">Previous</button><span className="text-slate-500">Page {page + 1} of {last + 1} · {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span><button type="button" disabled={page >= last} onClick={() => onPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-[#0b587b] disabled:opacity-40">Next</button></div>;
}

function StockPage({ initial, onError }: { initial: string; onError: (message: string) => void }) {
  const [loc, setLoc] = useState<Loc>(['KJ', 'SK'].includes(initial) ? initial as Loc : 'KJ');
  const [filter, setFilter] = useState<'all' | 'low' | 'expiring'>(initial === 'low' || initial === 'expiring' ? initial : 'all');
  const [kind, setKind] = useState<'' | Kind>('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [loc, filter, kind, q]);
  useEffect(() => { setRows(null); call<{ rows: StockRow[] }>(`action=stock&location=${loc}`).then((result) => setRows(result.rows)).catch((cause: Error) => { setRows([]); onError(cause.message); }); }, [loc]);
  const shown = useMemo(() => (rows || []).filter((row) => !row.inactive && (filter === 'all' || (filter === 'low' ? row.low : row.expiring || row.expired)) && (!kind || row.kind === kind) && (!q || `${row.name} ${row.id} ${row.category}`.toLowerCase().includes(q.toLowerCase()))), [rows, filter, kind, q]);
  const value = shown.reduce((sum, row) => sum + (row.totalCost || 0), 0);
  return <div className="space-y-4">
    <SubTabs active={loc} onSelect={setLoc} tabs={[{ id: 'KJ', label: 'Kajang (KJ)', short: 'KJ' }, { id: 'SK', label: 'Seri Kembangan (SK)', short: 'SK' }]} />
    <SubTabs active={filter} onSelect={setFilter} tabs={[{ id: 'all', label: 'All stock', short: 'All' }, { id: 'low', label: 'Low stock', short: 'Low' }, { id: 'expiring', label: 'Expiring / expired', short: 'Expiring' }]} />
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative w-full sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search item" className={`${field} w-full pl-8`} /></label>

      <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} aria-label="Kind of item" className={field}><option value="">All kinds</option><option value="purchased">Bought</option><option value="stocked">Stock only</option></select>
    </div>
    <p className="text-xs text-slate-500">{rows ? `${shown.length} items · stock value ${rm(value)}` : 'Loading…'}</p>
    <Pager page={page} total={shown.length} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />
    {rows && !shown.length ? <Empty>Nothing matches.</Empty> : <StackTables><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[900px] text-left text-sm [&_th]:px-4 [&_td]:px-4 [&_th]:py-2.5 [&_td]:py-3 [&_td]:align-middle [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_td:first-child]:min-w-[260px] [&_td:first-child]:whitespace-normal"><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th>Item</th><th>Kind</th><th className="text-right">Stock</th><th className="text-right">Reorder at</th><th className="text-right">Cost / unit</th><th className="text-right">Value</th><th className="text-right">Expiry</th></tr></thead>
      <tbody>{shown.slice(page * PAGE, (page + 1) * PAGE).map((row) => <tr key={row.id} className="border-t border-slate-100"><td><span className="font-semibold text-[#14233b]">{row.name}</span><span className="block text-[11px] text-slate-500">{row.id}{row.category ? ` · ${row.category}` : ''}</span></td><td><KindBadge kind={row.kind} /></td><td className={`text-right tabular-nums ${row.low ? 'font-semibold text-rose-600' : ''}`}>{num(row.qty)} {row.uom}</td><td className="text-right tabular-nums text-slate-500">{row.reorderAt ?? '—'}</td><td className="text-right tabular-nums">{rm(row.costUnit)}</td><td className="text-right tabular-nums">{rm(row.totalCost)}</td><td className={`text-right tabular-nums ${row.expired ? 'font-semibold text-rose-600' : row.expiring ? 'font-semibold text-amber-600' : ''}`}>{ym(row.expiry)}{row.expired ? ' · expired' : row.expiring ? ' · soon' : ''}</td></tr>)}</tbody></table></div></StackTables>}
    <Pager page={page} total={shown.length} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />
  </div>;
}

type ReorderRow = { id: string; name: string; uom: string; qty: number; reorderAt: number | null; sold: number; soldYear: number; daily: number; cover: number | null; suggest: number; supplier: string; supplierFrom: string; lastCost: number | null; expiring: boolean; slow: boolean };
// What to order: how fast each item sells (Plato sales, from the period you choose), how many days the stock lasts, and how much covers the target days.
function ReorderPage({ onError }: { onError: (message: string) => void }) {
  const [loc, setLoc] = useState<Loc>('KJ');
  const [target, setTarget] = useState(30);
  const [trigger, setTrigger] = useState(14);
  const [since, setSince] = useState('2026-07-01');
  const [view, setView] = useState<'order' | 'slow' | 'all'>('order');
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ rows: ReorderRow[]; days: number; from: string } | null>(null);
  const [copied, setCopied] = useState('');
  useEffect(() => { setData(null); call<{ rows: ReorderRow[]; days: number; from: string }>(`action=reorder&location=${loc}&target=${target}&trigger=${trigger}&since=${since}`).then(setData).catch((cause: Error) => { setData({ rows: [], days: 0, from: '' }); onError(cause.message); }); }, [loc, target, trigger, since]);
  const shown = useMemo(() => (data?.rows || []).filter((row) => (view === 'all' || (view === 'order' ? row.suggest > 0 : row.slow)) && (!q || `${row.name} ${row.id} ${row.supplier}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => view === 'order' ? (a.cover ?? 9999) - (b.cover ?? 9999) : view === 'slow' ? b.qty - a.qty : a.name.localeCompare(b.name)), [data, view, q]);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [loc, target, trigger, view, q]);
  const toOrder = (data?.rows || []).filter((row) => row.suggest > 0);
  const bySupplier = useMemo(() => { const map = new Map<string, { count: number; cost: number; items: ReorderRow[] }>(); toOrder.forEach((row) => { const key = row.supplier || 'No supplier set'; const entry = map.get(key) || { count: 0, cost: 0, items: [] }; entry.count += 1; entry.cost += row.suggest * (row.lastCost || 0); entry.items.push(row); map.set(key, entry); }); return [...map.entries()].sort((a, b) => b[1].cost - a[1].cost); }, [data]);
  const copy = (supplier: string, items: ReorderRow[]) => { const text = `Order for ${supplier} (${loc === 'KJ' ? 'Kajang' : 'Seri Kembangan'})\n` + items.map((row) => `- ${row.name}: ${row.suggest} ${row.uom}`).join('\n'); try { void navigator.clipboard.writeText(text); setCopied(supplier); setTimeout(() => setCopied(''), 2000); } catch { onError('Could not copy.'); } };
  return <div className="space-y-4">
    <SubTabs active={loc} onSelect={setLoc} tabs={[{ id: 'KJ', label: 'Kajang (KJ)', short: 'KJ' }, { id: 'SK', label: 'Seri Kembangan (SK)', short: 'SK' }]} />
    <SubTabs active={view} onSelect={setView} tabs={[{ id: 'order', label: 'To order', short: 'To order' }, { id: 'slow', label: 'No sales, in stock', short: 'No sales' }, { id: 'all', label: 'All stocked items', short: 'All' }]} />
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative w-full sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search item or supplier" className={`${field} w-full pl-8`} /></label>

      <select value={trigger} onChange={(event) => setTrigger(Number(event.target.value))} aria-label="Order when stock lasts less than" className={field}><option value={7}>Order if under 7 days left</option><option value={14}>Order if under 14 days left</option><option value={21}>Order if under 21 days left</option><option value={30}>Order if under 30 days left</option></select>
      <select value={since} onChange={(event) => setSince(event.target.value)} aria-label="Sales to use" className={field}><option value="2026-10-01">Sales since Oct (recent)</option><option value="2026-07-01">Sales since Jul</option><option value="2026-04-01">Sales since Apr</option><option value="2026-01-01">Sales since Jan (whole year)</option></select>
      <select value={target} onChange={(event) => setTarget(Number(event.target.value))} aria-label="Cover for" className={field}><option value={14}>Cover 14 days</option><option value={30}>Cover 30 days</option><option value={45}>Cover 45 days</option><option value={60}>Cover 60 days</option></select>
    </div>
    <p className="text-xs text-slate-500">{data ? `${toOrder.length} items to order · based on sales since ${dmy(data.from)} (${data.days} days). Suggested quantities are a guide: check seasons, promotions and what is on order.` : 'Loading…'}</p>
    {view === 'order' && !!bySupplier.length && <section aria-label="By supplier" className={card}><h3 className="text-base font-semibold tracking-tight">By supplier</h3><ul className="mt-2 divide-y divide-slate-100">{bySupplier.map(([supplier, entry]) => <li key={supplier} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"><span className="min-w-0 flex-1 font-semibold text-[#14233b]">{supplier}</span><span className="text-xs text-slate-500">{entry.count} items · about {rm(entry.cost)}</span><button type="button" onClick={() => copy(supplier, entry.items)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-[#0b587b] hover:bg-slate-50">{copied === supplier ? 'Copied' : 'Copy list'}</button></li>)}</ul></section>}
    <Pager page={page} total={shown.length} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />
    {data && !shown.length ? <Empty>Nothing matches.</Empty> : <StackTables><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className={`w-full min-w-[960px] text-left text-sm ${PAD} [&_td:first-child]:min-w-[240px] [&_td:first-child]:whitespace-normal [&_td:nth-child(7)]:whitespace-normal`}><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th>Item</th><th className="text-right">In stock</th><th className="text-right">Sold / day</th><th className="text-right">Days left</th><th className="text-right">Order</th><th className="text-right">Last cost</th><th>Supplier</th></tr></thead>
      <tbody>{shown.slice(page * PAGE, (page + 1) * PAGE).map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="font-semibold text-[#14233b]">{row.name}<span className="block text-[11px] font-normal text-slate-500">{row.id}{row.expiring ? ' · has stock expiring' : ''}</span></td><td className="text-right tabular-nums">{num(row.qty)} {row.uom}</td><td className="text-right tabular-nums">{row.daily || '—'}</td><td className={`text-right tabular-nums ${row.cover !== null && row.cover < 7 ? 'font-semibold text-rose-600' : ''}`}>{row.cover ?? '—'}</td><td className="text-right font-semibold tabular-nums">{row.suggest ? `${num(row.suggest)} ${row.uom}` : '—'}</td><td className="text-right tabular-nums">{rm(row.lastCost)}</td><td>{row.supplier ? <>{row.supplier}<span className="block text-[10px] text-slate-400">{row.supplierFrom}</span></> : <span className="text-slate-400">Not set</span>}</td></tr>)}</tbody></table></div></StackTables>}
    <Pager page={page} total={shown.length} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />
  </div>;
}

function OrdersPage({ initial, onError }: { initial: string; onError: (message: string) => void }) {
  const [range, setRange] = useState<'90' | '30' | 'year'>(initial === 'old' ? 'year' : '90');
  const [branch, setBranch] = useState<'' | Loc>('');
  const [party, setParty] = useState<'' | 'outside' | 'between'>('');
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'overdue' | 'old' | 'draft'>(['unpaid', 'overdue', 'old', 'draft'].includes(initial) ? initial as 'unpaid' : 'all');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [open, setOpen] = useState('');
  const [page, setPage] = useState(0);
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const day = today();
  useEffect(() => { setPage(0); }, [range, filter, q, branch, party]);
  useEffect(() => { setOrders(null); const from = range === 'year' ? `${day.slice(0, 4)}-01-01` : addDays(day, -Number(range)); call<{ orders: Order[] }>(`action=orders&from=${from}&to=${day}`).then((result) => setOrders(result.orders)).catch((cause: Error) => { setOrders([]); onError(cause.message); }); }, [range]);
  const shown = useMemo(() => (orders || []).filter((order) => (!branch || order.location === branch) && (!party || (party === 'between') === /^KLINIK ARA 24 JAM/i.test(order.supplier)) && (filter === 'all' || (filter === 'draft' ? order.status === 'Draft' : order.status === 'Permanent' && !order.paid && order.total > 0 && (filter === 'old' ? order.order_date < addDays(day, -90) : order.order_date >= addDays(day, -90) && (filter === 'unpaid' || (order.due_date !== null && order.due_date < day))))) && (!q || `${order.supplier} ${order.invoice_no} ${order.po_no}`.toLowerCase().includes(q.toLowerCase()))), [orders, filter, q, day, branch, party]);
  const toggle = (id: string) => { setOpen(open === id ? '' : id); if (!lines[id]) call<{ lines: Line[] }>(`action=order_lines&id=${id}`).then((result) => setLines((current) => ({ ...current, [id]: result.lines }))).catch((cause: Error) => onError(cause.message)); };
  return <div className="space-y-4">
    <SubTabs active={filter} onSelect={setFilter} tabs={[{ id: 'all', label: 'All orders', short: 'All' }, { id: 'unpaid', label: 'Unpaid', short: 'Unpaid' }, { id: 'overdue', label: 'Overdue', short: 'Overdue' }, { id: 'old', label: 'Unpaid over 90 days', short: '>90 days' }, { id: 'draft', label: 'Draft', short: 'Draft' }]} />
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative w-full sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Supplier or invoice" className={`${field} w-full pl-8`} /></label>
      <select value={branch} onChange={(event) => setBranch(event.target.value as typeof branch)} aria-label="Clinic" className={field}><option value="">KJ and SK</option><option value="KJ">Kajang (KJ)</option><option value="SK">Seri Kembangan (SK)</option></select>
      <select value={party} onChange={(event) => setParty(event.target.value as typeof party)} aria-label="Supplier type" className={field}><option value="">All suppliers</option><option value="outside">Outside suppliers</option><option value="between">Between branches (KJ ↔ SK)</option></select>
      <select value={range} onChange={(event) => setRange(event.target.value as typeof range)} aria-label="Period" className={field}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="year">This year</option></select>

    </div>
    <p className="text-xs text-slate-500">{orders ? `${shown.length} invoices · ${rm(shown.reduce((sum, order) => sum + order.total, 0))}` : 'Loading…'}</p>
    <Pager page={page} total={shown.length} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />
    {orders && !shown.length ? <Empty>Nothing matches.</Empty> : <StackTables><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[860px] text-left text-sm [&_th]:px-4 [&_td]:px-4 [&_th]:py-2.5 [&_td]:py-3 [&_td]:align-middle [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_td:nth-child(3)]:whitespace-normal [&_td[colspan]]:whitespace-normal"><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th>Date</th><th>Clinic</th><th>Supplier</th><th>Invoice</th><th className="text-right">Total</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>{shown.slice(page * PAGE, (page + 1) * PAGE).map((order) => { const overdue = order.status === 'Permanent' && !order.paid && order.due_date !== null && order.due_date < day; return <Fragment key={order.id}><tr onClick={() => toggle(order.id)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"><td className="tabular-nums">{dmy(order.order_date)}</td><td>{order.location}</td><td className="font-semibold text-[#14233b]">{order.supplier}</td><td>{order.invoice_no || '—'}</td><td className="text-right tabular-nums">{rm(order.total)}</td><td className={`tabular-nums ${overdue ? 'font-semibold text-rose-600' : ''}`}>{dmy(order.due_date)}</td><td><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${order.status === 'Draft' ? 'bg-slate-100 text-slate-600' : order.paid ? 'bg-emerald-50 text-emerald-700' : overdue ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{order.status === 'Draft' ? 'Draft' : order.paid ? 'Paid' : overdue ? 'Overdue' : 'Unpaid'}</span></td></tr>
        {open === order.id && <tr className="bg-slate-50/70"><td colSpan={7} className="text-xs"><p className="mb-2 text-slate-500">{order.ref || 'No note.'}</p>{lines[order.id] ? <ul className="space-y-1">{lines[order.id].map((line) => <li key={line.line} className="flex flex-wrap justify-between gap-x-3"><span className="min-w-0 font-medium text-[#14233b]">{line.item_name}</span><span className="tabular-nums text-slate-600">{num(line.qty_received || line.qty_ordered)}{line.qty_bonus ? ` + ${num(line.qty_bonus)} bonus` : ''} · {rm(line.amount)}{line.expiry ? ` · exp ${ym(line.expiry)}` : ''}</span></li>)}</ul> : 'Loading…'}</td></tr>}</Fragment>; })}</tbody></table></div></StackTables>}
    <Pager page={page} total={shown.length} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />
  </div>;
}

type HistoryRow = { order_id: string; line: number; plato_id: string | null; item_name: string; batch: string; expiry: string | null; qty_ordered: number; qty_bonus: number; qty_received: number; amount: number; unit_cost: number | null; date: string; supplier: string; location: string; invoice: string };
// What was bought, item by item, since 1 January 2026: when, from whom, how many, at what cost.
function HistoryPage({ onError }: { onError: (message: string) => void }) {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [location, setLocation] = useState('');
  const [month, setMonth] = useState('');
  const [supplier, setSupplier] = useState('');
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: HistoryRow[]; total: number } | null>(null);
  const months = useMemo(() => { const now = today(); const list: string[] = []; for (let year = 2026, m = 1; `${year}-${String(m).padStart(2, '0')}` <= now.slice(0, 7); m += 1) { if (m > 12) { year += 1; m = 1; } list.push(`${year}-${String(m).padStart(2, '0')}`); } return list; }, []);
  useEffect(() => { const timer = setTimeout(() => { setPage(0); setTerm(q); }, 400); return () => clearTimeout(timer); }, [q]);
  useEffect(() => { call<{ suppliers: string[] }>('action=facets').then((result) => setSuppliers(result.suppliers)).catch(() => undefined); }, []);
  useEffect(() => { setData(null); call<{ rows: HistoryRow[]; total: number }>(`action=history&q=${encodeURIComponent(term)}&location=${location}&month=${month}&supplier=${encodeURIComponent(supplier)}&page=${page}`).then(setData).catch((cause: Error) => { setData({ rows: [], total: 0 }); onError(cause.message); }); }, [term, location, month, supplier, page]);
  const monthName = (value: string) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative w-full sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search item" className={`${field} w-full pl-8`} /></label>
      <select value={month} onChange={(event) => { setMonth(event.target.value); setPage(0); }} aria-label="Month" className={field}><option value="">Jan 2026 to now</option>{[...months].reverse().map((value) => <option key={value} value={value}>{monthName(value)}</option>)}</select>
      <select value={location} onChange={(event) => { setLocation(event.target.value); setPage(0); }} aria-label="Clinic" className={field}><option value="">KJ and SK</option><option value="KJ">Kajang (KJ)</option><option value="SK">Seri Kembangan (SK)</option></select>
      <select value={supplier} onChange={(event) => { setSupplier(event.target.value); setPage(0); }} aria-label="Supplier" className={`${field} max-w-[220px]`}><option value="">All suppliers</option>{suppliers.map((name) => <option key={name} value={name}>{name}</option>)}</select>
    </div>
    <p className="text-xs text-slate-500">{data ? `${data.total} purchases since 1 Jan 2026 (permanent orders)` : 'Loading…'}</p>
    {data && <Pager page={page} total={data.total} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />}
    {data && !data.rows.length ? <Empty>Nothing matches.</Empty> : <StackTables><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className={`w-full min-w-[960px] text-left text-sm ${PAD} [&_td:nth-child(3)]:min-w-[260px] [&_td:nth-child(3)]:whitespace-normal [&_td:nth-child(4)]:whitespace-normal`}><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th>Date</th><th>Clinic</th><th>Item</th><th>Supplier</th><th className="text-right">Qty</th><th className="text-right">Cost / unit</th><th className="text-right">Amount</th><th className="text-right">Expiry</th></tr></thead>
      <tbody>{(data?.rows || []).map((row) => <tr key={`${row.order_id}-${row.line}`} className="border-t border-slate-100"><td className="tabular-nums">{dmy(row.date)}</td><td>{row.location}</td><td className="font-semibold text-[#14233b]">{row.item_name}<span className="block text-[11px] font-normal text-slate-500">{row.invoice}{row.batch ? ` · batch ${row.batch}` : ''}</span></td><td>{row.supplier}</td><td className="text-right tabular-nums">{num(row.qty_received || row.qty_ordered)}{row.qty_bonus ? ` +${num(row.qty_bonus)}` : ''}</td><td className="text-right tabular-nums">{rm(row.unit_cost)}</td><td className="text-right tabular-nums">{rm(row.amount)}</td><td className="text-right tabular-nums">{ym(row.expiry)}</td></tr>)}</tbody></table></div></StackTables>}
    {data && <Pager page={page} total={data.total} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />}
  </div>;
}

function SuppliersPage({ onError }: { onError: (message: string) => void }) {
  const [list, setList] = useState<Supplier[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { call<{ suppliers: Supplier[] }>('action=suppliers').then((result) => setList(result.suppliers)).catch((cause: Error) => { setList([]); onError(cause.message); }); }, []);
  const shown = (list || []).filter((s) => !q || `${s.name} ${s.category} ${s.person}`.toLowerCase().includes(q.toLowerCase()));
  return <div className="space-y-4">
    <label className="relative block sm:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search supplier" className={`${field} w-full pl-8`} /></label>
    <p className="text-xs text-slate-500">{list ? `${shown.length} suppliers` : 'Loading…'}</p>
    <div className="grid gap-2 lg:grid-cols-2">{shown.map((s) => <article key={s.name} className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="text-sm font-semibold text-[#14233b]">{s.name}</h4>{(s.category || s.person) && <p className="text-[11px] text-slate-500">{[s.category, s.person].filter(Boolean).join(' · ')}</p>}</div>{s.unpaid > 0 && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Unpaid {rm(s.unpaid)}</span>}</div>
      <p className="mt-1.5 text-[11px] leading-5 text-slate-600">{[s.mobile, s.phone].filter(Boolean).join(' · ')}{s.email ? <><br />{s.email}</> : null}{s.address ? <><br /><span className="text-slate-400">{s.address}</span></> : null}</p>
      <p className="mt-1.5 text-[11px] text-slate-500">{s.orders ? `${s.orders} invoices · ${rm(s.spend)} · last ${dmy(s.last)}` : 'No orders this year'}</p></article>)}</div>
  </div>;
}

type Facets = { categories: { name: string; count: number }[]; ingredients: { name: string; count: number }[]; suppliers: string[]; tagged: number; total: number };
type Detail = { suppliers: { supplier: string; preferred: boolean; note: string; auto?: boolean }[]; bought: { supplier: string; times: number; last: string; lastCost: number | null }[] };

// A row of removable chips with a box to add one more; the datalist suggests what is already in use.
function ChipInput({ label, values, onChange, options, listId, placeholder }: { label: string; values: string[]; onChange: (values: string[]) => void; options: string[]; listId: string; placeholder: string }) {
  const [text, setText] = useState('');
  const add = (raw: string) => { const value = raw.trim(); if (value && !values.some((existing) => existing.toLowerCase() === value.toLowerCase())) onChange([...values, value]); setText(''); };
  return <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
    <div className="mt-1.5 flex flex-wrap gap-1.5">{values.map((value) => <span key={value} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">{value}<button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((existing) => existing !== value))} className="text-sky-500 hover:text-rose-600"><X className="h-3 w-3" /></button></span>)}{!values.length && <span className="text-xs text-slate-400">None yet</span>}</div>
    <div className="mt-2 flex gap-2"><input list={listId} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(text); } }} placeholder={placeholder} className={`${field} min-w-0 flex-1`} /><button type="button" onClick={() => add(text)} disabled={!text.trim()} className="rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#0b587b] disabled:opacity-40">Add</button></div>
    <datalist id={listId}>{options.map((option) => <option key={option} value={option} />)}</datalist></div>;
}

function ItemEditor({ item, facets, canEdit, onClose, onSaved, onError }: { item: Item; facets: Facets | null; canEdit: boolean; onClose: () => void; onSaved: () => void; onError: (message: string) => void }) {
  const [categories, setCategories] = useState<string[]>(item.categories || []);
  const [ingredients, setIngredients] = useState<string[]>(item.ingredients || []);
  const [suppliers, setSuppliers] = useState<{ supplier: string; preferred: boolean; note: string; auto?: boolean }[] | null>(null);
  const [bought, setBought] = useState<Detail['bought']>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { call<Detail>(`action=item_detail&id=${encodeURIComponent(item.plato_id)}`).then((result) => { setSuppliers(result.suppliers); setBought(result.bought); }).catch((cause: Error) => { setSuppliers([]); onError(cause.message); }); }, [item.plato_id]);
  const list = suppliers || [];
  const addSupplier = (name: string) => { const value = name.trim(); if (value && !list.some((entry) => entry.supplier === value)) setSuppliers([...list, { supplier: value, preferred: !list.length, note: '' }]); setPick(''); };
  const prefer = (name: string) => setSuppliers(list.map((entry) => ({ ...entry, preferred: entry.supplier === name ? !entry.preferred : false })));
  const save = async () => {
    setBusy(true);
    try {
      const response = await officeFetch('/api/status?resource=procurement&action=item_save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.plato_id, categories, ingredients, suppliers: list }) });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Could not save.');
      onSaved();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not save.'); } finally { setBusy(false); }
  };
  return <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-[#14233b]">{item.name}</p><p className="text-[11px] text-slate-500">{item.plato_id} · {item.type}{item.description ? ` · ${item.description}` : ''}</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-500"><X className="h-4 w-4" /></button></div>
    {(item.proc_item_suppliers || []).some((entry) => entry.auto) && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Suppliers were added automatically from the orders. The most bought is marked preferred. Change it if needed, then Save.</p>}
    {item.tags_auto && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Filled in automatically from the item name and description. Please check it, then press Save to confirm.</p>}
    {canEdit ? <ChipInput label="Categories (as many as apply)" values={categories} onChange={setCategories} options={(facets?.categories || []).map((entry) => entry.name)} listId="proc-categories" placeholder="e.g. Antihistamine, Decongestant, Cough" /> : <p className="text-xs text-slate-600"><b>Categories:</b> {categories.join(', ') || '—'}</p>}
    {canEdit ? <ChipInput label="Active ingredients" values={ingredients} onChange={setIngredients} options={(facets?.ingredients || []).map((entry) => entry.name)} listId="proc-ingredients" placeholder="e.g. Cetirizine, Pseudoephedrine" /> : <p className="text-xs text-slate-600"><b>Active ingredients:</b> {ingredients.join(', ') || '—'}</p>}
    <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Suppliers / distributors</p>
      {suppliers === null ? <p className="mt-1.5 text-xs text-slate-500">Loading…</p> : <ul className="mt-1.5 space-y-1.5">{list.map((entry) => <li key={entry.supplier} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs"><span className="min-w-0 flex-1 font-semibold text-[#14233b]">{entry.supplier}{entry.auto && <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">auto</span>}</span>{canEdit ? <><button type="button" onClick={() => prefer(entry.supplier)} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${entry.preferred ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{entry.preferred ? 'Preferred' : 'Make preferred'}</button><button type="button" aria-label={`Remove ${entry.supplier}`} onClick={() => setSuppliers(list.filter((other) => other.supplier !== entry.supplier))} className="text-slate-400 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button></> : entry.preferred && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Preferred</span>}</li>)}{!list.length && <li className="text-xs text-slate-400">None set yet</li>}</ul>}
      {canEdit && <div className="mt-2 flex gap-2"><input list="proc-suppliers" value={pick} onChange={(event) => setPick(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSupplier(pick); } }} placeholder="Add a supplier" className={`${field} min-w-0 flex-1`} /><button type="button" onClick={() => addSupplier(pick)} disabled={!pick.trim()} className="rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#0b587b] disabled:opacity-40">Add</button><datalist id="proc-suppliers">{(facets?.suppliers || []).map((name) => <option key={name} value={name} />)}</datalist></div>}
      {!!bought.length && <div className="mt-3"><p className="text-[11px] font-semibold text-slate-500">Actually bought from (orders this year)</p><ul className="mt-1 space-y-1">{bought.map((row) => <li key={row.supplier} className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-600"><span className="font-medium text-[#14233b]">{row.supplier}</span><span>{row.times}× · last {dmy(row.last)}{row.lastCost !== null ? ` · ${rm(row.lastCost)} / unit` : ''}</span>{canEdit && !list.some((entry) => entry.supplier === row.supplier) && <button type="button" onClick={() => addSupplier(row.supplier)} className="font-semibold text-[#0b587b]">+ Add to suppliers</button>}</li>)}</ul></div>}
    </div>
    {canEdit ? <div className="flex items-center gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => void save()} disabled={busy || suppliers === null} className="rounded-xl bg-[#0b587b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a4b69] disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button><button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button><span className="ml-auto text-[11px] text-slate-400">Kept in AraOffice. A Plato re-import does not change it.</span></div> : <p className="text-[11px] text-slate-400">Only Procurement can change this.</p>}
  </div>;
}

function ItemsPage({ onError }: { onError: (message: string) => void }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | Kind>('');
  const [category, setCategory] = useState('');
  const [ingredient, setIngredient] = useState('');
  const [untagged, setUntagged] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ items: Item[]; total: number; canEdit: boolean } | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [term, setTerm] = useState('');
  const [openId, setOpenId] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setPage(0); setTerm(q); }, 400); return () => clearTimeout(timer); }, [q]);
  useEffect(() => { call<Facets>('action=facets').then(setFacets).catch((cause: Error) => onError(cause.message)); }, [version]);
  useEffect(() => { setData(null); call<{ items: Item[]; total: number; canEdit: boolean }>(`action=items&q=${encodeURIComponent(term)}&kind=${kind}&category=${encodeURIComponent(category)}&ingredient=${encodeURIComponent(ingredient)}${untagged ? '&untagged=1' : ''}&page=${page}`).then(setData).catch((cause: Error) => { setData({ items: [], total: 0, canEdit: false }); onError(cause.message); }); }, [term, kind, category, ingredient, untagged, page, version]);
  const reset = () => setPage(0);
  return <div className="space-y-4">
    <SubTabs active={kind || 'all'} onSelect={(next) => { setKind(next === 'all' ? '' : next as Kind); reset(); }} tabs={[{ id: 'all', label: 'All kinds', short: 'All' }, { id: 'purchased', label: 'Bought', short: 'Bought' }, { id: 'stocked', label: 'Stock only', short: 'Stock' }, { id: 'service', label: 'Service / other', short: 'Service' }]} />
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative w-full sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name, ID or category" className={`${field} w-full pl-8`} /></label>
      <select value={category} onChange={(event) => { setCategory(event.target.value); reset(); }} aria-label="Category" className={`${field} max-w-[200px]`}><option value="">All categories</option>{(facets?.categories || []).map((entry) => <option key={entry.name} value={entry.name}>{entry.name} ({entry.count})</option>)}</select>
      <select value={ingredient} onChange={(event) => { setIngredient(event.target.value); reset(); }} aria-label="Active ingredient" className={`${field} max-w-[200px]`}><option value="">All ingredients</option>{(facets?.ingredients || []).map((entry) => <option key={entry.name} value={entry.name}>{entry.name} ({entry.count})</option>)}</select>
      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600"><input type="checkbox" checked={untagged} onChange={(event) => { setUntagged(event.target.checked); reset(); }} className="h-4 w-4 accent-[#0b587b]" />No ingredient yet</label>
    </div>
    <p className="text-xs text-slate-500">{data ? `${data.total} items` : 'Loading…'}{facets ? ` · ${facets.tagged} of ${facets.total} have an active ingredient` : ''}</p>
    {data && <Pager page={page} total={data.total} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />}
    {data && !data.items.length ? <Empty>Nothing matches.</Empty> : <ul className="space-y-2">{(data?.items || []).map((item) => openId === item.plato_id
      ? <li key={item.plato_id}><ItemEditor item={item} facets={facets} canEdit={data?.canEdit || false} onClose={() => setOpenId('')} onSaved={() => { setOpenId(''); setVersion((current) => current + 1); }} onError={onError} /></li>
      : <li key={item.plato_id}><button type="button" onClick={() => setOpenId(item.plato_id)} className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="min-w-0 flex-1 text-sm font-semibold text-[#14233b]">{item.name}</span><KindBadge kind={item.kind} /><span className="text-xs tabular-nums text-slate-600">{rm(item.selling_price)}{item.unit ? ` / ${item.unit}` : ''}</span></div>
        <p className="mt-0.5 text-[11px] text-slate-500">{item.plato_id} · {item.type}</p>
        {!!item.proc_item_suppliers?.length && <p className="mt-0.5 text-[11px] text-slate-600"><b>Suppliers:</b> {[...item.proc_item_suppliers].sort((a, b) => Number(b.preferred) - Number(a.preferred)).map((entry) => entry.preferred ? `${entry.supplier} (preferred)` : entry.supplier).join(' · ')}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1">{(item.categories || []).map((name) => <span key={`c${name}`} className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">{name}</span>)}{(item.ingredients || []).map((name) => <span key={`i${name}`} className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">{name}</span>)}{item.tags_auto && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Auto · to check</span>}</div>
      </button></li>)}</ul>}
    {data && <Pager page={page} total={data.total} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />}
  </div>;
}

const MENU: { id: View; label: string; icon: typeof Home; tone: string; note: string }[] = [
  { id: 'home', label: 'Home', icon: Home, tone: 'text-sky-400', note: '' },
  { id: 'charts', label: 'Charts', icon: BarChart3, tone: 'text-violet-400', note: 'What we buy, who from, what is owed, what the stock is worth, what sells and what expires soon.' },
  { id: 'stock', label: 'Stock & expiry', icon: Boxes, tone: 'text-violet-400', note: 'What is on the shelf at each clinic, what is low and what is about to expire.' },
  { id: 'reorder', label: 'Reorder', icon: ShoppingCart, tone: 'text-orange-300', note: 'What to order: how fast each item sells, how many days the stock lasts, and how much covers the next weeks.' },
  { id: 'orders', label: 'Orders', icon: ReceiptText, tone: 'text-amber-400', note: 'Supplier invoices: what was ordered, what is unpaid and what is overdue. Tap a row for its items.' },
  { id: 'history', label: 'History', icon: History, tone: 'text-rose-300', note: 'Everything bought since 1 January 2026, item by item: when, from whom, how many and at what cost.' },
  { id: 'suppliers', label: 'Suppliers', icon: Truck, tone: 'text-emerald-400', note: 'Contacts, and what we buy and owe, supplier by supplier.' },
  { id: 'items', label: 'Items', icon: ClipboardList, tone: 'text-cyan-300', note: 'Every item, with its kind, categories (as many as apply), active ingredients and suppliers. Tap an item to change them.' },
];
const MAIN: View[] = ['home', 'stock', 'reorder', 'orders', 'charts']; // the tabs on the bottom bar of a phone; the rest are under Others
const PLATO_URL = 'https://clinic.platomedical.com/';

export default function OfficeProcurement({ embedded = false }: { embedded?: boolean } = {}) {
  const [view, setView] = useState<View>('home');
  const [preset, setPreset] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const navigate = (next: View, filter = '') => { setView(next); setPreset(filter); setMenuOpen(false); setError(''); window.scrollTo({ top: 0 }); };
  const logout = async () => { await signOutSupabase(); localStorage.removeItem('ara_portal_session'); localStorage.removeItem('araoffice_user'); localStorage.removeItem('ara_view_mode'); window.location.hash = ''; };
  const current = MENU.find((item) => item.id === view)!;
  return <div className={`coo-compact text-compact ${embedded ? '' : 'min-h-screen bg-[#f7f8fb] '}text-[#14233b]`}>
    {menuOpen && !embedded && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)} />}
    <aside className={`${embedded ? 'hidden ' : ''}fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col overflow-y-auto border-r border-white/5 bg-[#1b3150] p-6 text-white transition-transform duration-300 lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2 py-3"><div className="flex items-center gap-3"><AraLogo className="h-11 w-11 rounded-[14px]" /><div><p className="text-[15px] font-bold tracking-wide">ARAOFFICE</p><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Procurement</p></div></div><button onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button></div>
      <div className="mx-1 mt-5 h-px bg-white/10" />
      <nav className="mt-6 flex-1 space-y-1">
        {MENU.map((item) => <button key={item.id} onClick={() => navigate(item.id)} className={`${side} ${view === item.id ? 'bg-white text-[#14233b]' : 'text-[#c5d6e3] hover:bg-white/10'}`}><item.icon className={`h-[18px] w-[18px] shrink-0 ${item.tone}`} strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">{item.label}</span></button>)}
        <p className="px-3.5 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f9bb0]">Systems</p>
        <a href={PLATO_URL} target="_blank" rel="noreferrer" className={`${side} text-[#c5d6e3] hover:bg-white/10`}><PackageSearch className="h-[18px] w-[18px] shrink-0 text-rose-400" strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">Plato</span><ExternalLink className="h-3.5 w-3.5 text-[#7f9bb0]" /></a>
        <p className="px-3.5 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f9bb0]">Me</p>
        <a href="#office/individual" className={`${side} text-[#c5d6e3] hover:bg-white/10`}><IdCard className="h-[18px] w-[18px] shrink-0 text-teal-400" strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">Individual Sign In</span></a>
      </nav>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-sm font-semibold">CPO</div><div className="min-w-0"><p className="truncate text-sm font-semibold">Procurement</p><p className="truncate text-xs text-[#9bb5c7]">AraOffice portal</p></div></div><button onClick={() => void logout()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/15"><LogOut className="h-4 w-4" />Sign out</button></div>
    </aside>
    <div className={embedded ? '' : 'min-h-screen lg:pl-[300px]'}>
      <header className={`sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md lg:hidden${embedded ? ' !hidden' : ''}`}><div className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex min-w-0 items-center gap-2.5"><AraLogo className="h-8 w-8 rounded-lg" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-[#18bff2]">Office Procurement</p><h1 className="mt-0.5 truncate text-[15px] font-semibold leading-tight tracking-tight">{current.label}</h1></div></div><button className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu className="h-[18px] w-[18px]" /></button></div></header>
      <main className={embedded ? 'pt-1' : 'p-3 pb-28 sm:p-6 sm:pb-28 lg:p-[38px]'}>{embedded && <EmbeddedTabs tabs={MENU.map((item) => ({ id: item.id, label: item.label.split(' ')[0], icon: item.icon }))} active={view} onSelect={navigate} />}<div className="mx-auto max-w-[1500px] space-y-5">
        {view === 'home' && embedded
          ? <Hero title="Procurement" note="What needs a call today, and the stock, orders and suppliers behind it." />
          : view === 'home'
          ? <section className="ara-hero rounded-[18px] px-4 py-3.5 text-white sm:rounded-[30px] sm:px-10 sm:py-9 lg:px-12"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Klinik ARA 24 Jam · Chief Procurement Officer</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] sm:mt-3 sm:text-[2.45rem]">Welcome, Dr Haziq</h2><p className="mt-2 hidden text-sm text-[#bed2df] sm:block sm:text-base">What needs a call today is below. Stock, orders and suppliers are on the left.</p></div><span className="inline-flex self-start rounded-full bg-white/12 px-4 py-2 text-xs font-semibold text-[#d9e7ef] sm:px-5 sm:py-2.5 sm:text-sm">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })}</span></div></section>
          : <Hero title={current.label} note={current.note} />}
        {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        {view === 'home' ? <HomePage go={navigate} onError={setError} /> : view === 'charts' ? <ProcurementCharts onError={setError} /> : view === 'stock' ? <Fragment key={preset}><StockPage initial={preset} onError={setError} /></Fragment> : view === 'reorder' ? <ReorderPage onError={setError} /> : view === 'orders' ? <Fragment key={preset}><OrdersPage initial={preset} onError={setError} /></Fragment> : view === 'history' ? <HistoryPage onError={setError} /> : view === 'suppliers' ? <SuppliersPage onError={setError} /> : <ItemsPage onError={setError} />}
      </div></main>
      <nav aria-label="Main" className={`${embedded ? 'hidden ' : ''}fixed inset-x-4 bottom-4 z-40 flex select-none justify-around rounded-2xl border border-slate-100 bg-white/95 px-2 py-2 shadow-[0_8px_30px_rgba(15,23,42,0.16)] backdrop-blur-md lg:hidden`}>
        {MENU.filter((item) => MAIN.includes(item.id)).map((item) => { const active = view === item.id; return <button key={item.id} type="button" onClick={() => navigate(item.id)} aria-current={active ? 'page' : undefined} className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 outline-none transition ${active ? 'scale-105 font-bold text-[#007AFF]' : 'text-slate-400'}`}><item.icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.2 : 1.8} /><span className="max-w-[72px] truncate text-[9.5px] leading-tight">{item.label.split(' ')[0]}</span></button>; })}
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open the full menu" className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 outline-none transition ${menuOpen || !MAIN.includes(view) ? 'scale-105 font-bold text-[#007AFF]' : 'text-slate-400'}`}><Menu className="h-[21px] w-[21px]" strokeWidth={menuOpen || !MAIN.includes(view) ? 2.2 : 1.8} /><span className="max-w-[72px] truncate text-[9.5px] leading-tight">Others</span></button>
      </nav>
    </div>
  </div>;
}
