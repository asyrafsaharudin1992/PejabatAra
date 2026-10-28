import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { CalendarCheck, CalendarPlus, CheckCircle2, History, LayoutGrid } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';
import { LEAVE_GROUPS } from './lib/leaveTypes';

// Leave inside Individual Sign In: Summary (balance), Apply Leave, History, and Approve (only for staff
// who are someone's leave approver). Days are counted on the applicant's own working days.
type Balance = { group: string; year: number; eligible: number; broughtForward: number; total: number; taken: number; balance: number; bfExpiry: string | null; asOf: string };
type Option = { code: string; name: string; group: string; half: boolean };
type Request = { id: string; type: string; typeName: string; group: string; start: string; end: string; half: 'AM' | 'PM' | null; days: number; reason: string; status: 'pending' | 'supervisor_approved' | 'approved' | 'rejected' | 'cancelled'; note: string; supervisorNote?: string; twoLevel?: boolean; stage?: '' | 'supervisor' | 'final'; createdAt: string; applicant?: string; code?: string; balance?: number | null };

const dmy = (date: string | null | undefined) => date ? date.split('-').reverse().join('/') : '—';
const range = (r: { start: string; end: string; half: string | null }) => `${dmy(r.start)}${r.end !== r.start ? ` – ${dmy(r.end)}` : ''}${r.half ? ` (${r.half})` : ''}`;
const days = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const field = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';
const card = 'rounded-2xl bg-white p-4 shadow-[0_8px_25px_rgba(20,35,59,0.06)] sm:p-5';
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
      return <article key={row.group} className={`${card} min-w-0`}>
        <h3 className="text-sm font-semibold uppercase leading-tight text-slate-600">{name}</h3>
        <div className="mt-3 flex justify-between gap-2 text-center">{([['Eligible', eligible], ['Taken', row.taken], ['Balance', row.balance]] as const).map(([label, value]) => <div key={label} className="min-w-0"><div className="text-[11px] text-slate-400">{label}</div><div className="text-lg font-semibold leading-tight text-[#2a5ea8]">{days(value)}</div></div>)}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#f5b400]" style={{ width: `${used}%` }} /></div>
        {row.group === 'AL' && row.broughtForward > 0 && <p className="mt-2 text-[10px] leading-4 text-slate-400">Includes {days(row.broughtForward)} brought forward{row.bfExpiry ? `, valid until ${dmy(row.bfExpiry)}` : ''}.</p>}
      </article>;
    })}</div>
    <p className="mt-4 text-xs leading-5 text-slate-400">Balance as recorded on {dmy(state.balances[0].asOf)}. Leave that is approved here is taken off it.</p>
  </>;
}

