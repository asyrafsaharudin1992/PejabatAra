import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, BookOpen, Phone, Search, ChevronLeft, Clock3, History, Printer, Coins, Link2, Minus, Check, ChevronRight, ClipboardList, Copy, Home, LogOut, Menu, MessageCircle, Package, Pencil, Plus, Save, Stethoscope, Syringe, Trash2, X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { signOutSupabase } from './lib/supabase';
import { card, input, Modal } from './AssessmentStaff';
import ClinicalIncentives from './ClinicalIncentives';
import { homeQuote, LinksView, PanelTrainingView } from './PortalApp';
import { usePanelTraining } from './lib/usePanelTraining';
import PrintForms from './PrintForms';
import { usePrintForms } from './lib/usePrintForms';
import type { QuickLink } from './portalData';

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
type Day = { date: string; branch: string; report: { saved: boolean; preparedBy: string; checks: Checks; issues: string; staffing: string; updatedAt: string | null }; orders: Order[]; bookings: Booking[]; tasks: Task[]; monthlyStatus: Record<string, CheckStatus>; monthlyNotes: Record<string, string>; monthlyDues: Record<string, string>; customMonthly: { id: string; label: string; due: number | null }[] };
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

// The standard monthly list plus any extra tasks this branch's Clinical Admin added.
const monthlyFor = (day: Day) => [...MONTHLY, ...(day.customMonthly || []).map((task) => ({ id: task.id, due: task.due, label: () => task.label }))];

