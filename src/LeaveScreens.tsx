import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { CalendarCheck, CalendarDays, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, History, LayoutGrid } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';
import { LEAVE_GROUPS } from './lib/leaveTypes';
import { ATTACHMENT_REQUIRED_FOR, AttachmentLinks, AttachmentPicker, Attached } from './LeaveAttachments';

// Leave inside Individual Sign In: Summary (balance), Apply Leave, History, and Approve (only for staff
// who are someone's leave approver). Days are counted on the applicant's own working days.
type Balance = { group: string; year: number; eligible: number; broughtForward: number; total: number; taken: number; balance: number; bfExpiry: string | null; asOf: string };
type Option = { code: string; name: string; group: string; half: boolean };
type Request = { attachments?: Attached[]; id: string; type: string; typeName: string; group: string; start: string; end: string; half: 'AM' | 'PM' | null; days: number; reason: string; status: 'pending' | 'supervisor_approved' | 'approved' | 'rejected' | 'cancelled'; note: string; supervisorNote?: string; twoLevel?: boolean; stage?: '' | 'supervisor' | 'backup' | 'final'; backupApprover?: string; alsoOff?: string[]; createdAt: string; applicant?: string; code?: string; balance?: number | null };

// One-minute link to a file for this signed-in staff member (the one who applied, or their approver).
const staffFileUrl = async (id: string) => (await assessmentFetch(`action=leave_attachment_url&id=${encodeURIComponent(id)}`)).url as string;
const uploadStaffFile = async (name: string, data: string): Promise<Attached> => (await assessmentFetch('action=leave_attachment_upload', { method: 'POST', body: JSON.stringify({ fileName: name, data }) })).file;

const dmy = (date: string | null | undefined) => date ? date.split('-').reverse().join('/') : '—';
const range = (r: { start: string; end: string; half: string | null }) => `${dmy(r.start)}${r.end !== r.start ? ` – ${dmy(r.end)}` : ''}${r.half ? ` (${r.half})` : ''}`;
const days = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const addDays = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
// As in Infotech: leave is applied for at least 1 day before the leave date, except medical, hospitalization and emergency leave.
const APPLY_AFTER_THE_DAY = new Set(['ML', 'HOSP', 'EL', 'MATN', 'ULEL']);
const earliestFor = (type: string) => APPLY_AFTER_THE_DAY.has(type) ? addDays(todayKey(), -30) : addDays(todayKey(), 1);
const field = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';
const card = 'min-w-0 rounded-[22px] border border-black/[0.045] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.025)] sm:p-6';
const STATUS: Record<Request['status'], string> = { pending: 'bg-amber-50 text-amber-700', supervisor_approved: 'bg-sky-50 text-sky-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', cancelled: 'bg-slate-100 text-slate-500' };
const STATUS_LABEL: Record<Request['status'], string> = { pending: 'Pending', supervisor_approved: 'Awaiting final approval', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };

// Same rule as the server: a date on the person's duty roster counts when the roster says they work it; any
// other date counts when its weekday is one of their working weekdays (0 = Sunday ... 6 = Saturday).
function countDays(start: string, end: string, half: string | null, workDays: number[], roster: Record<string, boolean> = {}) {
  if (!start || !end || end < start) return 0;
  let count = 0;
  for (let day = new Date(`${start}T00:00:00Z`); day <= new Date(`${end}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) { const iso = day.toISOString().slice(0, 10); if (iso in roster ? roster[iso] : workDays.includes(day.getUTCDay())) count++; }
  return half ? (start === end && count ? 0.5 : 0) : count;
}

function Notice({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'rose' | 'amber' | 'emerald' }) {
  const tones = { slate: 'bg-white text-slate-600', rose: 'bg-rose-50 text-rose-700', amber: 'bg-amber-50 text-amber-800', emerald: 'bg-emerald-50 text-emerald-700' };
  return <p className={`rounded-2xl p-4 text-sm leading-6 ${tones[tone]}`}>{children}</p>;
}

function Summary() {
  const [state, setState] = useState<{ linked: boolean; balances: Balance[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { assessmentFetch('action=my_leave').then((result) => setState({ linked: result.linked, balances: result.balances || [] })).catch((cause: Error) => setError(cause.message)); }, []);
  if (error) return <Notice tone="rose">{error}</Notice>;
  if (!state) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!state.linked) return <Notice>Your sign-in is not linked to your staff record yet. Ask HR to link it.</Notice>;
  if (!state.balances.length) return <Notice>No leave balance has been recorded for you yet.</Notice>;
  return <>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">{state.balances.map((row) => {
      const name = LEAVE_GROUPS.find((group) => group.code === row.group)?.name || row.group;
      const eligible = row.group === 'AL' && row.total ? row.total : row.eligible;
      const used = eligible ? Math.min(100, (row.taken / eligible) * 100) : 0;
      const hero = row.group === 'AL';
      return <article key={row.group} className={hero ? 'relative col-span-2 min-w-0 overflow-hidden rounded-[24px] bg-gradient-to-b from-[#0f5478] via-[#0b3d59] to-[#082c42] p-5 text-white shadow-[0_18px_40px_rgba(11,48,70,0.25)] md:col-span-3 md:p-7' : `${card} min-w-0`}>
        {hero && <i className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10" />}
        <h3 className={`relative text-sm font-semibold uppercase leading-tight ${hero ? 'tracking-[0.14em] text-white/80' : 'text-slate-600'}`}>{name}</h3>
        <div className="relative mt-3 flex justify-between gap-2 text-center">{([['Eligible', eligible], ['Taken', row.taken], ['Balance', row.balance]] as const).map(([label, value]) => <div key={label} className="min-w-0"><div className={`text-[11px] ${hero ? 'text-white/70' : 'text-slate-400'}`}>{label}</div><div className={`font-semibold leading-tight ${hero ? 'text-3xl md:text-4xl' : 'text-lg text-[#0b587b]'}`}>{days(value)}</div></div>)}</div>
        <div className={`relative mt-4 h-1.5 overflow-hidden rounded-full ${hero ? 'bg-white/20' : 'bg-slate-100'}`}><div className="h-full rounded-full bg-[#f5b400]" style={{ width: `${used}%` }} /></div>
        {row.group === 'AL' && row.broughtForward > 0 && <p className={`relative mt-2 text-[11px] leading-4 ${hero ? 'text-white/70' : 'text-slate-400'}`}>Includes {days(row.broughtForward)} brought forward{row.bfExpiry ? `, valid until ${dmy(row.bfExpiry)}` : ''}.</p>}
      </article>;
    })}</div>
    <p className="mt-4 text-xs leading-5 text-slate-400">Balance as recorded on {dmy(state.balances[0].asOf)}. Leave that is approved here is taken off it.</p>
  </>;
}

function Apply({ onDone }: { onDone: () => void }) {
  const [options, setOptions] = useState<{ approver: string; backupApprover?: string; finalApprover?: string; workDays: number[]; roster?: Record<string, boolean>; types: Option[] } | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [type, setType] = useState('AL');
  const [start, setStart] = useState(earliestFor('AL'));
  const [end, setEnd] = useState(earliestFor('AL'));
  const [half, setHalf] = useState<'' | 'AM' | 'PM'>('');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<Attached[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState<Request | null>(null);

  useEffect(() => {
    assessmentFetch('action=leave_options').then(setOptions).catch((cause: Error) => setError(cause.message));
    assessmentFetch('action=my_leave').then((result) => setBalances(result.balances || [])).catch(() => undefined);
  }, []);
  if (error && !options) return <Notice tone="rose">{error}</Notice>;
  if (!options) return <p className="text-sm text-slate-500">Loading…</p>;
  if (sent) return <div className={`${card} text-center`}><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><h3 className="mt-3 text-lg font-semibold">Request sent</h3><p className="mt-1 text-sm text-slate-500">{sent.typeName}, {range(sent)} · {days(sent.days)} day{sent.days === 1 ? '' : 's'}. {options.approver ? `${options.approver} will approve it.` : ''}</p><button onClick={onDone} className="mt-4 rounded-xl bg-[#0b587b] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a4c6a]">See my history</button></div>;

  const chosen = options.types.find((item) => item.code === type);
  const half1 = half && chosen?.half && start === end ? half : '';
  const total = countDays(start, end, half1 || null, options.workDays, options.roster);
  const group = balances.find((row) => row.group === chosen?.group);
  const left = group ? group.balance : null;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSaving(true);
    try { const result = await assessmentFetch('action=leave_apply', { method: 'POST', body: JSON.stringify({ type, start, end, half: half1, reason, attachmentIds: files.map((file) => file.id) }) }); setSent(result.request); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send the request.'); }
    setSaving(false);
  };
  return <form onSubmit={submit} className={`${card} space-y-4`}>
    {!options.approver && <Notice tone="amber">HR has not set who approves your leave yet, so you cannot apply for now. Ask HR.</Notice>}
    <label className="block text-sm font-semibold text-slate-600">Leave type<select value={type} onChange={(event) => { const next = event.target.value, earliest = earliestFor(next); setType(next); setHalf(''); if (start < earliest) { setStart(earliest); setEnd((current) => current < earliest ? earliest : current); } }} className={`${field} mt-1.5`}>{options.types.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm font-semibold text-slate-600">From<input type="date" required min={earliestFor(type)} value={start} onChange={(event) => { setStart(event.target.value); if (end < event.target.value) setEnd(event.target.value); }} className={`${field} mt-1.5`} /></label>
      <label className="block text-sm font-semibold text-slate-600">To<input type="date" required min={start} value={end} onChange={(event) => setEnd(event.target.value)} className={`${field} mt-1.5`} /></label>
    </div>
    <p className="-mt-2 text-xs text-slate-400">{APPLY_AFTER_THE_DAY.has(type) ? 'You can apply for this after the day.' : 'Apply at least 1 day before the leave date. Medical, hospitalization and emergency leave can be applied for after the day.'}</p>
    {chosen?.half && start === end && <div><p className="text-sm font-semibold text-slate-600">Day</p><div className="mt-1.5 inline-flex rounded-xl bg-[#f1f5f7] p-1 ring-1 ring-[#dce4ed]">{([['', 'Full day'], ['AM', 'Morning'], ['PM', 'Afternoon']] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setHalf(value)} className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${half === value ? 'bg-[#0b587b] text-white shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div></div>}
    <div className="rounded-xl bg-[#f4fafd] p-3.5 text-sm"><strong className="text-lg text-[#0b587b]">{days(total)}</strong> <span className="text-slate-600">working day{total === 1 ? '' : 's'}</span>{left !== null && <span className="text-slate-500"> · balance {days(left)}</span>}{total === 0 && <p className="mt-1 text-xs text-amber-700">There is no working day in those dates (rest days and public holidays are not counted).</p>}{left !== null && total > left && type !== 'UL' && <p className="mt-1 text-xs text-amber-700">This is more than your balance. Your approver will see that.</p>}</div>
    <label className="block text-sm font-semibold text-slate-600">Reason<textarea required minLength={2} rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10" /></label>
    <AttachmentPicker files={files} onChange={setFiles} upload={uploadStaffFile} required={ATTACHMENT_REQUIRED_FOR.has(type)} onError={setError} label={type === 'ML' ? 'Medical certificate' : 'Attachment'} />
    {options.approver && <p className="text-xs text-slate-500">Goes to <strong className="text-slate-700">{options.approver}</strong>{options.backupApprover ? <> (backup: <strong className="text-slate-700">{options.backupApprover}</strong>)</> : null}{options.finalApprover ? <>, then <strong className="text-slate-700">{options.finalApprover}</strong> for final approval</> : ' for approval'}.</p>}
    {error && <Notice tone="rose">{error}</Notice>}
    <button disabled={saving || !options.approver || total === 0 || (ATTACHMENT_REQUIRED_FOR.has(type) && !files.length)} className="h-12 w-full rounded-xl bg-[#0b587b] text-sm font-bold text-white transition hover:bg-[#0a4c6a] disabled:opacity-50">{saving ? 'Sending…' : 'Send request'}</button>
  </form>;
}

function HistoryList() {
  const [list, setList] = useState<Request[] | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const historyTop = useRef<HTMLDivElement>(null);
  const load = () => assessmentFetch('action=leave_history').then((result) => setList(result.requests)).catch((cause: Error) => setError(cause.message));
  useEffect(() => { void load(); }, []);
  const cancel = async (request: Request) => {
    if (!window.confirm(`Cancel your ${request.typeName} request for ${range(request)}?`)) return;
    try { await assessmentFetch('action=leave_cancel', { method: 'POST', body: JSON.stringify({ id: request.id }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to cancel.'); }
  };
  if (!list) return error ? <Notice tone="rose">{error}</Notice> : <p className="text-sm text-slate-500">Loading…</p>;
  if (!list.length) return <Notice>You have not applied for any leave yet.</Notice>;
  const pageSize = 10, totalPages = Math.ceil(list.length / pageSize), currentPage = Math.min(page, totalPages);
  const first = (currentPage - 1) * pageSize, visible = list.slice(first, first + pageSize);
  const years = [...new Set(visible.map((request) => request.start.slice(0, 4)))];
  const changePage = (next: number) => {
    setPage(Math.max(1, Math.min(totalPages, next)));
    historyTop.current?.focus({ preventScroll: true });
    historyTop.current?.scrollIntoView({ block: 'start' });
  };
  return <div ref={historyTop} tabIndex={-1} className="scroll-mt-5 space-y-5 outline-none" aria-label="Leave history">{error && <Notice tone="rose">{error}</Notice>}<p className="text-xs text-slate-500" aria-live="polite">Showing {first + 1}–{first + visible.length} of {list.length} requests · Page {currentPage} of {totalPages}</p>{years.map((year) => <section key={year}>
    <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{year}</h3>
    <ul className="space-y-2.5">{visible.filter((request) => request.start.startsWith(year)).map((request) => <li key={request.id} className={`${card} flex flex-wrap items-start gap-3`}>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{request.typeName}</p><p className="mt-0.5 text-sm text-[#0b587b]">{range(request)} · {days(request.days)} day{request.days === 1 ? '' : 's'}</p>{request.reason && <p className="mt-1 text-xs text-slate-500">{request.reason}</p>}<AttachmentLinks items={request.attachments} getUrl={staffFileUrl} onError={setError} />{request.supervisorNote && <p className="mt-1 text-xs text-slate-600">Supervisor: {request.supervisorNote}</p>}{request.note && <p className="mt-1 text-xs text-slate-600">{request.twoLevel ? 'Final approver' : 'Approver'}: {request.note}</p>}</div>
      <div className="flex flex-col items-end gap-2"><span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS[request.status]}`}>{STATUS_LABEL[request.status]}</span>{(request.status === 'pending' || request.status === 'supervisor_approved') && <button onClick={() => void cancel(request)} className="text-xs font-semibold text-rose-600 hover:underline">Cancel</button>}</div>
    </li>)}</ul>
  </section>)}{totalPages > 1 && <nav aria-label="Leave history pages" className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
    <button disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>
    <span className="text-xs text-slate-500">{currentPage} / {totalPages}</span>
    <button disabled={currentPage === totalPages} onClick={() => changePage(currentPage + 1)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button>
  </nav>}</div>;
}

