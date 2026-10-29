import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ScrollText, Search, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Office HR, Leave > Staff leave: a card for every staff member with their annual and medical leave, and from a card the
// person's balances (HR can correct them) and their whole leave history.
type Pair = { year: number; eligible: number; total: number; taken: number; balance: number } | null;
type Staff = { id: string; company: string; code: string; name: string; designation: string; status: string; al: Pair; ml: Pair; waiting: number };
type Balance = { group: string; year: number; eligible: number; broughtForward: number; credit: number; earn: number; forfeit: number; total: number; taken: number; balance: number; asOf: string; source: string };
type Req = { id: string; type: string; start: string; end: string; half: 'AM' | 'PM' | null; days: number; reason: string; status: 'pending' | 'supervisor_approved' | 'approved' | 'rejected' | 'cancelled'; supervisorNote: string; note: string };

const GROUP_NAME: Record<string, string> = { AL: 'Annual leave', ML: 'Medical leave', HOSP: 'Hospitalization', MARRG: 'Marriage', HAJUMR: 'Haji / Umrah', UL: 'Unpaid leave' };
const LABEL: Record<Req['status'], string> = { pending: 'Waiting for supervisor', supervisor_approved: 'Waiting for final approver', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };
const TONE: Record<Req['status'], string> = { pending: 'bg-amber-50 text-amber-700', supervisor_approved: 'bg-sky-50 text-sky-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', cancelled: 'bg-slate-100 text-slate-500' };
const dmy = (date: string) => date.split('-').reverse().join('/');
const range = (r: Req) => r.start === r.end ? `${dmy(r.start)}${r.half ? ` (${r.half})` : ''}` : `${dmy(r.start)} – ${dmy(r.end)}`;
const num = (value: number) => String(Math.round(value * 100) / 100);
const imported = (r: Req) => r.note.startsWith('Imported from Infotech');
const THIS_YEAR = new Date().getFullYear();

async function api(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return response.json();
}

function Meter({ label, pair }: { label: string; pair: Pair }) {
  if (!pair) return <div><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-xs text-slate-300">Not set up</p></div>;
  const size = label === 'Annual' ? pair.total : pair.eligible;
  const used = size > 0 ? Math.min(100, Math.max(0, (pair.taken / size) * 100)) : 0;
  return <div>
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    <p className="mt-1 text-sm"><strong className={`text-lg ${pair.balance < 0 ? 'text-rose-600' : 'text-[#0b587b]'}`}>{num(pair.balance)}</strong><span className="text-slate-400"> left of {num(size)}</span></p>
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0b587b]" style={{ width: `${used}%` }} /></div>
  </div>;
}