const MARK: Record<CheckStatus, string> = { done: '✅', pending: '☑️', na: '❌' };
// Status choices for each checklist item. Pressing the chosen one again clears it.
const STATUS_BUTTONS: [CheckStatus, string, string][] = [['done', 'Done', 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200'], ['pending', 'Not done', 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-200'], ['na', 'Not needed', 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200']];

// The round tick at the start of each row: empty until marked, then shows the status.
function TickCircle({ status, onClick, label }: { status?: CheckStatus; onClick: () => void; label: string }) {
  const look = status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : status === 'pending' ? 'border-amber-400 bg-amber-50 text-amber-600' : status === 'na' ? 'border-slate-300 bg-slate-100 text-slate-400' : 'border-slate-300 bg-white text-transparent hover:border-emerald-400 hover:text-emerald-300';
  return <button type="button" onClick={onClick} aria-label={status === 'done' ? `Untick ${label}` : `Tick ${label}`} aria-pressed={status === 'done'} className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-[1.5px] transition ${look}`}>
    {status === 'pending' ? <Clock3 className="h-3.5 w-3.5" strokeWidth={2.2} /> : status === 'na' ? <Minus className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
  </button>;
}
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
  out.push(...monthlyFor(day).flatMap((task) => [`•  ${task.label(monthName(day.date), monthName(day.date, -1))} ${MARK[day.monthlyStatus?.[task.id] || 'pending']}`, ...lines(day.monthlyNotes?.[task.id] || '').map((line) => `   - ${line}`)]));
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

function DailyReport({ day, reload, onError, onPatch }: { day: Day; reload: () => Promise<void>; onError: (message: string) => void; onPatch: (change: (day: Day) => Day) => void }) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...day.report, preparedBy: day.report.preparedBy || localStorage.getItem(PREPARED_KEY(day.branch)) || '' }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [openNote, setOpenNote] = useState<string | null>(null);
  const change = (next: Partial<Draft>) => { setDraft((current) => ({ ...current, ...next })); setDirty(true); setNotice(''); };
  const setCheck = (id: string, next: Partial<Checks[string]>) => change({ checks: { ...draft.checks, [id]: { status: 'pending', note: '', ...draft.checks[id], ...next } } });
  // Unmarking removes the item, so it goes out as ☑️ not done until it is marked again.
  const clearCheck = (id: string) => { const { [id]: _removed, ...rest } = draft.checks; change({ checks: rest }); };
  const choose = (id: string, status: CheckStatus) => draft.checks[id]?.status === status ? clearCheck(id) : setCheck(id, { status });

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
  // Browsers (Safari especially) only allow copying straight after the tap, so the report is
  // copied before saving, not after. The old-style copy is a fallback where the Clipboard API is refused.
  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(area); area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  };
  const sendToWhatsApp = async () => {
    if (!ready()) return;
    const text = buildReport(day, draft);
    // Copying starts first, while this page still has focus; the tab opens straight after, still
    // within the tap, so the browser does not treat it as an unwanted pop-up.
    const copying = copyText(text);
    const tab = window.open('', '_blank');
    const copied = await copying;
    if (!(await save())) { tab?.close(); return; }
    // wa.me loses emoji on its redirect (they arrive as �), so go to api.whatsapp.com directly.
    // The report is also copied, so it can be pasted if WhatsApp Desktop still mangles it.
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    if (tab) tab.location.href = url; else window.location.href = url;
    setNotice(copied ? 'Saved and copied. Choose the WhatsApp group and press Send. If the ticks show as �, clear the message and paste (⌘V / Ctrl+V) instead.' : 'Saved. Choose the WhatsApp group and press Send.');
  };
  const copy = async () => {
    if (!ready()) return;
    const copied = await copyText(buildReport(day, draft));
    if (!(await save())) return;
    setNotice(copied ? 'Saved and copied. Paste it into WhatsApp (⌘V / Ctrl+V).' : 'Saved, but this browser blocked copying. Use Send to WhatsApp instead.');
  };
  // Monthly and ad hoc ticks save straight away; Copy and Send wait until they have, so the
  // report always carries the latest ticks.
  const [syncing, setSyncing] = useState(0);
  const track = (busy: boolean) => setSyncing((count) => Math.max(0, count + (busy ? 1 : -1)));
  // The tick shows at once; only the tick is sent, and the day is reloaded only if saving fails.
  // Pressing the chosen status again clears it.
  const setMonthly = async (taskId: string, status: CheckStatus) => {
    const next = day.monthlyStatus?.[taskId] === status ? undefined : status;
    onPatch((current) => { const monthlyStatus = { ...current.monthlyStatus }; if (next) monthlyStatus[taskId] = next; else delete monthlyStatus[taskId]; return { ...current, monthlyStatus }; });
    track(true);
    try { await post({ action: 'set_monthly', branch: day.branch, taskId, status: next ?? null }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to update.'); await reload(); }
    finally { track(false); }
  };

  const [newTask, setNewTask] = useState('');
  const saveMonthlyList = async (tasks: Day['customMonthly']) => {
    onPatch((current) => ({ ...current, customMonthly: tasks }));
    track(true);
    try { await post({ action: 'save_monthly_tasks', branch: day.branch, tasks }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to update.'); await reload(); }
    finally { track(false); }
  };
  const addMonthly = async () => {
    const label = newTask.trim();
    if (!label) return;
    const id = `c-${Date.now().toString(36)}`;
    setNewTask('');
    await saveMonthlyList([...(day.customMonthly || []), { id, label, due: null }]);
  };
  const [openMonthlyNote, setOpenMonthlyNote] = useState<string | null>(null);
  // Notes are typed locally and saved when the box loses focus.
  const changeMonthlyNote = (taskId: string, note: string) => onPatch((current) => ({ ...current, monthlyNotes: { ...current.monthlyNotes, [taskId]: note } }));
  const setMonthlyDue = async (taskId: string, due: string) => {
    onPatch((current) => { const monthlyDues = { ...current.monthlyDues }; if (due) monthlyDues[taskId] = due; else delete monthlyDues[taskId]; return { ...current, monthlyDues }; });
    track(true);
    try { await post({ action: 'save_monthly_due', branch: day.branch, taskId, due }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to update.'); await reload(); }
    finally { track(false); }
  };
  const saveMonthlyNote = async (taskId: string) => {
    track(true);
    try { await post({ action: 'save_monthly_note', branch: day.branch, taskId, note: day.monthlyNotes?.[taskId] || '' }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to update.'); await reload(); }
    finally { track(false); }
  };
  const removeMonthly = (id: string) => saveMonthlyList((day.customMonthly || []).filter((task) => task.id !== id));

  const today = Number(day.date.slice(8, 10));
  const received = day.orders.flatMap((order) => order.items.filter((item) => item.receivedOn === day.date).map((item) => ({ order, item })));
  const pendingOrders = day.orders.filter((order) => !order.closed && !order.cancelled);

  // Sticky at the top: the bottom-right corner belongs to the office switcher.
  return <div className="mx-auto max-w-[1500px] pb-10">
    <Hero branch={day.branch} title="Daily checklist" text="Tick each item, then send the report to the WhatsApp group in one tap. Orders, vaccine bookings and ad hoc tasks are added for you." />
    <div className="sticky top-[76px] z-20 -mx-4 mt-4 lg:top-0 sm:-mx-6 lg:mx-0 border-b border-slate-200 bg-[#f5f7f9]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-2xl">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {syncing > 0 ? <span className="mr-auto text-xs font-semibold text-slate-500">Saving tick…</span> : dirty && <span className="mr-auto text-xs font-semibold text-amber-700">Unsaved changes</span>}
        <button onClick={() => void save().then((ok) => ok && setNotice('Saved.'))} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Save className="h-4 w-4" />Save</button>
        <button onClick={() => void copy()} disabled={saving || syncing > 0} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Copy className="h-4 w-4" />Copy</button>
        <button onClick={() => void sendToWhatsApp()} disabled={saving || syncing > 0} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#25d366] px-5 text-sm font-bold text-white hover:bg-[#1ebe5a] disabled:opacity-50"><MessageCircle className="h-4 w-4" />Send to WhatsApp</button>
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
            <div className="flex items-start gap-3"><TickCircle status={check?.status} label={label} onClick={() => choose(id, 'done')} /><p className={`text-sm leading-6 ${check?.status === 'done' ? 'text-slate-500' : check?.status === 'na' ? 'text-slate-400' : ''}`}>{label}</p></div>
            <div className="flex shrink-0 items-center gap-1.5 pl-9 sm:pl-0">
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5">{STATUS_BUTTONS.map(([status, text, active]) => <button key={status} onClick={() => choose(id, status)} aria-pressed={check?.status === status} className={`rounded-[10px] px-2.5 py-1 text-xs font-semibold transition ${check?.status === status ? active : 'text-slate-500 hover:text-slate-700'}`}>{text}</button>)}</div>
              <button onClick={() => setOpenNote(openNote === id ? null : id)} title="Note" aria-label={`Note for ${label}`} className={`rounded-lg p-1.5 ${check?.note ? 'bg-[#e9f6fb] text-[#0b587b]' : 'text-slate-400 hover:bg-slate-100'}`}><Pencil className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {(openNote === id || check?.note) && <textarea value={check?.note || ''} onChange={(event) => setCheck(id, { note: event.target.value })} rows={1} placeholder="Note (e.g. Recheck email influenza vaccine)" className={`${input} mt-2 h-auto py-2`} />}
        </div>;
      })}</div>
      {section.id === 'staff' && <label className="mt-3 block"><span className="mb-2 block text-xs font-bold text-slate-700">Today's shifts <span className="font-normal text-slate-400">(copied from yesterday's report; update it for today)</span></span><textarea value={draft.staffing} onChange={(event) => change({ staffing: event.target.value })} rows={6} placeholder={'Shift am :\n•  Era, Athirah (9am-9pm)\nShift pm :\n•  Puteri, Amy (9pm-9am)'} className={`${input} h-auto py-3 font-mono text-xs`} /></label>}
      {section.id === 'pharmacy' && SHOW_ORDERS && <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm"><p className="font-semibold text-emerald-800">Arrived today</p>{received.length ? <ul className="mt-2 space-y-1 text-emerald-900">{received.map(({ order, item }, i) => <li key={i}>{order.supplier}: {item.name}{item.qty && ` - ${item.qty}`}</li>)}</ul> : <p className="mt-2 text-emerald-700/70">Nothing yet. Tick deliveries under Orders.</p>}</div>
        <div className="rounded-2xl bg-amber-50 p-4 text-sm"><p className="font-semibold text-amber-800">Orders not yet arrived</p>{pendingOrders.length ? <ul className="mt-2 space-y-1 text-amber-900">{pendingOrders.map((order) => <li key={order.id}>{order.supplier} ({dmy(order.orderedOn)}): {order.items.filter((item) => !item.receivedOn).length} item(s)</li>)}</ul> : <p className="mt-2 text-amber-700/70">None.</p>}</div>
      </div>}
    </section>)}

    <AdHocTasks day={day} reload={reload} onError={onError} onBusy={track} onPatch={onPatch} />

    <section className={`mt-4 ${card}`}>
      <h2 className="text-lg font-semibold">Monthly tasks</h2>
      <div className="mt-3 divide-y divide-slate-100">{monthlyFor(day).map((task) => {
        const status = day.monthlyStatus?.[task.id];
        const picked = day.monthlyDues?.[task.id] || '';
        const late = !status && (picked ? day.date > picked : task.due !== null && today > task.due);
        const note = day.monthlyNotes?.[task.id] || '';
        const custom = (day.customMonthly || []).some((item) => item.id === task.id);
        const text = task.label(monthName(day.date), monthName(day.date, -1));
        return <div key={task.id} className="py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3"><TickCircle status={status} label={text} onClick={() => void setMonthly(task.id, 'done')} /><p className={`text-sm leading-6 ${status === 'done' ? 'text-slate-500' : status === 'na' ? 'text-slate-400' : ''}`}>{text}</p>{late && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">Overdue</span>}</div>
            <div className="flex shrink-0 items-center gap-1.5 pl-9 sm:pl-0">
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5">{STATUS_BUTTONS.map(([value, name, active]) => <button key={value} type="button" onClick={() => void setMonthly(task.id, value)} aria-pressed={status === value} className={`rounded-[10px] px-2.5 py-1 text-xs font-semibold transition ${status === value ? active : 'text-slate-500 hover:text-slate-700'}`}>{name}</button>)}</div>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">Due date<input type="date" value={picked} onChange={(event) => void setMonthlyDue(task.id, event.target.value)} aria-label={`Due date for ${text}`} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700" /></label>
              <button type="button" onClick={() => setOpenMonthlyNote(openMonthlyNote === task.id ? null : task.id)} title="Note" aria-label={`Note for ${text}`} className={`rounded-lg p-1.5 ${note ? 'bg-[#e9f6fb] text-[#0b587b]' : 'text-slate-400 hover:bg-slate-100'}`}><Pencil className="h-3.5 w-3.5" /></button>
              {custom && <button type="button" onClick={() => void removeMonthly(task.id)} title="Delete task" aria-label={`Delete ${text}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
          {(openMonthlyNote === task.id || note) && <textarea value={note} onChange={(event) => changeMonthlyNote(task.id, event.target.value)} onBlur={() => void saveMonthlyNote(task.id)} rows={1} maxLength={500} placeholder="Note (e.g. Waiting for Dr. to confirm)" className={`${input} mt-2 h-auto py-2`} />}
        </div>;
      })}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addMonthly(); } }} placeholder="Add a monthly task" maxLength={160} className={`${input} min-w-0 flex-1`} />
        <button type="button" onClick={() => void addMonthly()} disabled={!newTask.trim()} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Add</button>
      </div>
      <p className="mt-3 text-xs text-slate-400">Active vaccine bookings and ad hoc tasks are added to the report automatically.</p>
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