function Approvals() {
  const [state, setState] = useState<{ pending: Request[]; recent: Request[] } | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const load = () => assessmentFetch('action=leave_approvals').then(setState).catch((cause: Error) => setError(cause.message));
  useEffect(() => { void load(); }, []);
  const decide = async (request: Request, decision: 'approve' | 'reject') => {
    setBusy(request.id); setError('');
    try { await assessmentFetch('action=leave_decide', { method: 'POST', body: JSON.stringify({ id: request.id, decision, note: notes[request.id] || '', ...(decision === 'approve' && adjust[request.id] ? { days: Number(adjust[request.id]) } : {}) }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setBusy('');
  };
  if (!state) return error ? <Notice tone="rose">{error}</Notice> : <p className="text-sm text-slate-500">Loading…</p>;
  return <div className="space-y-6">{error && <Notice tone="rose">{error}</Notice>}
    {!state.pending.length ? <Notice>You have no pending leave requests to approve.</Notice> : <ul className="space-y-3">{state.pending.map((request) => <li key={request.id} className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{request.applicant}</p><p className="text-xs text-slate-400">{request.code}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">{request.stage === 'final' ? 'Final approval' : request.stage === 'backup' ? 'Backup officer · supervisor level' : request.twoLevel ? 'Supervisor approval' : 'Pending'}</span></div>
      {request.stage === 'final' && request.supervisorNote && <p className="mt-1 text-xs text-slate-500">Supervisor said: {request.supervisorNote}</p>}
      <p className="mt-2 text-sm"><strong>{request.typeName}</strong> · <span className="text-[#0b587b]">{range(request)}</span> · {days(request.days)} day{request.days === 1 ? '' : 's'}</p>
      {request.reason && <p className="mt-1 text-sm text-slate-600">“{request.reason}”</p>}
      <AttachmentLinks items={request.attachments} getUrl={staffFileUrl} onError={setError} />
      {request.balance !== null && request.balance !== undefined && <p className={`mt-1 text-xs ${request.balance < request.days && request.type !== 'UL' ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>Balance now {days(request.balance)}{request.type !== 'UL' ? ` · ${days(request.balance - request.days)} after this leave` : ''}{request.balance < request.days && request.type !== 'UL' ? ': this request is more than the balance' : ''}</p>}
      {request.alsoOff && request.alsoOff.length > 0 && <p className="mt-1 text-xs text-amber-700">Also off on these dates: {request.alsoOff.join(', ')}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]"><input value={notes[request.id] || ''} onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })} placeholder="Note (optional)" maxLength={300} className={field} /><input inputMode="decimal" value={adjust[request.id] || ''} onChange={(event) => setAdjust({ ...adjust, [request.id]: event.target.value.replace(/[^\d.]/g, '') })} placeholder={`Days: ${days(request.days)}`} aria-label="Change the number of days" className={field} /></div>
      <div className="mt-3 flex gap-2"><button disabled={busy === request.id} onClick={() => void decide(request, 'approve')} className="h-11 flex-1 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button><button disabled={busy === request.id} onClick={() => void decide(request, 'reject')} className="h-11 flex-1 rounded-xl border border-rose-200 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reject</button></div>
    </li>)}</ul>}
    {state.recent.length > 0 && <section><h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Decided recently</h3><ul className="space-y-2">{state.recent.map((request) => <li key={request.id} className={`${card} flex items-center gap-3`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{request.applicant}</p><p className="truncate text-xs text-slate-500">{request.typeName} · {range(request)} · {days(request.days)}d</p></div><span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS[request.status]}`}>{STATUS_LABEL[request.status]}</span></li>)}</ul></section>}
  </div>;
}

type CalendarItem = { name: string; code: string; department: string; company: string; type: string; start: string; end: string; half: 'AM' | 'PM' | null; days: number };
function LeaveCalendar() {
  const today = todayKey();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(() => Number(today.slice(8, 10)));
  const [data, setData] = useState<{ group: string; scope: 'companies' | 'department' | 'self'; notice?: string; items: CalendarItem[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    assessmentFetch(`action=leave_calendar&month=${month}`).then((result) => {
      if (active) setData(result);
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [month]);
  const date = new Date(`${month}-01T00:00:00`), year = date.getFullYear(), monthIndex = date.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate(), offset = date.getDay();
  const keyFor = (day: number) => `${month}-${String(day).padStart(2, '0')}`;
  const selectedDate = keyFor(selectedDay);
  const onDay = (day: number) => (data?.items || []).filter((item) => item.start <= keyFor(day) && item.end >= keyFor(day));
  const selectedItems = onDay(selectedDay);
  const departmentLabel = (item: CalendarItem) => data?.scope === 'companies' ? `${item.company} · ${item.department || 'No department'}` : item.department || 'Your leave';
  const departments = [...new Set(selectedItems.map(departmentLabel))].sort();
  const moveMonth = (by: number) => {
    const nextDate = new Date(year, monthIndex + by, 1);
    const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    setMonth(nextMonth); setSelectedDay(nextMonth === today.slice(0, 7) ? Number(today.slice(8, 10)) : 1);
  };
  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-6">
    {error && <div className="lg:col-span-2"><Notice tone="rose">{error}</Notice></div>}
    {data?.notice && <div className="lg:col-span-2"><Notice tone="amber">{data.notice}</Notice></div>}
    <section className={card}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <button onClick={() => moveMonth(-1)} aria-label="Previous month" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600"><ChevronLeft className="h-5 w-5" /></button>
        <div className="min-w-0 text-center"><h3 className="text-lg font-semibold tracking-tight">{date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h3><p className="mt-1 text-[11px] leading-4 text-slate-500">{data?.group || 'Approved leave calendar'}</p></div>
        <button onClick={() => moveMonth(1)} aria-label="Next month" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="pb-2 text-center text-[10px] font-bold uppercase text-slate-400">{day}</div>)}
        {Array.from({ length: offset }, (_, index) => <div key={`empty-${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1, count = onDay(day).length, selected = selectedDay === day, isToday = keyFor(day) === today;
          return <button key={day} onClick={() => setSelectedDay(day)} aria-pressed={selected} aria-label={`${day} ${date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}${count ? `, ${count} on leave` : ''}${isToday ? ', today' : ''}`} className={`relative flex min-h-11 flex-col items-center justify-center rounded-xl border text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b587b] sm:min-h-14 ${selected ? 'border-[#0b587b] bg-[#0b587b] text-white shadow-sm' : isToday ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : count ? 'border-transparent bg-[#f0f6fa] text-[#0b587b]' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
            {day}{count > 0 && <span aria-hidden="true" className={`mt-1 h-1 w-1 rounded-full ${selected || isToday ? 'bg-white' : 'bg-[#0b587b]'}`} />}
          </button>;
        })}
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">Select a date to see who is on leave.</p>
    </section>
    <section className={`${card} space-y-4`} aria-live="polite" aria-label={`Leave on ${dmy(selectedDate)}`}>
      <div className="flex items-center justify-between gap-3"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">On leave</p><h4 className="text-sm font-semibold text-slate-800">{new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h4></div><span className="grid h-8 min-w-8 place-items-center rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-500">{selectedItems.length}</span></div>
      {!data && !error ? <p className="text-sm text-slate-400">Loading calendar…</p> : error ? <p className="text-sm text-slate-500">The leave list could not be loaded.</p> : selectedItems.length === 0 ? <p className="text-sm text-slate-500">No approved leave on this date.</p> : departments.map((department) => <div key={department}>
        <h5 className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">{department}</h5>
        <ul className="divide-y divide-slate-100">{selectedItems.filter((item) => departmentLabel(item) === department).map((item, index) => <li key={`${item.code}-${index}`} className="flex items-start justify-between gap-3 px-1 py-3">
          <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.type}{item.half && item.start === item.end ? ` · ${item.half}` : ''}</p></div>
          <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">Approved</span>
        </li>)}</ul>
      </div>)}
    </section>
  </div>;
}

export default function LeaveSection({ isApprover, initialTab = 'summary' }: { isApprover: boolean; initialTab?: 'summary' | 'calendar' }) {
  const [tab, setTab] = useState<'summary' | 'apply' | 'history' | 'calendar' | 'approve'>(initialTab);
  const tabs = [['summary', 'Summary', LayoutGrid], ['apply', 'Apply Leave', CalendarPlus], ['history', 'History', History], ['calendar', 'Calendar', CalendarDays], ...(isApprover ? [['approve', 'Approve', CalendarCheck] as const] : [])] as const;
  return <>
    <div role="group" aria-label="Leave views" className="mb-5 flex w-full min-w-0 gap-1 rounded-2xl bg-[#e9edf1] p-1 sm:mb-7 sm:max-w-2xl">{tabs.map(([id, label, Icon]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2.5 text-[10px] font-semibold transition focus-visible:outline-2 focus-visible:outline-[#0b587b] sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${tab === id ? 'bg-white text-[#14233b] shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}><Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} /><span>{label}</span></button>)}</div>
    {tab === 'summary' && <Summary />}
    {tab === 'apply' && <Apply onDone={() => setTab('history')} />}
    {tab === 'history' && <HistoryList />}
    {tab === 'calendar' && <LeaveCalendar />}
    {tab === 'approve' && isApprover && <Approvals />}
  </>;
}
