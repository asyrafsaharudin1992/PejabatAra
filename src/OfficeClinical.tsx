import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarClock, Coins, Check, ChevronRight, ClipboardList, Copy, Home, LogOut, Menu, MessageCircle, Package, Pencil, Plus, Save, Stethoscope, Syringe, Trash2, X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { signOutSupabase } from './lib/supabase';
import { card, input, Modal } from './AssessmentStaff';
import ClinicalIncentives from './ClinicalIncentives';

// Office Clinical Administration, laid out like the CA office. Each branch's
// Clinical Admin ticks the daily checklist here and sends it to the WhatsApp
// group with one button. Orders, vaccine bookings and ad hoc tasks carry over
// until done, so they are typed once instead of every day. COO sees every
// branch on Home and switches branch from the sidebar.
const API = '/api/status?resource=clinical';

type CheckStatus = 'done' | 'pending' | 'na';
type Checks = Record<string, { status: CheckStatus; note: string }>;
type OrderItem = { name: string; qty: string; note: string; receivedOn: string | null };
type Order = { id: string; supplier: string; orderedOn: string; approvedBy: string; items: OrderItem[]; note: string; cancelled: boolean; closed: boolean };
type BookingStatus = 'waiting' | 'reserved' | 'done' | 'cancelled';
type Booking = { id: string; patientName: string; icLast4: string; vaccines: string; deposit: number; appointmentOn: string | null; status: BookingStatus; note: string };
type Task = { id: string; title: string; details: string; createdOn: string; doneOn: string | null };
type Day = { date: string; branch: string; report: { saved: boolean; preparedBy: string; checks: Checks; issues: string; staffing: string; updatedAt: string | null }; orders: Order[]; bookings: Booking[]; tasks: Task[]; monthlyDone: string[] };
type Overview = { date: string; branches: { branch: string; report: { preparedBy: string; checks: Checks; issues: string; updatedAt: string } | null; openOrders: number; oldestOrder: { supplier: string; orderedOn: string } | null; activeBookings: number; openTasks: number; monthlyDone: string[] }[] };

// The daily checklist, taken from the Clinical Admin WhatsApp report. Item ids
// are stored with each report, so keep them unchanged when editing the wording.
// `title` is the heading in the WhatsApp report; `label` is shown on screen.
const SECTIONS: { id: string; title: string; label: string; items: [string, string][] }[] = [
  { id: 'finance', title: '💸KEWANGAN', label: '💸 Finance', items: [
    ['fin-inventory', 'Urus inventori'], ['fin-order', 'Buat pesanan barang yang diperlukan'], ['fin-panel', 'Pastikan tuntutan panel tiada masalah'],
    ['fin-payment', 'Pastikan penerimaan pembayaran harian tiada masalah'], ['fin-invoice', 'Crosscheck invois dan barang diterima'],
  ] },
  { id: 'staff', title: '💪TENAGA KERJA', label: '💪 Manpower', items: [
    ['staff-enough', 'Pastikan tenaga kerja cukup'], ['staff-changes', 'Inform jika ada perubahan pada jadual kerja'], ['staff-extra', 'Kerja tambahan'],
  ] },
  { id: 'ops', title: '⛑️OPERASI', label: '⛑️ Operations', items: [
    ['ops-checklist', 'Pantau checklist staf'], ['ops-issues', 'Selesai masalah jika ada isu dalam checklist staf'], ['ops-buy', 'Beli barang keperluan klinik'],
    ['ops-extra', 'Kerja tambahan jika ada (contoh: maintenance mesin FBC UFEME / tindakan jika ada fasiliti/barang yang rosak)'],
  ] },
  { id: 'admin', title: '🧑‍🧒‍🧒PENTADBIRAN', label: '🧑‍🧒‍🧒 Administration', items: [
    ['adm-branches', 'Berhubung dengan cawangan terlibat untuk urusan operasi / ubat / staf'], ['adm-management', 'Berhubung dengan pihak pengurusan'],
    ['adm-email', 'Periksa email dan ambil tindakan sepatutnya'], ['adm-extra', 'Kerja tambahan jika ada'],
  ] },
  { id: 'pharmacy', title: '💊FARMASI', label: '💊 Pharmacy', items: [
    ['ph-inventory', 'Urus inventori'], ['ph-delivery', 'Terima penghantaran'], ['ph-count', 'Atur dan pantau pengiraan stok'], ['ph-expiry', 'Periksa tarikh luput'],
    ['ph-dispensary', 'Pantau proses dispensari ubat dan memberi teguran sekiranya ada kesilapan'], ['ph-storage', 'Pastikan penyimpanan yang sesuai untuk ubat dan bekalan'],
    ['ph-stock', 'Pastikan stok dalam keadaan baik'], ['ph-extra', 'Kerja tambahan jika ada'],
  ] },
];
const ALL_ITEMS = SECTIONS.flatMap((section) => section.items.map(([id]) => id));

// Monthly work with its deadline day (null = any time this month). Labels name
// the month the same way the WhatsApp report always has.
const MONTHLY: { id: string; due: number | null; label: (thisMonth: string, lastMonth: string) => string }[] = [
  { id: 'cme', due: null, label: (m) => `CME Bulanan ${m}` },
  { id: 'schedule', due: 21, label: (m) => `Pastikan jadual ${m} keluar (sebelum 21hb)` },
  { id: 'incentive', due: 7, label: (_, last) => `Beri report insentif CA ${last} dan doktor (sebelum 7hb)` },
  { id: 'forecast', due: 24, label: (m) => `Forecast tenaga kerja ${m} (sebelum 24hb)` },
  { id: 'panel-report', due: null, label: (_, last) => `Laporan in-house panel ${last}` },
];