// Ad hoc tasks, shown inside the daily checklist. They carry over until ticked done.
function AdHocTasks({ day, reload, onError, onBusy, onPatch }: { day: Day; reload: () => Promise<void>; onError: (message: string) => void; onBusy: (busy: boolean) => void; onPatch: (change: (day: Day) => Day) => void }) {
  const [draft, setDraft] = useState<{ id?: string; title: string; details: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>) => {
    setBusy(true); onBusy(true);
    try { await post(body); await reload(); return true; }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); return false; }
    finally { setBusy(false); onBusy(false); }
  };
  // Ticking a task done shows at once; only the tick is sent, and the day reloads only on failure.
  const toggleDone = async (task: Task) => {
    const doneOn = task.doneOn ? null : day.date;
    onPatch((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, doneOn } : item) }));
    onBusy(true);
    try { await post({ action: 'set_task_done', id: task.id, done: Boolean(doneOn) }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); await reload(); }
    finally { onBusy(false); }
  };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (draft && await run({ action: 'save_task', branch: day.branch, ...draft })) setDraft(null); };
  return <section className={`mt-4 ${card}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Ad hoc tasks</h2><p className="mt-1 text-xs text-slate-500">Any extra task for today. It stays in the report until ticked done; tasks finished today still show with ✅.</p></div><button onClick={() => setDraft({ title: '', details: '' })} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#083a55]"><Plus className="h-4 w-4" />Add task</button></div>
    {!day.tasks.length && <p className="mt-4 rounded-2xl bg-[#f7f9fc] px-4 py-4 text-sm text-slate-500">No ad hoc tasks. Press Add task to add one.</p>}
    <div className="mt-4 divide-y divide-slate-100">{day.tasks.map((task) => <div key={task.id} className="flex items-start gap-3 py-3">
      <TickCircle status={task.doneOn ? 'done' : undefined} label={task.title} onClick={() => void toggleDone(task)} />
      <div className="min-w-0 flex-1 text-sm"><p className={`font-semibold leading-6 ${task.doneOn ? 'text-slate-400 line-through' : ''}`}>{task.title}</p>{task.details && <p className="mt-1 whitespace-pre-line text-slate-500">{task.details}</p>}<p className="mt-1 text-xs text-slate-400">Since {dmy(task.createdOn)}</p></div>
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
  </section>;
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


type View = 'home' | 'report' | 'history' | 'orders' | 'bookings' | 'contacts' | 'incentives' | 'forms' | 'panel' | 'links';

// Sidebar tabs besides Home. Quick access on Home is built from this list too, as in the CA office.
// Turn back on together with the Orders tab.
const SHOW_ORDERS = false;

const TABS: { id: Exclude<View, 'home'>; label: string; note: string; icon: typeof Home; tone: string }[] = [
  { id: 'report', label: 'Daily Checklist', note: 'Tick & send to WhatsApp', icon: ClipboardList, tone: 'text-[#20c7f4]' },
  { id: 'history', label: 'History', note: 'What was done each day', icon: History, tone: 'text-[#9b8cff]' },
  // Orders and Vaccine Bookings are hidden for now; their data and screens are kept.
  { id: 'contacts', label: 'Quick Contact', note: 'Suppliers & services', icon: Phone, tone: 'text-emerald-400' },
  { id: 'incentives', label: 'Incentive Claims', note: 'Approve staff monthly claims', icon: Coins, tone: 'text-[#ffd36b]' },
  { id: 'forms', label: 'Print Forms', note: 'Forms admin prints often', icon: Printer, tone: 'text-[#a78bfa]' },
  { id: 'panel', label: 'Panel', note: 'Panel guides & portals', icon: BookOpen, tone: 'text-emerald-400' },
  { id: 'links', label: 'Important Links', note: 'Work systems', icon: Link2, tone: 'text-[#20c7f4]' },
];
const TITLES: Record<View, string> = { home: 'Home', report: 'Daily Checklist', history: 'History', contacts: 'Quick Contact', orders: 'Orders', bookings: 'Vaccine Bookings', incentives: 'Incentive Claims', forms: 'Print Forms', panel: 'Panel', links: 'Important Links' };

// Shown until System Admin saves its own list in the Important Links tab.
const DEFAULT_LINKS: QuickLink[] = [
  { id: 'eswis', title: 'ESWIS (Updated Clinical Waste)', url: 'https://eswisv2.doe.gov.my/', description: 'Clinical waste records', group: 'Systems' },
  { id: 'order-ubat-kj', title: 'Order Ubat Tracker KJ', url: 'https://docs.google.com/spreadsheets/d/1MbzxDCcmexpSBHlPmfItX49Fr556UEA3Gf52o29IBYY/edit?pli=1&gid=1987617551#gid=1987617551', description: 'Medicine order tracker (Kajang)', group: 'Orders' },
  { id: 'infotech', title: 'Login Infotech', url: 'https://login-infotech.com/Login?rUrl=https%3a%2f%2fwww.infotech-cloudhr.com.my%2fLogin.aspx', description: 'Infotech Cloud HR', group: 'Systems' },
  { id: 'zuellig', title: 'Zuellig Pharma', url: 'https://my.ezrx.com/', description: 'eZRx ordering', group: 'Orders' },
];

function LogoMark() { return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/20 bg-white/10 text-[#70d8fa]"><Stethoscope className="h-6 w-6" /></div>; }

function Sidebar({ view, open, branches, branch, viewAs, counts, onViewAs, onClose, onNavigate, onLogout }: { view: View; open: boolean; branches: string[]; branch: string; viewAs: string; counts: Partial<Record<View, number>>; onViewAs: (name: string) => void; onClose: () => void; onNavigate: (view: View) => void; onLogout: () => void }) {
  const items = [{ id: 'home' as View, label: 'Home', icon: Home, tone: 'text-[#818cf8]' }, ...TABS];
  return <>
    {open && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col overflow-y-auto overscroll-contain border-r border-white/5 bg-[#1b3150] p-6 text-white transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2 py-3">
        <div className="flex items-center gap-3"><LogoMark /><div><p className="text-[15px] font-bold tracking-tight">ARAOFFICE</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#70d8fa]">Clinical Admin</p></div></div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      {/* Accounts that see every branch (System Admin, COO, CEO) can view the office as each branch's admin. */}
      {branches.length > 1 && <div className="mt-6"><p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8fb3c9]">View as</p><div className="grid gap-1 rounded-[14px] bg-white/8 p-1" style={{ gridTemplateColumns: `repeat(${branches.length + 1}, minmax(0, 1fr))` }}>{['all', ...branches].map((name) => <button key={name} onClick={() => onViewAs(name)} title={name === 'all' ? 'Both branches' : name} className={`rounded-[10px] px-1.5 py-2 text-xs font-bold leading-tight transition ${viewAs === name ? 'bg-white text-[#162a43]' : 'text-[#b8cddd] hover:text-white'}`}>{name === 'all' ? 'All' : ADMIN_NAMES[name] || name}<span className={`block text-[9px] font-semibold ${viewAs === name ? 'text-slate-400' : 'text-[#8fb3c9]'}`}>{name === 'all' ? 'Overview' : BRANCH_CODES[name] || name}</span></button>)}</div></div>}
      <div className="mx-1 mt-5 h-px bg-white/10" />
      <nav className="mt-6 flex-1 space-y-1">{items.map((item) => <button key={item.id} onClick={() => onNavigate(item.id)} className={`flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold transition ${view === item.id ? 'bg-white text-[#162a43] shadow-[0_10px_28px_rgba(0,0,0,0.18)]' : 'text-[#e3ecf5] hover:bg-white/[0.07] hover:text-white'}`}>
        <item.icon className={`h-[18px] w-[18px] shrink-0 ${item.id === 'home' && view === 'home' ? 'text-[#5b4cf0]' : item.tone}`} strokeWidth={1.8} />{item.label}
        {counts[item.id] ? <span className="ml-auto grid h-6 min-w-6 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] text-white">{counts[item.id]}</span> : <ChevronRight className="ml-auto h-4 w-4 opacity-45" />}
      </button>)}</nav>
      <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-sm font-semibold">{branches.length > 1 && viewAs === 'all' ? 'All' : BRANCH_CODES[branch] || '—'}</div><div className="min-w-0"><p className="truncate text-sm font-semibold">{branches.length > 1 && viewAs !== 'all' ? `Viewing as ${ADMIN_NAMES[branch] || branch}` : ADMIN_NAMES[branch] && branches.length === 1 ? `${ADMIN_NAMES[branch]} · Clinical Admin` : 'Clinical Admin'}</p><p className="truncate text-xs text-[#9bb5c7]">{branches.length > 1 && viewAs === 'all' ? 'All branches' : branch || 'No branch assigned'}</p></div></div>
        <button onClick={onLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[#b5cad8] transition hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </aside>
  </>;
}

// History: a month of the branch's checklists on a calendar, like the Quality office's
// Task History. Each day is coloured by how much of the checklist was done; pressing a
// day shows what was ticked, the notes, ad hoc tasks finished and deliveries received.
type HistoryData = { month: string; branch: string; today: string; since: string; reports: { date: string; preparedBy: string; checks: Checks; issues: string; updatedAt: string }[]; tasks: Task[]; monthly: { taskId: string; doneOn: string }[]; received: { supplier: string; name: string; qty: string; receivedOn: string }[] };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUS_ICON: Record<CheckStatus | 'unmarked', { icon: typeof Check; tone: string; label: string }> = {
  done: { icon: Check, tone: 'bg-emerald-500 text-white', label: 'Done' },
  pending: { icon: Clock3, tone: 'bg-amber-100 text-amber-700', label: 'Not done' },
  na: { icon: Minus, tone: 'bg-slate-200 text-slate-500', label: 'Not needed' },
  unmarked: { icon: Minus, tone: 'bg-white text-slate-300 ring-1 ring-slate-200', label: 'Not marked' },
};
const shiftMonthKey = (month: string, by: number) => { const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by; return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`; };
// Done / (items that were needed); "not needed" items do not count against the day.
function dayScore(checks: Checks) {
  const statuses = ALL_ITEMS.map((id) => checks[id]?.status);
  const done = statuses.filter((status) => status === 'done').length;
  const na = statuses.filter((status) => status === 'na').length;
  const pending = statuses.filter((status) => status === 'pending').length;
  const needed = ALL_ITEMS.length - na;
  return { done, na, pending, unmarked: ALL_ITEMS.length - done - na - pending, percent: needed ? Math.round((done / needed) * 100) : 100 };
}
const scoreTone = (percent: number) => percent >= 90 ? 'bg-emerald-500' : percent >= 60 ? 'bg-amber-400' : 'bg-rose-400';