export function HRLeaveStaff({ onError }: { onError: (message: string) => void }) {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [openId, setOpenId] = useState('');
  const [policy, setPolicy] = useState(false);
  const load = () => api('action=leave_staff').then((result) => { if (result.error) throw new Error(result.error); setStaff(result.staff); }).catch((cause: Error) => { setStaff([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => (staff || []).filter((person) => (showInactive || person.status === 'Active') && (!company || person.company === company) && words.every((word) => `${person.name} ${person.code}`.toLowerCase().includes(word))), [staff, query, company, showInactive]);

  if (policy) return <PolicyReview onBack={() => { setPolicy(false); void load(); }} onError={onError} />;
  if (openId) return <PersonLeave key={openId} id={openId} onBack={() => { setOpenId(''); void load(); }} onError={onError} />;
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or staff code" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm" /></div>
      <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Company" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />Show resigned</label>
      <span className="text-sm text-slate-400">{staff ? `${shown.length} staff` : 'Loading…'}</span>
      <button onClick={() => setPolicy(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0b587b] hover:bg-slate-50"><ScrollText className="h-4 w-4" />Company policy</button>
    </section>
    {staff && !shown.length && <p className={`${card} text-sm text-slate-500`}>No staff match these filters.</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map((person) => <button key={person.id} onClick={() => setOpenId(person.id)} className={`${card} text-left transition hover:-translate-y-0.5 hover:shadow-md ${person.status === 'Active' ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{person.name}</p><p className="mt-0.5 truncate text-xs text-slate-400">{person.company} · {person.code}{person.designation ? ` · ${person.designation}` : ''}</p></div>
        {person.waiting > 0 && <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">{person.waiting} waiting</span>}{person.status !== 'Active' && <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{person.status}</span>}</div>
      <div className="mt-4 grid grid-cols-2 gap-5"><Meter label="Annual" pair={person.al} /><Meter label="Medical" pair={person.ml} /></div>
    </button>)}</div>
  </div>;
}

// One person: balances HR can correct, and the whole leave history.
function PersonLeave({ id, onBack, onError }: { key?: string; id: string; onBack: () => void; onError: (message: string) => void }) {
  const [data, setData] = useState<{ person: { name: string; code: string; company: string; designation: string; status: string }; balances: Balance[]; requests: Req[] } | null>(null);
  const load = () => api(`action=leave_person&id=${id}`).then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => onError(cause.message));
  useEffect(() => { void load(); }, [id]);
  const remove = async (request: Req) => {
    const back = request.status === 'approved' && !imported(request) ? ` The ${num(request.days)} day(s) go back on the balance.` : imported(request) ? ' It was imported from Infotech, so no balance changes.' : '';
    if (!window.confirm(`Delete this leave (${request.type}, ${range(request)})?${back} This cannot be undone.`)) return;
    try { const result = await api('action=leave_delete', { id: request.id }); if (result.error) throw new Error(result.error); await load(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to delete.'); }
  };
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const present = new Set(data.balances.map((b) => b.group));
  const missing = ['AL', 'ML'].filter((group) => !present.has(group));
  return <div className="space-y-5">
    <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe]"><ArrowLeft className="h-4 w-4" />All staff</button>
    <section className="ara-hero rounded-[28px] px-7 py-6 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#70d8fa]">{data.person.company} · {data.person.code}{data.person.status !== 'Active' ? ` · ${data.person.status}` : ''}</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{data.person.name}</h2>{data.person.designation && <p className="mt-1 text-[#b9cfdd]">{data.person.designation}</p>}</section>
    <section className={card}>
      <h3 className="font-semibold">Leave balance</h3>
      <p className="mt-1 text-sm text-slate-500">Change the entitlement and the figures below when Infotech or a policy says so. Days already taken come from approved leave and cannot be typed here; delete a wrong leave in the history below instead. Every change is written to this person's HR history.</p>
      <div className="mt-4 space-y-4">{data.balances.filter((balance) => balance.group === 'AL' || balance.group === 'ML').map((balance) => <BalanceRow key={`${balance.group}-${balance.year}`} id={id} balance={balance} onSaved={load} onError={onError} />)}</div>
      {data.balances.some((balance) => balance.group !== 'AL' && balance.group !== 'ML') && <details className="mt-4 rounded-2xl border border-slate-100 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-600">Other leave types ({data.balances.filter((balance) => balance.group !== 'AL' && balance.group !== 'ML').map((balance) => GROUP_NAME[balance.group] || balance.group).join(', ')})</summary>
        <div className="mt-4 space-y-4">{data.balances.filter((balance) => balance.group !== 'AL' && balance.group !== 'ML').map((balance) => <BalanceRow key={`${balance.group}-${balance.year}`} id={id} balance={balance} onSaved={load} onError={onError} />)}</div></details>}
      {missing.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{missing.map((group) => <button key={group} onClick={() => void api('action=leave_balance_save', { id, group, year: THIS_YEAR, eligible: 0 }).then(load).catch((cause: Error) => onError(cause.message))} className="rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-[#0b587b] hover:bg-slate-50">Set up {GROUP_NAME[group].toLowerCase()} for {THIS_YEAR}</button>)}</div>}
    </section>
    <section className={card}>
      <h3 className="font-semibold">Leave history</h3>
      {!data.requests.length ? <p className="mt-2 text-sm text-slate-500">No leave recorded for this person.</p> :
        <ul className="mt-3 divide-y divide-slate-100">{data.requests.map((request) => <li key={request.id} className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="text-sm"><span className="font-mono text-xs font-bold text-[#0b587b]">{request.type}</span> <span className="text-[#0b587b]">{range(request)}</span> · {num(request.days)} day{request.days === 1 ? '' : 's'}</p>
            {request.reason && <p className="mt-0.5 text-xs text-slate-500">{request.reason}</p>}
            {(request.supervisorNote || (request.note && !imported(request))) && <p className="mt-0.5 text-xs text-slate-400">{[request.supervisorNote && `Supervisor: ${request.supervisorNote}`, request.note && !imported(request) && `Final: ${request.note}`].filter(Boolean).join(' · ')}</p>}</div>
          <div className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-full px-3 py-1 text-[11px] font-bold ${TONE[request.status]}`}>{LABEL[request.status]}</span>{imported(request) && <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">From Infotech</span>}</div>
          <button onClick={() => void remove(request)} aria-label="Delete this leave" title="Delete this leave" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </li>)}</ul>}
    </section>
  </div>;
}

function BalanceRow({ id, balance, onSaved, onError }: { key?: string; id: string; balance: Balance; onSaved: () => Promise<void> | void; onError: (message: string) => void }) {
  const [form, setForm] = useState({ eligible: String(balance.eligible), broughtForward: String(balance.broughtForward), credit: String(balance.credit), earn: String(balance.earn), forfeit: String(balance.forfeit) });
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm({ eligible: String(balance.eligible), broughtForward: String(balance.broughtForward), credit: String(balance.credit), earn: String(balance.earn), forfeit: String(balance.forfeit) }); }, [balance.eligible, balance.broughtForward, balance.credit, balance.earn, balance.forfeit, balance.taken]);
  const n = (value: string) => Number(value) || 0;
  const annual = balance.group === 'AL';
  // The same working-out as the server, so HR sees the result before saving.
  const total = annual ? n(form.broughtForward) + n(form.credit) + (n(form.earn) > 0 ? n(form.earn) : n(form.eligible)) - n(form.forfeit) : n(form.eligible) + n(form.broughtForward) + n(form.credit) - n(form.forfeit);
  const left = total - balance.taken;
  const changed = n(form.eligible) !== balance.eligible || n(form.broughtForward) !== balance.broughtForward || n(form.credit) !== balance.credit || n(form.earn) !== balance.earn || n(form.forfeit) !== balance.forfeit;
  const fields: [keyof typeof form, string, boolean][] = annual ? [['eligible', 'Entitlement', true], ['broughtForward', 'Brought forward', true], ['credit', 'Credit', true], ['earn', 'Earned so far', true], ['forfeit', 'Forfeited', true]] : [['eligible', 'Entitlement', true]];
  const save = async () => {
    setSaving(true);
    try { const result = await api('action=leave_balance_save', { id, group: balance.group, year: balance.year, ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value) || 0])) }); if (result.error) throw new Error(result.error); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setSaving(false);
  };
  return <div className="rounded-2xl border border-slate-100 p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="font-semibold">{GROUP_NAME[balance.group] || balance.group}<span className="ml-2 text-xs font-normal text-slate-400">{balance.year ? balance.year : 'whole service'}</span></h4>
      <p className="text-sm text-slate-500">Taken <strong className="text-slate-700">{num(balance.taken)}</strong> · Balance <strong className={left < 0 ? 'text-rose-600' : 'text-[#0b587b]'}>{num(left)}</strong>{annual ? <> · Total {num(total)}</> : null}</p></div>
    <div className="mt-3 flex flex-wrap items-end gap-3">{fields.map(([key, label]) => <label key={key} className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span><input inputMode="decimal" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value.replace(/[^\d.]/g, '') })} className="h-10 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm" /></label>)}
      <button onClick={() => void save()} disabled={!changed || saving} className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button></div>
    {annual && n(form.earn) > 0 && <p className="mt-2 text-xs text-slate-400">While "Earned so far" is above 0, the total uses what has been earned. Set it to 0 once the full entitlement applies.</p>}
  </div>;
}