const MARK: Record<CheckStatus, string> = { done: '✅', pending: '☑️', na: '❌' };
const STATUS_BUTTONS: [CheckStatus, string, string][] = [['done', 'Done', 'bg-emerald-600 text-white'], ['pending', 'Not done', 'bg-amber-500 text-white'], ['na', 'Not needed', 'bg-slate-500 text-white']];
const BOOKING_LABEL: Record<BookingStatus, string> = { waiting: 'Waiting for stock', reserved: 'Reserved', done: 'Done', cancelled: 'Cancelled' };
// The WhatsApp report keeps the wording the Clinical Admins already use.
const BOOKING_REPORT: Record<BookingStatus, string> = { waiting: 'Tunggu stok', reserved: 'Dah simpan', done: 'Selesai', cancelled: 'Batal' };

const dmy = (date: string) => date.split('-').reverse().join('/');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Oct 2026", as written in the WhatsApp report; offset -1 gives last month.
const monthName = (date: string, offset = 0) => { const [y, m] = date.split('-').map(Number); const index = y * 12 + m - 1 + offset; return `${MONTHS[index % 12]} ${Math.floor(index / 12)}`; };
const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);
const PREPARED_KEY = (branch: string) => `ara_clinical_prepared_${branch}`;

async function post(body: Record<string, unknown>) {
  await officeFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

// Builds the WhatsApp report in the same layout the Clinical Admins already use.
function buildReport(day: Day, draft: Draft) {
  const now = new Date();
  const weekday = new Date(`${day.date}T12:00:00+08:00`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kuala_Lumpur' }).toUpperCase();
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });
  const out = [`CHECKLIST HARIAN ADMIN KLINIKAL ${day.branch.toUpperCase()}`, `${weekday} ${dmy(day.date)}`, `PREPARED BY ${draft.preparedBy.trim().toUpperCase() || '-'} ${time}`, '', '☑️ Tak selesai', '✅ Selesai', '❌ Tiada keperluan kerja', '', '‼️ISU BERBANGKIT'];
  const issues = lines(draft.issues);
  out.push(...(issues.length ? issues.map((line, i) => `${i + 1}. ${line}`) : ['1. Tiada']));
  for (const section of SECTIONS) {
    out.push('', section.title);
    for (const [id, label] of section.items) {
      const check = draft.checks[id];
      out.push(`•  ${label}${MARK[check?.status || 'pending']}`);
      if (check?.note) out.push(...lines(check.note).map((line) => `   - ${line}`));
    }
    if (section.id === 'staff') out.push(...lines(draft.staffing));
  }
  const received = day.orders.map((order) => ({ order, items: order.items.filter((item) => item.receivedOn === day.date) })).filter(({ items }) => items.length);
  if (received.length) {
    out.push('', 'Ubat sampai/barang :✅');
    received.forEach(({ order, items }, i) => { out.push(`${i + 1}) ${order.supplier}✅`, ...items.map((item) => `•  ${item.name}${item.qty ? ` - ${item.qty}` : ''}✅`)); });
  }
  const pending = day.orders.filter((order) => !order.closed && !order.cancelled);
  if (pending.length) {
    out.push('', 'Order Belum sampai : ☑️');
    pending.forEach((order, i) => {
      out.push(`${i + 1}) ${order.supplier} (order ${dmy(order.orderedOn)})${order.approvedBy ? ` approved by ${order.approvedBy}` : ''}`);
      out.push(...order.items.filter((item) => !item.receivedOn).map((item) => `•  ${item.name}${item.qty ? ` - ${item.qty}` : ''}${item.note ? ` (${item.note})` : ''}`));
    });
  }
  if (day.bookings.length) {
    out.push('', 'BOOKING VAKSIN PESAKIT');
    day.bookings.forEach((booking, i) => {
      out.push(`${i + 1}. ${booking.patientName}`);
      out.push(`•  ${booking.vaccines} · ${BOOKING_REPORT[booking.status]}${booking.deposit ? ` · depo RM${booking.deposit.toFixed(2)}` : ''}${booking.appointmentOn ? ` · cucuk ${dmy(booking.appointmentOn)}` : ''}`);
      if (booking.note) out.push(`•  ${booking.note}`);
    });
  }
  if (day.tasks.length) {
    out.push('', 'LAIN-LAIN TUGAS ADHOC');
    day.tasks.forEach((task, i) => { out.push(`${i + 1}) ${task.title} ${task.doneOn ? '✅' : '☑️'}`, ...lines(task.details).map((line) => `•  ${line}`)); });
  }
  out.push('', 'KERJA BULANAN');
  out.push(...MONTHLY.map((task) => `•  ${task.label(monthName(day.date), monthName(day.date, -1))} ${day.monthlyDone.includes(task.id) ? '✅' : '☑️'}`));
  return out.join('\n');
}

type Draft = { preparedBy: string; checks: Checks; issues: string; staffing: string };