function Apply({ onDone }: { onDone: () => void }) {
  const [options, setOptions] = useState<{ approver: string; finalApprover?: string; workDays: number[]; roster?: Record<string, boolean>; types: Option[] } | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [type, setType] = useState('AL');
  const [start, setStart] = useState(todayKey());
  const [end, setEnd] = useState(todayKey());
  const [half, setHalf] = useState<'' | 'AM' | 'PM'>('');
  const [reason, setReason] = useState('');
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
    try { const result = await assessmentFetch('action=leave_apply', { method: 'POST', body: JSON.stringify({ type, start, end, half: half1, reason }) }); setSent(result.request); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send the request.'); }
    setSaving(false);
  };
  return <form onSubmit={submit} className={`${card} space-y-4`}>
    {!options.approver && <Notice tone="amber">HR has not set who approves your leave yet, so you cannot apply for now. Ask HR.</Notice>}
    <label className="block text-sm font-semibold text-slate-600">Leave type<select value={type} onChange={(event) => { setType(event.target.value); setHalf(''); }} className={`${field} mt-1.5`}>{options.types.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm font-semibold text-slate-600">From<input type="date" required min={todayKey()} value={start} onChange={(event) => { setStart(event.target.value); if (end < event.target.value) setEnd(event.target.value); }} className={`${field} mt-1.5`} /></label>
      <label className="block text-sm font-semibold text-slate-600">To<input type="date" required min={start} value={end} onChange={(event) => setEnd(event.target.value)} className={`${field} mt-1.5`} /></label>
    </div>
    {chosen?.half && start === end && <div><p className="text-sm font-semibold text-slate-600">Day</p><div className="mt-1.5 inline-flex rounded-xl bg-[#f1f5f7] p-1 ring-1 ring-[#dce4ed]">{([['', 'Full day'], ['AM', 'Morning'], ['PM', 'Afternoon']] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setHalf(value)} className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${half === value ? 'bg-[#0b587b] text-white shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div></div>}
    <div className="rounded-xl bg-[#f4fafd] p-3.5 text-sm"><strong className="text-lg text-[#0b587b]">{days(total)}</strong> <span className="text-slate-600">working day{total === 1 ? '' : 's'}</span>{left !== null && <span className="text-slate-500"> · balance {days(left)}</span>}{total === 0 && <p className="mt-1 text-xs text-amber-700">There is no working day in those dates (rest days are not counted).</p>}{left !== null && total > left && type !== 'UL' && <p className="mt-1 text-xs text-amber-700">This is more than your balance. Your approver will see that.</p>}</div>
    <label className="block text-sm font-semibold text-slate-600">Reason (optional)<textarea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10" /></label>
    {options.approver && <p className="text-xs text-slate-500">Goes to <strong className="text-slate-700">{options.approver}</strong>{options.finalApprover ? <>, then <strong className="text-slate-700">{options.finalApprover}</strong> for final approval</> : ' for approval'}.</p>}
    {error && <Notice tone="rose">{error}</Notice>}
    <button disabled={saving || !options.approver || total === 0} className="h-12 w-full rounded-xl bg-[#0b587b] text-sm font-bold text-white transition hover:bg-[#0a4c6a] disabled:opacity-50">{saving ? 'Sending…' : 'Send request'}</button>
  </form>;
}

function HistoryList() {
  const [list, setList] = useState<Request[] | null>(null);
  const [error, setError] = useState('');
  const load = () => assessmentFetch('action=leave_history').then((result) => setList(result.requests)).catch((cause: Error) => setError(cause.message));
  useEffect(() => { void load(); }, []);
  const cancel = async (request: Request) => {
    if (!window.confirm(`Cancel your ${request.typeName} request for ${range(request)}?`)) return;
    try { await assessmentFetch('action=leave_cancel', { method: 'POST', body: JSON.stringify({ id: request.id }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to cancel.'); }
  };
  if (!list) return error ? <Notice tone="rose">{error}</Notice> : <p className="text-sm text-slate-500">Loading…</p>;
  if (!list.length) return <Notice>You have not applied for any leave yet.</Notice>;
  const years = [...new Set(list.map((request) => request.start.slice(0, 4)))];
  return <div className="space-y-5">{error && <Notice tone="rose">{error}</Notice>}{years.map((year) => <section key={year}>
    <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{year}</h3>
    <ul className="space-y-2.5">{list.filter((request) => request.start.startsWith(year)).map((request) => <li key={request.id} className={`${card} flex flex-wrap items-start gap-3`}>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{request.typeName}</p><p className="mt-0.5 text-sm text-[#2a5ea8]">{range(request)} · {days(request.days)} day{request.days === 1 ? '' : 's'}</p>{request.reason && <p className="mt-1 text-xs text-slate-500">{request.reason}</p>}{request.supervisorNote && <p className="mt-1 text-xs text-slate-600">Supervisor: {request.supervisorNote}</p>}{request.note && <p className="mt-1 text-xs text-slate-600">{request.twoLevel ? 'Final approver' : 'Approver'}: {request.note}</p>}</div>
      <div className="flex flex-col items-end gap-2"><span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS[request.status]}`}>{STATUS_LABEL[request.status]}</span>{(request.status === 'pending' || request.status === 'supervisor_approved') && <button onClick={() => void cancel(request)} className="text-xs font-semibold text-rose-600 hover:underline">Cancel</button>}</div>
    </li>)}</ul>
  </section>)}</div>;
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
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{request.applicant}</p><p className="text-xs text-slate-400">{request.code}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">{request.stage === 'final' ? 'Final approval' : request.twoLevel ? 'Supervisor approval' : 'Pending'}</span></div>
      {request.stage === 'final' && request.supervisorNote && <p className="mt-1 text-xs text-slate-500">Supervisor said: {request.supervisorNote}</p>}
      <p className="mt-2 text-sm"><strong>{request.typeName}</strong> · <span className="text-[#2a5ea8]">{range(request)}</span> · {days(request.days)} day{request.days === 1 ? '' : 's'}</p>
      {request.reason && <p className="mt-1 text-sm text-slate-600">“{request.reason}”</p>}
      {request.balance !== null && request.balance !== undefined && <p className={`mt-1 text-xs ${request.balance < request.days && request.type !== 'UL' ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>Balance now {days(request.balance)}{request.balance < request.days && request.type !== 'UL' ? ': this request is more than the balance' : ''}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]"><input value={notes[request.id] || ''} onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })} placeholder="Note (optional)" maxLength={300} className={field} /><input inputMode="decimal" value={adjust[request.id] || ''} onChange={(event) => setAdjust({ ...adjust, [request.id]: event.target.value.replace(/[^\d.]/g, '') })} placeholder={`Days: ${days(request.days)}`} aria-label="Change the number of days" className={field} /></div>
      <div className="mt-3 flex gap-2"><button disabled={busy === request.id} onClick={() => void decide(request, 'approve')} className="h-11 flex-1 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button><button disabled={busy === request.id} onClick={() => void decide(request, 'reject')} className="h-11 flex-1 rounded-xl border border-rose-200 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reject</button></div>
    </li>)}</ul>}
    {state.recent.length > 0 && <section><h3 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Decided recently</h3><ul className="space-y-2">{state.recent.map((request) => <li key={request.id} className={`${card} flex items-center gap-3`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{request.applicant}</p><p className="truncate text-xs text-slate-500">{request.typeName} · {range(request)} · {days(request.days)}d</p></div><span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS[request.status]}`}>{STATUS_LABEL[request.status]}</span></li>)}</ul></section>}
  </div>;
}

export default function LeaveSection({ isApprover }: { isApprover: boolean }) {
  const [tab, setTab] = useState<'summary' | 'apply' | 'history' | 'approve'>('summary');
  const tabs = [['summary', 'Summary', LayoutGrid], ['apply', 'Apply Leave', CalendarPlus], ['history', 'History', History], ...(isApprover ? [['approve', 'Approve', CalendarCheck] as const] : [])] as const;
  return <>
    <div className="mb-5 flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-[0_8px_25px_rgba(20,35,59,0.06)]">{tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`inline-flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-bold transition sm:text-sm ${tab === id ? 'bg-[#1f3a6b] text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
    {tab === 'summary' && <Summary />}
    {tab === 'apply' && <Apply onDone={() => setTab('history')} />}
    {tab === 'history' && <HistoryList />}
    {tab === 'approve' && isApprover && <Approvals />}
  </>;
}