function ClinicalHistory({ branch, onError }: { key?: string; branch: string; onError: (message: string) => void }) {
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  const [month, setMonth] = useState(todayKey.slice(0, 7));
  const [data, setData] = useState<HistoryData | null>(null);
  const [selected, setSelected] = useState(todayKey);

  useEffect(() => {
    let live = true;
    setData(null);
    officeFetch(`${API}&action=history&branch=${encodeURIComponent(branch)}&month=${month}`).then((response) => response.json())
      .then((result: HistoryData) => { if (!live) return; setData(result); if (selected.slice(0, 7) !== month) setSelected(result.reports.at(-1)?.date || `${month}-01`); })
      .catch((cause) => { if (live) onError(cause instanceof Error ? cause.message : 'Unable to load history.'); });
    return () => { live = false; };
  }, [branch, month]);

  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const key = (day: number) => `${month}-${String(day).padStart(2, '0')}`;
  const reportOn = (date: string) => data?.reports.find((report) => report.date === date);
  // Days that have passed (today included) are the ones a checklist was due.
  // Days that have passed (today included) since the branch's first checklist are the ones a checklist was due.
  const dueDays = Array.from({ length: daysInMonth }, (_, i) => key(i + 1)).filter((date) => date <= todayKey && date >= (data?.since || todayKey));
  const scores = (data?.reports || []).map((report) => dayScore(report.checks).percent);
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  const monthlyDone = new Set((data?.monthly || []).map((item) => item.taskId));

  const report = reportOn(selected);
  const score = report && dayScore(report.checks);
  const dayTasks = (data?.tasks || []).filter((task) => task.doneOn === selected);
  const dayReceived = (data?.received || []).filter((item) => item.receivedOn === selected);
  const dayMonthly = (data?.monthly || []).filter((item) => item.doneOn === selected);
  const dateLabel = new Date(`${selected}T12:00:00+08:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <Hero branch={branch} title="History" text="Every day's checklist for the month. Pick a day to see what was done, the notes, ad hoc tasks finished and deliveries received." />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[[data ? `${data.reports.length} / ${dueDays.length}` : '—', 'Days with a checklist'], [data ? `${average}%` : '—', 'Average done'], [data ? data.tasks.length : '—', 'Ad hoc tasks finished'], [data ? `${monthlyDone.size} / ${MONTHLY.length}` : '—', 'Monthly tasks done']].map(([value, label]) => <div key={label as string} className="rounded-2xl bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.05)]"><p className="text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{label}</p></div>)}
    </section>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{monthName(`${month}-01`)}</h2>
          <div className="flex items-center gap-1"><button onClick={() => setMonth(shiftMonthKey(month, -1))} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button><button onClick={() => { setMonth(todayKey.slice(0, 7)); setSelected(todayKey); }} className="rounded-xl px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-100">Today</button><button onClick={() => setMonth(shiftMonthKey(month, 1))} disabled={month >= todayKey.slice(0, 7)} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Next month"><ChevronRight className="h-5 w-5" /></button></div>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((day) => <p key={day} className="pb-1 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{day}</p>)}
          {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const date = key(i + 1);
            const dayReport = reportOn(date);
            const percent = dayReport ? dayScore(dayReport.checks).percent : null;
            const future = date > todayKey;
            const missed = !dayReport && !future && data && date >= data.since;
            const chosen = date === selected;
            return <button key={date} onClick={() => setSelected(date)} disabled={future} className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl border text-sm transition ${chosen ? 'border-[#0b587b] bg-[#0b587b] text-white shadow-lg shadow-[#0b587b]/20' : 'border-slate-100 bg-[#f8fafb] hover:border-slate-300 hover:bg-white'} ${future ? 'opacity-35' : ''}`}>
              <span className={`font-semibold ${date === todayKey && !chosen ? 'text-[#0b9aca]' : ''}`}>{i + 1}</span>
              {percent !== null && <span className={`mt-1 text-[10px] font-semibold ${chosen ? 'text-white/85' : 'text-slate-500'}`}>{percent}%</span>}
              {percent !== null && <span className={`absolute bottom-1.5 h-1 w-6 rounded-full ${chosen ? 'bg-white/70' : scoreTone(percent)}`} />}
              {missed && <span className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${chosen ? 'bg-white/70' : 'bg-rose-300'}`} />}
              {(data?.tasks || []).some((task) => task.doneOn === date) && <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${chosen ? 'bg-white' : 'bg-[#9b8cff]'}`} title="Ad hoc task finished" />}
            </button>;
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-emerald-500" />90% or more done</span>
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-amber-400" />60–89%</span>
          <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-rose-400" />Below 60%</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-300" />No checklist</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#9b8cff]" />Ad hoc task finished</span>
        </div>
      </section>

      <section className={`${card} lg:max-h-[calc(100vh/0.95-120px)] lg:overflow-y-auto`}>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0b9aca]">{dateLabel}</p>
        {!data ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : !report ? <p className={`mt-4 rounded-2xl p-4 text-sm ${selected < data.since ? 'bg-slate-50 text-slate-500' : 'bg-rose-50 text-rose-700'}`}>{selected < data.since ? 'This was before the first checklist was saved here.' : 'No checklist was saved for this day.'}</p> : <>
          <p className="mt-2 text-sm text-slate-600">Prepared by <strong className="text-[#14233b]">{report.preparedBy || '—'}</strong> · saved {new Date(report.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })}</p>
          {score && <div className="mt-4"><div className="flex items-baseline justify-between"><span className="text-3xl font-semibold tracking-tight">{score.percent}%</span><span className="text-xs text-slate-500">{score.done} done · {score.pending} not done · {score.na} not needed{score.unmarked ? ` · ${score.unmarked} not marked` : ''}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${scoreTone(score.percent)}`} style={{ width: `${score.percent}%` }} /></div></div>}
          {lines(report.issues).length > 0 && <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800"><p className="font-semibold">Outstanding issues</p><ul className="mt-1 list-disc pl-5">{lines(report.issues).map((issue, i) => <li key={i}>{issue}</li>)}</ul></div>}
          <div className="mt-5 space-y-4">{SECTIONS.map((section) => <div key={section.id}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{section.label}</p>
            <ul className="mt-2 space-y-1.5">{section.items.map(([id, label]) => {
              const check = report.checks[id];
              const look = STATUS_ICON[check?.status || 'unmarked'];
              return <li key={id} className="flex items-start gap-2.5 text-sm"><span title={look.label} className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${look.tone}`}><look.icon className="h-3 w-3" strokeWidth={3} /></span><span className={check?.status === 'na' ? 'text-slate-400' : ''}>{label}{check?.note && <span className="mt-0.5 block text-xs text-slate-500">{check.note}</span>}</span></li>;
            })}</ul>
          </div>)}</div>
        </>}
        {data && (dayTasks.length > 0 || dayReceived.length > 0 || dayMonthly.length > 0) && <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          {dayTasks.length > 0 && <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Ad hoc tasks finished</p><ul className="mt-2 space-y-1.5">{dayTasks.map((task) => <li key={task.id} className="flex items-start gap-2.5 text-sm"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#9b8cff] text-white"><Check className="h-3 w-3" strokeWidth={3} /></span><span>{task.title}<span className="block text-xs text-slate-500">Added {dmy(task.createdOn)}</span></span></li>)}</ul></div>}
          {dayReceived.length > 0 && <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Deliveries received</p><ul className="mt-2 space-y-1 text-sm">{dayReceived.map((item, i) => <li key={i}>{item.supplier}: {item.name}{item.qty ? ` - ${item.qty}` : ''}</li>)}</ul></div>}
          {dayMonthly.length > 0 && <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Monthly tasks done</p><ul className="mt-2 space-y-1 text-sm">{dayMonthly.map((item) => <li key={item.taskId}>{MONTHLY.find((task) => task.id === item.taskId)?.label(monthName(`${month}-01`), monthName(`${month}-01`, -1)) || item.taskId}</li>)}</ul></div>}
        </div>}
      </section>
    </div>
  </div>;
}

// Quick Contact: the branch's phone list (suppliers, pharmacies, services) with one-tap
// WhatsApp and Call. Read once when the tab opens; the Clinical Admin keeps it up to date.
type Contact = { id: string; name: string; phone: string; note: string; group: string };
const waNumber = (phone: string) => { const digits = phone.replace(/\D/g, ''); return digits.startsWith('0') ? `6${digits}` : digits; };
const initials = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
const CONTACT_TONES = ['bg-[#e9f6fb] text-[#0b587b]', 'bg-emerald-50 text-emerald-700', 'bg-amber-50 text-amber-700', 'bg-rose-50 text-rose-700', 'bg-violet-50 text-violet-700'];

function QuickContacts({ branch, onError }: { key?: string; branch: string; onError: (message: string) => void }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    officeFetch(`${API}&action=contacts&branch=${encodeURIComponent(branch)}`).then((response) => response.json()).then((result) => setContacts(result.contacts))
      .catch((cause) => { setContacts([]); onError(cause instanceof Error ? cause.message : 'Unable to load contacts.'); });
  }, [branch]);
  const store = async (next: Contact[]) => {
    setSaving(true);
    try { setContacts((await (await officeFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save_contacts', branch, contacts: next }) })).json()).contacts); return true; }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); return false; }
    finally { setSaving(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !contacts) return;
    const item = { ...draft, name: draft.name.trim(), phone: draft.phone.trim(), note: draft.note.trim() };
    const exists = contacts.some((contact) => contact.id === item.id);
    const next = (exists ? contacts.map((contact) => contact.id === item.id ? item : contact) : [...contacts, item]).sort((a, b) => a.name.localeCompare(b.name));
    if (await store(next)) setDraft(null);
  };
  const remove = async (contact: Contact) => { if (contacts && window.confirm(`Delete ${contact.name}?`)) await store(contacts.filter((item) => item.id !== contact.id)); };

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (contacts || []).filter((contact) => words.every((word) => `${contact.name} ${contact.note} ${contact.phone.replace(/\D/g, '')}`.toLowerCase().includes(word)));
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <Hero branch={branch} title="Quick contact" text="Suppliers, pharmacies and services. Tap WhatsApp or Call to reach them straight away." action={<button onClick={() => setDraft({ id: crypto.randomUUID(), name: '', phone: '', note: '', group: '' })} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#0b3d59] hover:bg-[#e9f6fb]"><Plus className="h-4 w-4" />Add contact</button>} />
    <section className="flex items-center gap-2 rounded-2xl bg-white p-4 shadow-sm"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && setQuery('')} placeholder="Search name, item or number, e.g. Pharmaniaga, dengue, vaccine…" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-slate-400" />{query && <button onClick={() => setQuery('')} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Clear search"><X className="h-4 w-4" /></button>}<span className="shrink-0 text-xs text-slate-400">{contacts ? `${shown.length} of ${contacts.length}` : ''}</span></section>
    {!contacts ? <p className="text-sm text-slate-500">Loading…</p> : !contacts.length ? <p className={`${card} text-sm text-slate-500`}>No contacts yet. Press Add contact to add one.</p> : !shown.length ? <p className={`${card} text-sm text-slate-500`}>No contacts match “{query.trim()}”.</p>
      : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{shown.map((contact) => <article key={contact.id} className="group flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_8px_25px_rgba(20,35,59,0.05)]">
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${CONTACT_TONES[[...contact.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % CONTACT_TONES.length]}`}>{initials(contact.name)}</span>
          <div className="min-w-0 flex-1"><p className="truncate font-semibold leading-snug" title={contact.name}>{contact.name}</p>{contact.note && <p className="truncate text-xs text-[#0b9aca]">{contact.note}</p>}<p className="mt-0.5 font-mono text-xs text-slate-500">{contact.phone}</p></div>
          <div className="-mr-1 -mt-1 flex shrink-0 opacity-60 transition group-hover:opacity-100"><button onClick={() => setDraft(contact)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]" aria-label={`Edit ${contact.name}`}><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => void remove(contact)} disabled={saving} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${contact.name}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2"><a href={`https://wa.me/${waNumber(contact.phone)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25d366] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1ebe5a]"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a><a href={`tel:+${waNumber(contact.phone)}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><Phone className="h-3.5 w-3.5" />Call</a></div>
      </article>)}</div>}
    {draft && <Modal title={contacts?.some((contact) => contact.id === draft.id) ? 'Edit contact' : 'New contact'} onClose={() => setDraft(null)}>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Name</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Pharmaniaga" className={input} /></label>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Phone</span><input required inputMode="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="e.g. 012-345 6789" className={`${input} font-mono`} /></label>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">What for <span className="font-normal text-slate-400">(optional)</span></span><input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="e.g. Dengue test, Order, Payment" className={input} /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button disabled={saving} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save contact'}</button></div>
      </form>
    </Modal>}
  </div>;
}

// The Clinical Admin at each branch, greeted by name on Home.
const ADMIN_NAMES: Record<string, string> = { Kajang: 'Izzah', 'Seri Kembangan': 'Amirah' };
const BRANCH_CODES: Record<string, string> = { Kajang: 'KJ', 'Seri Kembangan': 'SK' };

function HomeView({ day, overseer, onNavigate, onOpenBranch }: { day: Day | null; overseer: boolean; onNavigate: (view: View) => void; onOpenBranch: (branch: string) => void }) {
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
  return <div className="mx-auto max-w-[1500px] space-y-8">
    {/* Same layout as the CA office's Home: greeting on the left, date and a quote on the right. */}
    <section className="rounded-[30px] bg-[#0b3d59] px-7 py-9 text-white sm:px-10 lg:px-12">
      <div className="flex flex-col gap-7 md:flex-row md:items-start md:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Klinik ARA 24 Jam · Clinical Administration</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-[2.45rem]">{overseer ? 'Branch overview' : `Welcome, ${ADMIN_NAMES[day?.branch || ''] || `Clinical Admin ${day?.branch || ''}`}`}</h2><p className="mt-3 text-base text-[#bed2df]">{overseer ? 'Both branches at a glance.' : `${day?.branch || ''} clinic administration.`}</p></div>
        <div className="text-left md:text-right"><span className="inline-flex rounded-full bg-white/12 px-5 py-2.5 text-sm font-semibold text-[#d9e7ef]">{date}</span><p className="mt-4 text-sm italic leading-6 text-[#a9c1d0] md:ml-auto md:max-w-[360px]">“{homeQuote}”</p></div>
      </div>
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
  // 'all' shows the both-branch overview; a branch name shows the office as that branch's admin sees it.
  const [viewAs, setViewAs] = useState('all');
  const overseer = (branches?.length || 0) > 1 && viewAs === 'all';
  const [admin, setAdmin] = useState(false);
  const [links, setLinks] = useState<QuickLink[] | null>(null);
  // Panel list comes from the CA office's Panel Training; it is fetched only when the tab opens.
  // Viewing as Izzah or Amirah shows exactly what they see, so System Admin editing is off there.
  const canEdit = admin && viewAs === 'all';
  const panel = usePanelTraining(view === 'panel', canEdit);
  // Clinical Admin's own Print Forms list, separate from the CA office's.
  const printForms = usePrintForms(view === 'forms', 'clinical_forms');

  useEffect(() => {
    officeFetch(`${API}&action=branches`).then((response) => response.json()).then(({ branches: names, admin: isAdmin }) => { setBranches(names); setBranch(names[0] || ''); setAdmin(Boolean(isAdmin)); })
      .catch((cause) => setError(cause.message));
  }, []);
  const load = async () => {
    if (!branch) return;
    try { setDay(await (await officeFetch(`${API}&action=day&branch=${encodeURIComponent(branch)}`)).json()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load.'); }
  };
  useEffect(() => { setDay(null); void load(); }, [branch]);

  // Links are read once, the first time the tab opens.
  useEffect(() => {
    if (view !== 'links' || links) return;
    officeFetch(`${API}&action=links`).then((response) => response.json()).then((result) => setLinks(result.links ?? DEFAULT_LINKS)).catch((cause) => { setLinks(DEFAULT_LINKS); setError(cause.message); });
  }, [view, links]);
  const saveLinks = async (next: QuickLink[]) => {
    try {
      const result = await (await officeFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save_links', links: next }) })).json();
      setLinks(result.links); return true;
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save links.'); return false; }
  };

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
    report: day.tasks.filter((task) => !task.doneOn).length,
  } : {}, [day]);

  return <div className="min-h-screen bg-[#f7f8fb] text-[#14233b]">
    <Sidebar view={view} open={menuOpen} branches={branches || []} branch={branch} viewAs={viewAs} counts={counts} onViewAs={(name) => { setViewAs(name); if (name !== 'all') setBranch(name); }} onClose={() => setMenuOpen(false)} onNavigate={navigate} onLogout={() => void logout()} />
    <div className="min-h-screen lg:pl-[300px]">
      <header className="sticky top-0 z-30 border-b border-[#dce4ed] bg-[#f7f8fb]/90 backdrop-blur-2xl lg:hidden">
        <div className="flex h-[76px] items-center gap-4 px-4 sm:px-6">
          <button className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce4ed] bg-white" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#18bff2]">Clinical Admin · {branch}</p><h1 className="truncate text-xl font-semibold tracking-tight">{TITLES[view]}</h1></div>
        </div>
      </header>
      <main className="p-4 sm:p-6 lg:p-[38px]">
        {branches && branches.length === 0 && <Banner tone="error">This account is not linked to a branch yet. Ask System Admin to link it to Kajang or Seri Kembangan.</Banner>}
        {(branches?.length || 0) > 1 && viewAs !== 'all' && <div className="mx-auto mb-4 flex max-w-[1500px] flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>Viewing as <strong>{ADMIN_NAMES[viewAs] || viewAs}</strong> ({viewAs}): this is what they see. System Admin editing is off here.</span><button onClick={() => setViewAs('all')} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-100">Back to All</button></div>}
        {error && <div className="mx-auto mb-4 max-w-[1500px] cursor-pointer" onClick={() => setError('')}><Banner tone="error">{error}</Banner></div>}
        {view === 'home' && <HomeView day={day} overseer={overseer} onNavigate={navigate} onOpenBranch={(name) => { setViewAs(name); setBranch(name); navigate('report'); }} />}
        {view !== 'home' && view !== 'incentives' && view !== 'history' && view !== 'contacts' && view !== 'forms' && view !== 'panel' && view !== 'links' && !day && branch && <p className="text-sm text-slate-500">Loading…</p>}
        {/* Stays mounted while other tabs are open so unsaved ticks are kept; keyed so a new branch or day starts from the server's copy. */}
        {day && <div key={`${day.branch}-${day.date}`} className={view === 'report' ? '' : 'hidden'}><DailyReport day={day} reload={load} onError={onError} onPatch={(change) => setDay((current) => current && change(current))} /></div>}
        {view === 'orders' && day && <Orders day={day} reload={load} onError={onError} />}
        {view === 'bookings' && day && <Bookings day={day} reload={load} onError={onError} />}
        {view === 'contacts' && branch && <QuickContacts key={branch} branch={branch} onError={onError} />}
        {view === 'history' && branch && <ClinicalHistory key={branch} branch={branch} onError={onError} />}
        {view === 'forms' && <PrintForms state={printForms} canEdit={canEdit} vouchersShown={false} eyebrow="Clinical Administration" />}
        {view === 'panel' && <PanelTrainingView training={panel} canEdit={canEdit} title="Panel" />}
        {view === 'links' && (links ? <LinksView links={links} canEdit={canEdit} onSave={saveLinks} /> : <p className="text-sm text-slate-500">Loading…</p>)}
        {view === 'incentives' && branch && <ClinicalIncentives key={branch} branch={branch} branches={branches || []} onError={onError} />}
      </main>
    </div>
  </div>;
}