function Banner({ tone, children }: { tone: 'error' | 'ok'; children: ReactNode }) {
  return <div role="status" className={`mt-4 flex gap-2 rounded-xl p-3 text-sm ${tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}>{tone === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}{children}</div>;
}

function Hero({ branch, title, text, action }: { branch: string; title: string; text: string; action?: ReactNode }) {
  return <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9">
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Clinical Admin · {branch}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">{text}</p></div>
      {action}
    </div>
  </section>;
}

function DailyReport({ day, reload, onError }: { day: Day; reload: () => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...day.report, preparedBy: day.report.preparedBy || localStorage.getItem(PREPARED_KEY(day.branch)) || '' }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [openNote, setOpenNote] = useState<string | null>(null);
  const change = (next: Partial<Draft>) => { setDraft((current) => ({ ...current, ...next })); setDirty(true); setNotice(''); };
  const setCheck = (id: string, next: Partial<Checks[string]>) => change({ checks: { ...draft.checks, [id]: { status: 'pending', note: '', ...draft.checks[id], ...next } } });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    try {
      await post({ action: 'save_report', branch: day.branch, ...draft });
      localStorage.setItem(PREPARED_KEY(day.branch), draft.preparedBy.trim());
      setDirty(false);
      await reload();
      return true;
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save the checklist.'); return false; }
    finally { setSaving(false); }
  };
  const unticked = ALL_ITEMS.filter((id) => !draft.checks[id]).length;
  const ready = () => {
    if (!draft.preparedBy.trim()) { onError('Enter who prepared the report first.'); return false; }
    return true;
  };
  // The tab is opened before saving so the browser does not treat it as an unwanted pop-up.
  const sendToWhatsApp = async () => {
    if (!ready()) return;
    const tab = window.open('', '_blank');
    if (!(await save())) { tab?.close(); return; }
    const url = `https://wa.me/?text=${encodeURIComponent(buildReport(day, draft))}`;
    if (tab) tab.location.href = url; else window.location.href = url;
    setNotice('Saved. Choose the WhatsApp group and press Send.');
  };
  const copy = async () => {
    if (!ready() || !(await save())) return;
    await navigator.clipboard.writeText(buildReport(day, draft));
    setNotice('Saved and copied. Paste it into WhatsApp.');
  };
  const toggleMonthly = async (taskId: string, done: boolean) => {
    try { await post({ action: 'set_monthly', branch: day.branch, taskId, done }); await reload(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to update.'); }
  };

  const today = Number(day.date.slice(8, 10));
  const received = day.orders.flatMap((order) => order.items.filter((item) => item.receivedOn === day.date).map((item) => ({ order, item })));
  const pendingOrders = day.orders.filter((order) => !order.closed && !order.cancelled);

  // Sticky at the top: the bottom-right corner belongs to the office switcher.
  return <div className="mx-auto max-w-[1500px] pb-10">
    <Hero branch={day.branch} title="Daily checklist" text="Tick each item, then send the report to the WhatsApp group in one tap. Orders, vaccine bookings and ad hoc tasks are added for you." />
    <div className="sticky top-[76px] z-20 -mx-4 mt-4 lg:top-0 sm:-mx-6 lg:mx-0 border-b border-slate-200 bg-[#f5f7f9]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-2xl">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && <span className="mr-auto text-xs font-semibold text-amber-700">Unsaved changes</span>}
        <button onClick={() => void save().then((ok) => ok && setNotice('Saved.'))} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Save className="h-4 w-4" />Save</button>
        <button onClick={() => void copy()} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Copy className="h-4 w-4" />Copy</button>
        <button onClick={() => void sendToWhatsApp()} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#25d366] px-5 text-sm font-bold text-white hover:bg-[#1ebe5a] disabled:opacity-50"><MessageCircle className="h-4 w-4" />Send to WhatsApp</button>
      </div>
      {notice && <Banner tone="ok">{notice}</Banner>}
    </div>
    <section className={`mt-4 ${card}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Prepared by</span><input value={draft.preparedBy} onChange={(event) => change({ preparedBy: event.target.value })} placeholder="Your name" className={input} /></label>
        <div className="self-end text-xs leading-5 text-slate-500">{day.report.updatedAt ? `Last saved ${new Date(day.report.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet today.'}{unticked > 0 && <span className="block text-amber-700">{unticked} items not marked yet (sent as ☑️ not done).</span>}</div>
      </div>
      <label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-slate-700">‼️ Outstanding issues <span className="font-normal text-slate-400">(one issue per line; leave empty if none)</span></span><textarea value={draft.issues} onChange={(event) => change({ issues: event.target.value })} rows={2} className={`${input} h-auto py-3`} /></label>
    </section>

    {SECTIONS.map((section) => <section key={section.id} className={`mt-4 ${card}`}>
      <h2 className="text-lg font-semibold">{section.label}</h2>
      <div className="mt-3 divide-y divide-slate-100">{section.items.map(([id, label]) => {
        const check = draft.checks[id];
        return <div key={id} className="py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6">{label}</p>
            <div className="flex shrink-0 gap-1.5">{STATUS_BUTTONS.map(([status, text, active]) => <button key={status} onClick={() => setCheck(id, { status })} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${check?.status === status ? active : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{MARK[status]} {text}</button>)}
              <button onClick={() => setOpenNote(openNote === id ? null : id)} title="Note" aria-label={`Note for ${label}`} className={`rounded-lg px-2 py-1.5 ${check?.note ? 'bg-[#e9f6fb] text-[#0b587b]' : 'text-slate-400 hover:bg-slate-100'}`}><Pencil className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {(openNote === id || check?.note) && <textarea value={check?.note || ''} onChange={(event) => setCheck(id, { note: event.target.value })} rows={1} placeholder="Note (e.g. Recheck email influenza vaccine)" className={`${input} mt-2 h-auto py-2`} />}
        </div>;
      })}</div>
      {section.id === 'staff' && <label className="mt-3 block"><span className="mb-2 block text-xs font-bold text-slate-700">Today's shifts <span className="font-normal text-slate-400">(copied from yesterday's report; update it for today)</span></span><textarea value={draft.staffing} onChange={(event) => change({ staffing: event.target.value })} rows={6} placeholder={'Shift am :\n•  Era, Athirah (9am-9pm)\nShift pm :\n•  Puteri, Amy (9pm-9am)'} className={`${input} h-auto py-3 font-mono text-xs`} /></label>}
      {section.id === 'pharmacy' && <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm"><p className="font-semibold text-emerald-800">Arrived today</p>{received.length ? <ul className="mt-2 space-y-1 text-emerald-900">{received.map(({ order, item }, i) => <li key={i}>{order.supplier}: {item.name}{item.qty && ` - ${item.qty}`}</li>)}</ul> : <p className="mt-2 text-emerald-700/70">Nothing yet. Tick deliveries under Orders.</p>}</div>
        <div className="rounded-2xl bg-amber-50 p-4 text-sm"><p className="font-semibold text-amber-800">Orders not yet arrived</p>{pendingOrders.length ? <ul className="mt-2 space-y-1 text-amber-900">{pendingOrders.map((order) => <li key={order.id}>{order.supplier} ({dmy(order.orderedOn)}): {order.items.filter((item) => !item.receivedOn).length} item(s)</li>)}</ul> : <p className="mt-2 text-amber-700/70">None.</p>}</div>
      </div>}
    </section>)}

    <section className={`mt-4 ${card}`}>
      <h2 className="text-lg font-semibold">Monthly tasks</h2>
      <div className="mt-3 space-y-2">{MONTHLY.map((task) => {
        const done = day.monthlyDone.includes(task.id);
        const late = !done && task.due !== null && today > task.due;
        return <label key={task.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-slate-50">
          <input type="checkbox" checked={done} onChange={(event) => void toggleMonthly(task.id, event.target.checked)} className="h-4 w-4 accent-emerald-600" />
          <span className={done ? 'text-slate-400 line-through' : ''}>{task.label(monthName(day.date), monthName(day.date, -1))}</span>
          {late && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">Overdue</span>}
        </label>;
      })}</div>
      <p className="mt-3 text-xs text-slate-400">Active vaccine bookings and open ad hoc tasks are added to the report automatically.</p>
    </section>

  </div>;
}

type OrderDraft = { id?: string; supplier: string; orderedOn: string; approvedBy: string; items: OrderItem[]; note: string };
const blankItem = (): OrderItem => ({ name: '', qty: '', note: '', receivedOn: null });

function Orders({ day, reload, onError }: { day: Day; reload: () => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await post(body); await reload(); return true; }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); return false; }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (draft && await run({ action: 'save_order', branch: day.branch, ...draft })) setDraft(null); };
  const open = day.orders.filter((order) => !order.closed && !order.cancelled);
  const closedToday = day.orders.filter((order) => order.closed && !order.cancelled);
  const updateItem = (index: number, next: Partial<OrderItem>) => setDraft((current) => current && { ...current, items: current.items.map((item, i) => i === index ? { ...item, ...next } : item) });

  return <div className="mx-auto max-w-[1500px] space-y-7">
    <Hero branch={day.branch} title="Medicine & supply orders" text="Tick each item when it arrives. An order stays in the daily report until everything has arrived." action={<button onClick={() => setDraft({ supplier: '', orderedOn: day.date, approvedBy: '', items: [blankItem()], note: '' })} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#0b3d59] hover:bg-[#e9f6fb]"><Plus className="h-4 w-4" />New order</button>} />
    <section className={card}>
    {!open.length && !closedToday.length && <p className="mt-5 rounded-2xl bg-[#f7f9fc] px-4 py-4 text-sm text-slate-500">No orders waiting for delivery.</p>}
    <div className="mt-5 space-y-3">{[...open, ...closedToday].map((order) => <div key={order.id} className={`rounded-2xl border p-4 ${order.closed ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-semibold">{order.supplier}</p><p className="text-xs text-slate-500">Order {dmy(order.orderedOn)}{order.approvedBy && ` · approved by ${order.approvedBy}`}{order.closed && ' · all arrived'}</p>{order.note && <p className="mt-1 text-xs text-slate-500">{order.note}</p>}</div>
        {!order.closed && <div className="flex gap-1">
          <button onClick={() => setDraft({ ...order })} title="Edit" aria-label={`Edit order ${order.supplier}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => { if (window.confirm(`Cancel the ${order.supplier} order from ${dmy(order.orderedOn)}?`)) void run({ action: 'cancel_order', id: order.id }); }} disabled={busy} title="Cancel order" aria-label={`Cancel order ${order.supplier}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
        </div>}
      </div>
      <div className="mt-3 space-y-1.5">{order.items.map((item, index) => <label key={index} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
        <input type="checkbox" checked={Boolean(item.receivedOn)} disabled={busy} onChange={(event) => void run({ action: 'receive_item', id: order.id, index, received: event.target.checked })} className="mt-1 h-4 w-4 accent-emerald-600" />
        <span className={item.receivedOn ? 'text-slate-400' : ''}>{item.name}{item.qty && ` - ${item.qty}`}{item.note && <span className="text-slate-400"> ({item.note})</span>}{item.receivedOn && <span className="ml-2 text-xs font-semibold text-emerald-700">arrived {dmy(item.receivedOn)}</span>}</span>
      </label>)}</div>
    </div>)}</div>

    {draft && <Modal title={draft.id ? 'Edit order' : 'New order'} onClose={() => setDraft(null)}>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="mb-2 block text-xs font-bold text-slate-700">Supplier</span><input required value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} placeholder="e.g. Zuellig Pharma / Klinik Ara Seri Kembangan" className={input} /></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Order date</span><input required type="date" value={draft.orderedOn} onChange={(event) => setDraft({ ...draft, orderedOn: event.target.value })} className={input} /></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Approved by</span><input value={draft.approvedBy} onChange={(event) => setDraft({ ...draft, approvedBy: event.target.value })} placeholder="e.g. Dr Haziq" className={input} /></label>
        </div>
        <div><span className="mb-2 block text-xs font-bold text-slate-700">Items</span><div className="space-y-2">{draft.items.map((item, index) => <div key={index} className="grid grid-cols-[1fr_7rem_auto] gap-2 sm:grid-cols-[1fr_7rem_1fr_auto]">
          <input value={item.name} onChange={(event) => updateItem(index, { name: event.target.value })} placeholder="Medicine / item" aria-label={`Item ${index + 1}`} className={`${input} h-10`} />
          <input value={item.qty} onChange={(event) => updateItem(index, { qty: event.target.value })} placeholder="Quantity" aria-label={`Quantity for item ${index + 1}`} className={`${input} h-10`} />
          <input value={item.note} onChange={(event) => updateItem(index, { note: event.target.value })} placeholder="For whom / note" aria-label={`Note for item ${index + 1}`} className={`${input} col-span-2 h-10 sm:col-span-1`} />
          <button type="button" onClick={() => setDraft({ ...draft, items: draft.items.length > 1 ? draft.items.filter((_, i) => i !== index) : [blankItem()] })} aria-label={`Remove item ${index + 1}`} className="row-start-1 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:row-auto" style={{ gridColumnStart: 3 }}><Trash2 className="h-4 w-4" /></button>
        </div>)}</div>
          <button type="button" onClick={() => setDraft({ ...draft, items: [...draft.items, blankItem()] })} className="mt-2 inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-[#0b587b] hover:bg-slate-50"><Plus className="h-4 w-4" />Add item</button></div>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Note (optional)</span><input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className={input} /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save order'}</button></div>
      </form>
    </Modal>}
  </section>
  </div>;
}

type BookingDraft = Omit<Booking, 'id' | 'deposit'> & { id?: string; deposit: string };

function Bookings({ day, reload, onError }: { day: Day; reload: () => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    try { await post({ action: 'save_booking', branch: day.branch, ...draft, deposit: Number(draft.deposit || 0) }); await reload(); setDraft(null); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-[1500px] space-y-7">
    <Hero branch={day.branch} title="Patient vaccine bookings" text="Bookings waiting for stock or reserved are added to the daily report. Set the status to Done once the vaccine is given." action={<button onClick={() => setDraft({ patientName: '', icLast4: '', vaccines: '', deposit: '', appointmentOn: null, status: 'waiting', note: '' })} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#0b3d59] hover:bg-[#e9f6fb]"><Plus className="h-4 w-4" />New booking</button>} />
    <section className={card}>
    {!day.bookings.length && <p className="mt-5 rounded-2xl bg-[#f7f9fc] px-4 py-4 text-sm text-slate-500">No active bookings.</p>}
    <div className="mt-5 space-y-3">{day.bookings.map((booking) => <div key={booking.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4">
      <div className="text-sm"><p className="font-semibold">{booking.patientName}{booking.icLast4 && <span className="font-normal text-slate-400"> · IC …{booking.icLast4}</span>}</p><p className="mt-1">{booking.vaccines}</p>
        <p className="mt-1 text-xs text-slate-500">{BOOKING_LABEL[booking.status]}{booking.deposit ? ` · deposit RM${booking.deposit.toFixed(2)}` : ''}{booking.appointmentOn ? ` · appointment ${dmy(booking.appointmentOn)}` : ''}</p>{booking.note && <p className="mt-1 text-xs text-slate-500">{booking.note}</p>}</div>
      <button onClick={() => setDraft({ ...booking, deposit: booking.deposit ? String(booking.deposit) : '' })} title="Edit" aria-label={`Edit booking ${booking.patientName}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]"><Pencil className="h-4 w-4" /></button>
    </div>)}</div>

    {draft && <Modal title={draft.id ? 'Edit booking' : 'New booking'} onClose={() => setDraft(null)}>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">Do not enter the full IC. The name and last 4 IC digits are enough; the full IC is already in the clinic system.</p>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Patient name</span><input required value={draft.patientName} onChange={(event) => setDraft({ ...draft, patientName: event.target.value })} className={input} /></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">IC (last 4 digits)</span><input inputMode="numeric" maxLength={4} value={draft.icLast4} onChange={(event) => setDraft({ ...draft, icLast4: event.target.value.replace(/\D/g, '').slice(0, 4) })} className={`${input} font-mono`} /></label>
        </div>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Vaccine & quantity</span><input required value={draft.vaccines} onChange={(event) => setDraft({ ...draft, vaccines: event.target.value })} placeholder="e.g. Influenza x3" className={input} /></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Deposit (RM)</span><input type="number" min={0} step="0.01" value={draft.deposit} onChange={(event) => setDraft({ ...draft, deposit: event.target.value })} className={input} /></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Appointment date</span><input type="date" value={draft.appointmentOn || ''} onChange={(event) => setDraft({ ...draft, appointmentOn: event.target.value || null })} className={input} /></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as BookingStatus })} className={input}>{(Object.keys(BOOKING_LABEL) as BookingStatus[]).map((status) => <option key={status} value={status}>{BOOKING_LABEL[status]}</option>)}</select></label>
        </div>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Note (optional)</span><input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="e.g. 1 reserved in the fridge, waiting for SK stock" className={input} /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save booking'}</button></div>
      </form>
    </Modal>}
  </section>
  </div>;
}

function Tasks({ day, reload, onError }: { day: Day; reload: () => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<{ id?: string; title: string; details: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await post(body); await reload(); return true; }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); return false; }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (draft && await run({ action: 'save_task', branch: day.branch, ...draft })) setDraft(null); };
  return <div className="mx-auto max-w-[1500px] space-y-7">
    <Hero branch={day.branch} title="Ad hoc tasks" text="Tasks stay in the daily report until ticked done. Tasks finished today still show with ✅." action={<button onClick={() => setDraft({ title: '', details: '' })} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#0b3d59] hover:bg-[#e9f6fb]"><Plus className="h-4 w-4" />New task</button>} />
    <section className={card}>
    {!day.tasks.length && <p className="mt-5 rounded-2xl bg-[#f7f9fc] px-4 py-4 text-sm text-slate-500">No ad hoc tasks.</p>}
    <div className="mt-5 space-y-2">{day.tasks.map((task) => <div key={task.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
      <input type="checkbox" checked={Boolean(task.doneOn)} disabled={busy} onChange={(event) => void run({ action: 'set_task_done', id: task.id, done: event.target.checked })} aria-label={`Done: ${task.title}`} className="mt-1 h-4 w-4 accent-emerald-600" />
      <div className="min-w-0 flex-1 text-sm"><p className={`font-semibold ${task.doneOn ? 'text-slate-400 line-through' : ''}`}>{task.title}</p>{task.details && <p className="mt-1 whitespace-pre-line text-slate-500">{task.details}</p>}<p className="mt-1 text-xs text-slate-400">Since {dmy(task.createdOn)}</p></div>
      <button onClick={() => setDraft(task)} title="Edit" aria-label={`Edit ${task.title}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]"><Pencil className="h-4 w-4" /></button>
      <button onClick={() => { if (window.confirm(`Delete the task “${task.title}”?`)) void run({ action: 'delete_task', id: task.id }); }} disabled={busy} title="Delete" aria-label={`Delete ${task.title}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
    </div>)}</div>
    {draft && <Modal title={draft.id ? 'Edit task' : 'New task'} onClose={() => setDraft(null)}>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Task</span><input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Label Inventory Code" className={input} /></label>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Details <span className="font-normal text-slate-400">(one point per line)</span></span><textarea value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} rows={4} className={`${input} h-auto py-3`} /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save task'}</button></div>
      </form>
    </Modal>}
  </section>
  </div>;
}

function Summary({ onOpen }: { onOpen: (branch: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { officeFetch(`${API}&action=overview`).then((response) => response.json()).then(setData).catch((cause) => setError(cause.message)); }, []);
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!data) return <p className="mt-6 text-sm text-slate-500">Loading summary…</p>;
  const today = Number(data.date.slice(8, 10));
  return <div className="grid gap-4 md:grid-cols-2">{data.branches.map((row) => {
    const pending = row.report ? ALL_ITEMS.filter((id) => (row.report!.checks[id]?.status || 'pending') === 'pending').length : null;
    const lateMonthly = MONTHLY.filter((task) => task.due !== null && today > task.due && !row.monthlyDone.includes(task.id));
    return <section key={row.branch} className={card}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-semibold">{row.branch}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${row.report ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{row.report ? 'Checklist filled' : 'Not filled yet'}</span></div>
      {row.report && <p className="mt-1 text-xs text-slate-500">By {row.report.preparedBy || '—'} · {new Date(row.report.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>}
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-[#f7f9fc] p-3"><dt className="text-xs text-slate-500">Items not done</dt><dd className={`mt-1 text-2xl font-semibold ${pending ? 'text-amber-600' : ''}`}>{pending ?? '—'}</dd></div>
        <div className="rounded-xl bg-[#f7f9fc] p-3"><dt className="text-xs text-slate-500">Orders not arrived</dt><dd className="mt-1 text-2xl font-semibold">{row.openOrders}</dd>{row.oldestOrder && <dd className="mt-1 text-[11px] text-slate-500">Oldest: {row.oldestOrder.supplier}, {dmy(row.oldestOrder.orderedOn)}</dd>}</div>
        <div className="rounded-xl bg-[#f7f9fc] p-3"><dt className="text-xs text-slate-500">Active vaccine bookings</dt><dd className="mt-1 text-2xl font-semibold">{row.activeBookings}</dd></div>
        <div className="rounded-xl bg-[#f7f9fc] p-3"><dt className="text-xs text-slate-500">Open ad hoc tasks</dt><dd className="mt-1 text-2xl font-semibold">{row.openTasks}</dd></div>
      </dl>
      {row.report && lines(row.report.issues).length > 0 && <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><p className="font-semibold">‼️ Outstanding issues</p><ul className="mt-1 list-disc pl-5">{lines(row.report.issues).map((issue, i) => <li key={i}>{issue}</li>)}</ul></div>}
      {lateMonthly.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><p className="font-semibold">Overdue monthly tasks</p><ul className="mt-1 list-disc pl-5">{lateMonthly.map((task) => <li key={task.id}>{task.label(monthName(data.date), monthName(data.date, -1))}</li>)}</ul></div>}
      <button onClick={() => onOpen(row.branch)} className="mt-5 text-sm font-semibold text-[#0b587b] hover:underline">Open {row.branch} checklist →</button>
    </section>;
  })}</div>;
}


type View = 'home' | 'report' | 'orders' | 'bookings' | 'tasks' | 'incentives';

// Sidebar tabs besides Home. Quick access on Home is built from this list too, as in the CA office.
const TABS: { id: Exclude<View, 'home'>; label: string; note: string; icon: typeof Home; tone: string }[] = [
  { id: 'report', label: 'Daily Checklist', note: 'Tick & send to WhatsApp', icon: ClipboardList, tone: 'text-[#20c7f4]' },
  { id: 'orders', label: 'Orders', note: 'Medicine & supplies on the way', icon: Package, tone: 'text-[#ffb000]' },
  { id: 'bookings', label: 'Vaccine Bookings', note: 'Patients waiting for stock', icon: Syringe, tone: 'text-emerald-400' },
  { id: 'tasks', label: 'Ad Hoc Tasks', note: 'Carried over until done', icon: CalendarClock, tone: 'text-[#ff7ab6]' },
  { id: 'incentives', label: 'Incentive Claims', note: 'Approve staff monthly claims', icon: Coins, tone: 'text-[#ffd36b]' },
];
const TITLES: Record<View, string> = { home: 'Home', report: 'Daily Checklist', orders: 'Orders', bookings: 'Vaccine Bookings', tasks: 'Ad Hoc Tasks', incentives: 'Incentive Claims' };

function LogoMark() { return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/20 bg-white/10 text-[#70d8fa]"><Stethoscope className="h-6 w-6" /></div>; }

function Sidebar({ view, open, branches, branch, counts, onBranch, onClose, onNavigate, onLogout }: { view: View; open: boolean; branches: string[]; branch: string; counts: Partial<Record<View, number>>; onBranch: (name: string) => void; onClose: () => void; onNavigate: (view: View) => void; onLogout: () => void }) {
  const items = [{ id: 'home' as View, label: 'Home', icon: Home }, ...TABS];
  return <>
    {open && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col overflow-y-auto overscroll-contain border-r border-white/10 bg-[#083a55] p-6 text-white transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2 py-3">
        <div className="flex items-center gap-3"><LogoMark /><div><p className="font-semibold tracking-tight">ARAOFFICE</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#70d8fa]">Clinical Admin</p></div></div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      {branches.length > 1 && <div className="mt-6 grid grid-cols-2 gap-1 rounded-[14px] bg-white/8 p-1">{branches.map((name) => <button key={name} onClick={() => onBranch(name)} className={`rounded-[10px] px-2 py-2 text-xs font-bold transition ${branch === name ? 'bg-white text-[#162a43]' : 'text-[#b8cddd] hover:text-white'}`}>{name}</button>)}</div>}
      <div className="mx-1 mt-6 h-px bg-white/10" />
      <nav className="mt-7 flex-1 space-y-2">{items.map((item) => <button key={item.id} onClick={() => onNavigate(item.id)} className={`flex w-full items-center gap-3 rounded-[14px] px-4 py-3.5 text-sm font-semibold transition ${view === item.id ? 'bg-white text-[#162a43] shadow-[0_10px_28px_rgba(0,0,0,0.14)] [&>svg]:text-[#7357ff]' : 'text-[#b8cddd] hover:bg-white/8 hover:text-white'}`}>
        <item.icon className="h-5 w-5" />{item.label}
        {counts[item.id] ? <span className="ml-auto grid h-6 min-w-6 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] text-white">{counts[item.id]}</span> : <ChevronRight className="ml-auto h-4 w-4 opacity-45" />}
      </button>)}</nav>
      <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-sm font-semibold">{branches.length > 1 ? 'All' : branch === 'Seri Kembangan' ? 'SK' : branch === 'Kajang' ? 'KJ' : '—'}</div><div className="min-w-0"><p className="truncate text-sm font-semibold">Clinical Admin</p><p className="truncate text-xs text-[#9bb5c7]">{branches.length > 1 ? 'All branches' : branch || 'No branch assigned'}</p></div></div>
        <button onClick={onLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[#b5cad8] transition hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </aside>
  </>;
}

function HomeView({ day, overseer, onNavigate, onOpenBranch }: { day: Day | null; overseer: boolean; onNavigate: (view: View) => void; onOpenBranch: (branch: string) => void }) {
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
  const pendingOrders = day ? day.orders.filter((order) => !order.closed && !order.cancelled).length : 0;
  const openTasks = day ? day.tasks.filter((task) => !task.doneOn).length : 0;
  return <div className="mx-auto max-w-[1500px] space-y-8">
    <section className="rounded-[30px] bg-[#0b3d59] px-7 py-9 text-white sm:px-10 lg:px-12">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Klinik ARA 24 Jam · Clinical Administration</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-[2.45rem]">{overseer ? 'Branch overview' : `Welcome, Clinical Admin ${day?.branch || ''}`}</h2>
      <p className="mt-3 text-base text-[#bed2df]">{date}</p>
      {!overseer && day && <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[[day.report.saved ? 'Saved' : 'Not yet', "Today's checklist", 'report'], [pendingOrders, 'Orders not arrived', 'orders'], [day.bookings.length, 'Active vaccine bookings', 'bookings'], [openTasks, 'Open ad hoc tasks', 'tasks']].map(([value, label, view]) => <button key={label as string} onClick={() => onNavigate(view as View)} className="rounded-2xl border border-white/15 bg-white/10 p-4 text-left transition hover:bg-white/15"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-sm text-[#b9cfdd]">{label}</p></button>)}
      </div>}
    </section>
    {overseer && <section><div className="mb-4 flex items-end justify-between gap-4"><h3 className="text-2xl font-semibold tracking-tight">Today</h3><span className="text-xs font-bold uppercase tracking-[0.18em] text-[#9aacc0]">Both branches</span></div><Summary onOpen={onOpenBranch} /></section>}
    <section>
      <div className="mb-4 flex items-end justify-between gap-4"><h3 className="text-2xl font-semibold tracking-tight">Quick access</h3><span className="text-xs font-bold uppercase tracking-[0.18em] text-[#9aacc0]">Shortcuts</span></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{TABS.map((item) => <button key={item.id} onClick={() => onNavigate(item.id)} className="group min-h-[132px] rounded-[24px] bg-[#0b3d59] p-5 text-left text-white transition hover:-translate-y-0.5 hover:bg-[#104b6c]">
        <div className="flex items-center justify-between"><item.icon className={`h-6 w-6 ${item.tone}`} /><ArrowRight className="h-4 w-4 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white" /></div>
        <p className="mt-6 font-semibold">{item.label}</p><p className="mt-1 text-sm text-[#9bb5c7]">{item.note}</p>
      </button>)}</div>
    </section>
  </div>;
}

export default function OfficeClinical() {
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState('');
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState('');
  const overseer = (branches?.length || 0) > 1;

  useEffect(() => {
    officeFetch(`${API}&action=branches`).then((response) => response.json()).then(({ branches: names }) => { setBranches(names); setBranch(names[0] || ''); })
      .catch((cause) => setError(cause.message));
  }, []);
  const load = async () => {
    if (!branch) return;
    try { setDay(await (await officeFetch(`${API}&action=day&branch=${encodeURIComponent(branch)}`)).json()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load.'); }
  };
  useEffect(() => { setDay(null); void load(); }, [branch]);

  const navigate = (next: View) => { setView(next); setMenuOpen(false); setError(''); window.scrollTo({ top: 0 }); };
  const onError = (message: string) => { setError(message); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const logout = async () => {
    await signOutSupabase();
    localStorage.removeItem('ara_portal_session');
    localStorage.removeItem('araoffice_user');
    localStorage.removeItem('ara_view_mode');
    window.location.hash = '';
  };
  const counts = useMemo<Partial<Record<View, number>>>(() => day ? {
    orders: day.orders.filter((order) => !order.closed && !order.cancelled).length,
    tasks: day.tasks.filter((task) => !task.doneOn).length,
  } : {}, [day]);

  return <div className="min-h-screen bg-[#f7f8fb] text-[#14233b]">
    <Sidebar view={view} open={menuOpen} branches={branches || []} branch={branch} counts={counts} onBranch={setBranch} onClose={() => setMenuOpen(false)} onNavigate={navigate} onLogout={() => void logout()} />
    <div className="min-h-screen lg:pl-[300px]">
      <header className="sticky top-0 z-30 border-b border-[#dce4ed] bg-[#f7f8fb]/90 backdrop-blur-2xl lg:hidden">
        <div className="flex h-[76px] items-center gap-4 px-4 sm:px-6">
          <button className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce4ed] bg-white" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#18bff2]">Clinical Admin · {branch}</p><h1 className="truncate text-xl font-semibold tracking-tight">{TITLES[view]}</h1></div>
        </div>
      </header>
      <main className="p-4 sm:p-6 lg:p-[38px]">
        {branches && branches.length === 0 && <Banner tone="error">This account is not linked to a branch yet. Ask System Admin to link it to Kajang or Seri Kembangan.</Banner>}
        {error && <div className="mx-auto mb-4 max-w-[1500px] cursor-pointer" onClick={() => setError('')}><Banner tone="error">{error}</Banner></div>}
        {view === 'home' && <HomeView day={day} overseer={overseer} onNavigate={navigate} onOpenBranch={(name) => { setBranch(name); navigate('report'); }} />}
        {view !== 'home' && view !== 'incentives' && !day && branch && <p className="text-sm text-slate-500">Loading…</p>}
        {/* Stays mounted while other tabs are open so unsaved ticks are kept; keyed so a new branch or day starts from the server's copy. */}
        {day && <div key={`${day.branch}-${day.date}`} className={view === 'report' ? '' : 'hidden'}><DailyReport day={day} reload={load} onError={onError} /></div>}
        {view === 'orders' && day && <Orders day={day} reload={load} onError={onError} />}
        {view === 'bookings' && day && <Bookings day={day} reload={load} onError={onError} />}
        {view === 'tasks' && day && <Tasks day={day} reload={load} onError={onError} />}
        {view === 'incentives' && branch && <ClinicalIncentives key={branch} branch={branch} branches={branches || []} onError={onError} />}
      </main>
    </div>
  </div>;
}