// Company leave policy: annual leave by staff category and years of service, sick leave 14/18/22, hospital leave 60. HR sees what each
// person has next to what the policy gives, and applies it to the people chosen.
type PolicyRow = { id: string; company: string; code: string; name: string; designation: string; joinDate: string | null; years: number | null; track: string; trackSet: boolean; al: number | null; ml: number | null; hosp: number | null };
const TRACKS: [string, string][] = [['admin', 'Administrative officer'], ['clinical', 'Doctor / clinic assistant (permanent)'], ['parttime', 'Doctor / clinic assistant (part-time)']];
const POLICY_AL: Record<string, number[]> = { admin: [15, 20, 25], clinical: [8, 12, 16], parttime: [6, 8, 11] };
const POLICY_ML = [14, 18, 22];
const tierOf = (years: number) => years >= 5 ? 2 : years >= 2 ? 1 : 0;
const TIER = ['under 2 years', '2 to 5 years', '5 years or more'];
// The same working-out as the server (and as Infotech): annual leave is the average of the tier's figure at each month end of this year,
// rounded; sick leave uses the tier on 31 December.
const wanted = (track: string, joinDate: string | null) => {
  if (!joinDate) return null;
  const year = new Date().getFullYear(), part = track === 'parttime';
  const yearsAt = (date: string) => (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${joinDate}T00:00:00Z`)) / (365.25 * 86400000);
  let sum = 0; for (let month = 0; month < 12; month++) sum += POLICY_AL[track][tierOf(yearsAt(new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)))];
  return { al: Math.round(sum / 12), ml: part ? null : POLICY_ML[tierOf(yearsAt(`${year}-12-31`))], hosp: part ? null : 60 };
};

function PolicyReview({ onBack, onError }: { onBack: () => void; onError: (message: string) => void }) {
  const [rows, setRows] = useState<PolicyRow[] | null>(null);
  const [tracks, setTracks] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [onlyDiffer, setOnlyDiffer] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');
  const load = () => api('action=leave_policy').then((result) => { if (result.error) throw new Error(result.error); setRows(result.staff); setTracks({}); setPicked(new Set()); }).catch((cause: Error) => { setRows([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);

  const view = useMemo(() => (rows || []).map((row) => { const track = tracks[row.id] || row.track; const want = wanted(track, row.joinDate); const differ = !!want && (row.al === null || row.al !== want.al || (want.ml !== null && (row.ml === null || row.ml !== want.ml)) || (want.hosp !== null && (row.hosp === null || row.hosp !== want.hosp)) || (tracks[row.id] !== undefined && tracks[row.id] !== row.track)); return { row, track, want, differ }; }), [rows, tracks]);
  const shown = view.filter((item) => !onlyDiffer || item.differ);
  const differing = view.filter((item) => item.differ).length;
  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const apply = async () => {
    const items = view.filter((item) => picked.has(item.row.id)).map((item) => ({ id: item.row.id, track: item.track }));
    if (!items.length) return;
    if (!window.confirm(`Apply the company policy to ${items.length} staff? Their annual, sick and hospital leave entitlement changes to the policy figure and each change is written to their HR history.`)) return;
    setSaving(true); setDone('');
    try { const result = await api('action=leave_policy_apply', { items }); if (result.error) throw new Error(result.error); setDone(`Applied: ${result.changed} entitlement${result.changed === 1 ? '' : 's'} changed${result.skipped ? `, ${result.skipped} skipped (no join date)` : ''}.`); await load(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to apply.'); }
    setSaving(false);
  };
  const cell = (now: number | null, want: number | null | undefined) => now === null ? <span className="text-slate-300">no balance</span> : want === null || want === undefined ? <span>{num(now)}</span> : now === want ? <span className="text-slate-500">{num(now)}</span> : <span className="font-semibold text-amber-700">{num(now)} → {num(want)}</span>;

  return <div className="space-y-5">
    <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe]"><ArrowLeft className="h-4 w-4" />All staff</button>
    <section className={card}>
      <h3 className="font-semibold">Company leave policy</h3>
      <p className="mt-1 text-sm text-slate-500">Annual leave depends on the staff category and years of service. Sick leave is 14, 18 or 22 days and hospital leave 60 days for permanent staff. When someone passes 2 or 5 years during the year, annual leave is shared by month (the same way Infotech does it: the figure for their tier at the end of each month, averaged over 12 months) and sick leave uses their tier on 31 December. Choose a category for each person, pick who to update and press Apply. Nothing changes until you do.</p>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Years of service</p><ul className="mt-2 space-y-1 text-slate-600">{TIER.map((label) => <li key={label}>{label[0].toUpperCase() + label.slice(1)}</li>)}</ul></div>
        {TRACKS.map(([key, label]) => <div key={key}><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><ul className="mt-2 space-y-1 font-semibold text-[#0b587b]">{POLICY_AL[key].map((days, index) => <li key={index}>{days} days</li>)}</ul></div>)}
      </div>
    </section>
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyDiffer} onChange={(event) => setOnlyDiffer(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />Only those that differ from the policy</label>
      <span className="text-sm text-slate-400">{rows ? `${differing} of ${view.length} differ` : 'Loading…'}</span>
      <button onClick={() => setPicked(new Set(shown.map((item) => item.row.id)))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50">Select all shown</button>
      <button onClick={() => void apply()} disabled={!picked.size || saving} className="ml-auto h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-bold text-white disabled:opacity-40">{saving ? 'Applying…' : `Apply to ${picked.size} selected`}</button>
    </section>
    {done && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{done}</p>}
    <section className={`${card} overflow-x-auto`}>
      {rows && !shown.length ? <p className="text-sm text-slate-500">{view.length ? 'Everyone matches the company policy.' : 'No staff found.'}</p> :
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="w-8 py-2" /><th className="py-2 pr-4 font-semibold">Staff</th><th className="py-2 pr-4 font-semibold">Service</th><th className="py-2 pr-4 font-semibold">Category</th><th className="py-2 pr-4 font-semibold">Annual</th><th className="py-2 pr-4 font-semibold">Sick</th><th className="py-2 font-semibold">Hospital</th></tr></thead>
          <tbody>{shown.map(({ row, track, want, differ }) => <tr key={row.id} className="border-b border-slate-50 align-top">
            <td className="py-3"><input type="checkbox" checked={picked.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.name}`} className="h-4 w-4 rounded border-slate-300" /></td>
            <td className="py-3 pr-4"><p className="font-semibold">{row.name}</p><p className="text-xs text-slate-400">{row.company} · {row.code}{row.designation ? ` · ${row.designation}` : ''}</p></td>
            <td className="py-3 pr-4 whitespace-nowrap">{row.years === null ? <span className="text-slate-300">no join date</span> : <><strong>{(Math.round(row.years * 10) / 10).toFixed(1)}</strong> yrs<p className="text-xs text-slate-400">{TIER[tierOf(row.years)]}</p></>}</td>
            <td className="py-3 pr-4"><select value={track} onChange={(event) => setTracks({ ...tracks, [row.id]: event.target.value })} aria-label={`Category for ${row.name}`} className="h-9 w-full min-w-[190px] rounded-lg border border-slate-200 bg-white px-2 text-xs">{TRACKS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{!row.trackSet && !tracks[row.id] && <p className="mt-1 text-[10px] text-slate-400">Guessed from the current entitlement: check it</p>}</td>
            <td className="py-3 pr-4">{cell(row.al, want?.al)}</td><td className="py-3 pr-4">{cell(row.ml, want?.ml)}</td><td className="py-3">{cell(row.hosp, want?.hosp)}</td>
          </tr>)}</tbody>
        </table>}
    </section>
  </div>;
}
