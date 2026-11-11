import { useEffect, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { CareFormView } from './CareFormSheet';
import { CareClaim, careMonth, careStatusLabel, careStatusTone } from './lib/careClaim';

// Office HR > Incentive > AraCare: the Care Coordination Allowance claims (RM 100 a month). A claim the COO has approved arrives here directly
// (it does not go through Clinical Admin); HR marks it Received. HR also sets who may claim it.
const API = '/api/status?resource=hr';
const RECEIVER_KEY = 'ara_incentive_hr_receiver';
const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
type Person = { id: string; name: string; code: string; branch: string };
async function call(query: string, body?: unknown) {
  const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 7);

export function HRCare({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState('all');
  const [claims, setClaims] = useState<CareClaim[] | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const [staff, setStaff] = useState<Person[]>([]);
  const [candidates, setCandidates] = useState<Person[]>([]);
  const [pick, setPick] = useState('');
  const [receiver, setReceiver] = useState(() => { try { return localStorage.getItem(RECEIVER_KEY) || ''; } catch { return ''; } });
  const [viewing, setViewing] = useState<CareClaim | null>(null);
  const [busy, setBusy] = useState(false);
  const loadClaims = () => { setClaims(null); call(`action=care_claims&month=${month}`).then((result) => { setClaims(result.claims); setNotSetUp(Boolean(result.notSetUp)); }).catch((cause: Error) => { setClaims([]); onError(cause.message); }); };
  const loadStaff = () => call('action=care_staff').then((result) => { setStaff(result.staff || []); setCandidates(result.candidates || []); }).catch((cause: Error) => onError(cause.message));
  useEffect(loadClaims, [month]);
  useEffect(() => { void loadStaff(); }, []);
  const months = (() => { const list: string[] = []; for (let value = thisMonth(); value >= '2026-10'; ) { list.push(value); const index = Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 2; value = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`; } return list; })();
  const act = async (query: string, body: unknown, after: () => void) => { setBusy(true); try { await call(query, body); after(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); } };
  const receive = (claim: CareClaim, received: boolean) => {
    if (received && !receiver.trim()) { onError('Enter your name in "Received by" first.'); return; }
    try { localStorage.setItem(RECEIVER_KEY, receiver); } catch { /* storage not available */ }
    void act('action=care_receive', { id: claim.id, by: receiver, received }, loadClaims);
  };
  const toReceive = (claims || []).filter((claim) => claim.status === 'approved' && !claim.hrReceivedAt).length;
  return <div className="space-y-4">
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <select value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Month" className={field}><option value="all">All months</option>{months.map((value) => <option key={value} value={value}>{careMonth(value)}</option>)}</select>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">Received by<input value={receiver} maxLength={80} onChange={(event) => setReceiver(event.target.value)} placeholder="Your name" className={`${field} w-56 font-normal`} /></label>
      {claims && <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${toReceive ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{toReceive ? `${toReceive} to receive` : 'Nothing to receive'}</span>}
    </section>
    {notSetUp && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">AraCare is not set up yet. System Admin needs to run the latest database migration first.</p>}
    <section className={`${card} overflow-x-auto`}>
      <h3 className="text-lg font-semibold">Care Coordination Allowance (AraCare)</h3>
      <p className="mt-1 text-sm text-slate-500">RM 100 a month. The coordinator sends the claim, the COO checks the KPIs, and a payable claim arrives here. Mark it Received once the paperwork is in hand.</p>
      {!claims ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : !claims.length ? <p className="mt-3 text-sm text-slate-500">No AraCare claims yet.</p> : <table className="mt-3 w-full min-w-[760px] text-sm">
        <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Month</th><th className="pr-3 text-right">RM</th><th className="pr-3">Status</th><th className="pr-3">COO</th><th /></tr></thead>
        <tbody>{claims.map((claim) => <tr key={claim.id} className="border-t border-slate-100">
          <td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{claim.staffName}</p><p className="text-[11px] text-slate-400">{claim.staffCode} · {claim.branch}</p></td>
          <td className="pr-3 whitespace-nowrap">{careMonth(claim.month)}</td><td className="pr-3 text-right tabular-nums">{claim.amount.toFixed(2)}</td>
          <td className="pr-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${careStatusTone(claim)}`}>{careStatusLabel(claim)}</span>{claim.hrReceivedAt && <p className="mt-0.5 text-[11px] text-slate-400">{claim.hrReceivedBy} · {new Date(claim.hrReceivedAt).toLocaleDateString('en-GB')}</p>}</td>
          <td className="pr-3 text-xs text-slate-500">{claim.kpi ? <>{claim.kpi.eligible ? 'Layak' : 'Tidak layak'} · {claim.kpi.by}</> : '—'}</td>
          <td className="whitespace-nowrap text-right"><button onClick={() => setViewing(claim)} className="mr-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><FileText className="h-3.5 w-3.5" />Form / PDF</button>
            {claim.status === 'approved' && (claim.hrReceivedAt ? <button onClick={() => receive(claim, false)} disabled={busy} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40">Undo received</button> : <button onClick={() => receive(claim, true)} disabled={busy} className="rounded-lg bg-[#0b587b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0a4b69] disabled:opacity-40">Mark received</button>)}</td>
        </tr>)}</tbody>
      </table>}
    </section>
    <section className={`${card} space-y-3`}>
      <div><h3 className="text-lg font-semibold">Who can claim AraCare</h3><p className="mt-1 text-sm text-slate-500">Only these staff see the AraCare form on their Incentive page.</p></div>
      {!staff.length ? <p className="text-sm text-slate-500">Nobody is set yet.</p> : <ul className="divide-y divide-slate-100">{staff.map((person) => <li key={person.id} className="flex items-center gap-3 py-2 text-sm"><span className="min-w-0 flex-1"><strong>{person.name}</strong> <span className="text-xs text-slate-400">{person.code} · {person.branch}</span></span><button onClick={() => { if (window.confirm(`Stop ${person.name} from claiming AraCare?`)) void act('action=care_staff_save', { staffId: person.id, on: false }, loadStaff); }} disabled={busy} aria-label={`Remove ${person.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></li>)}</ul>}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f4fafd] p-3"><select value={pick} onChange={(event) => setPick(event.target.value)} aria-label="Staff to add" className={`${field} min-w-[260px] flex-1`}><option value="">Choose a staff member…</option>{candidates.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.code})</option>)}</select><button onClick={() => void act('action=care_staff_save', { staffId: pick, on: true }, () => { setPick(''); void loadStaff(); })} disabled={busy || !pick} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Add</button></div>
    </section>
    {viewing && <CareFormView claim={viewing} onClose={() => setViewing(null)} />}
  </div>;
}
