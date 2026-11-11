import { useEffect, useState } from 'react';
import { card } from './AssessmentStaff';
import { CareFormView } from './CareFormSheet';
import { CARE_ITEMS, CareClaim, careMonth, careStatusLabel, careStatusTone } from './lib/careClaim';

// The COO's check of the AraCare claims (Care Coordination Allowance): the KPIs and whether the allowance is payable. Used in the COO office and in the
// COO's Individual Sign In; each passes in how the claims are loaded and how a check is saved.
const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
const NAME_KEY = 'ara_coo_name';
// A yes / no pair of buttons for one KPI.
function Pick({ label, value, yes, no, onChange }: { label: string; value: boolean | null; yes: string; no: string; onChange: (value: boolean) => void }) {
  const base = 'h-9 rounded-lg px-3 text-xs font-semibold';
  return <div className="flex flex-wrap items-center gap-2"><span className="min-w-[220px] flex-1 text-sm text-slate-700">{label}</span>
    <button type="button" onClick={() => onChange(true)} className={`${base} ${value === true ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{yes}</button>
    <button type="button" onClick={() => onChange(false)} className={`${base} ${value === false ? 'bg-rose-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{no}</button></div>;
}
function CareCard({ claim, by, review, onSaved, onError }: { key?: string; claim: CareClaim; by: string; review: (payload: Record<string, unknown>) => Promise<unknown>; onSaved: () => void; onError: (message: string) => void }) {
  const kpi = claim.kpi;
  const [editing, setEditing] = useState(claim.status === 'submitted');
  const [followUp, setFollowUp] = useState<boolean | null>(kpi ? kpi.followUp : null);
  const [registry, setRegistry] = useState<boolean | null>(kpi ? kpi.registry : null);
  const [reminder, setReminder] = useState<boolean | null>(kpi ? kpi.reminder : null);
  const [eligible, setEligible] = useState<boolean | null>(kpi ? kpi.eligible : null);
  const [note, setNote] = useState(kpi?.note || '');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const received = Boolean(claim.hrReceivedAt);
  const save = async () => {
    if (!by.trim()) { onError('Enter your name first.'); return; }
    setBusy(true);
    try { await review({ id: claim.id, followUp, registry, reminder, eligible, note, by }); setEditing(false); onSaved(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); }
  };
  return <article className={`${card} space-y-3`}>
    <div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{claim.staffName}</p><p className="text-xs text-slate-500">{claim.staffCode} · {claim.branch} · {careMonth(claim.month)} · RM {claim.amount.toFixed(2)}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${careStatusTone(claim)}`}>{careStatusLabel(claim)}</span>
      <button onClick={() => setViewing(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50">Form / PDF</button></div>
    <div className="flex flex-wrap gap-1.5">{claim.roles.map((role) => <span key={role} className="rounded-full bg-[#eaf6fb] px-2.5 py-1 text-xs font-semibold text-[#0b587b]">{role}{role === 'Lain-lain' && claim.other ? `: ${claim.other}` : ''}</span>)}</div>
    <table className="w-full text-sm"><tbody>{CARE_ITEMS.map((label, index) => <tr key={label} className="border-t border-slate-100"><td className="w-8 py-1.5 text-slate-400">{index + 1}</td><td className="pr-3 text-slate-600">{label}</td><td className="text-right font-medium">{claim.items[index]}</td></tr>)}</tbody></table>
    <p className="text-xs text-slate-500">The staff member confirmed the registry and follow-up are done and the data is correct and can be audited.</p>
    {kpi && !editing ? <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><p>KPI: follow-up compliance ≥70% {kpi.followUp ? 'capai' : 'tidak capai'} · registry {kpi.registry ? 'dikemaskini' : 'tidak dikemaskini'} · reminder {kpi.reminder ? 'dilakukan' : 'tidak dilakukan'} · <strong>{kpi.eligible ? 'Layak' : 'Tidak layak'}</strong></p><p className="mt-1 text-xs text-slate-400">Checked by {kpi.by}, {new Date(kpi.at).toLocaleDateString('en-GB')}{kpi.note ? ` · ${kpi.note}` : ''}</p>{received ? <p className="mt-1 text-xs text-slate-400">HR has received this claim, so it cannot be changed.</p> : <button onClick={() => setEditing(true)} className="mt-2 text-xs font-semibold text-[#0b587b]">Change my check</button>}</div>
      : received ? null : <div className="space-y-2.5 rounded-xl bg-[#f4fafd] p-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Penilaian KPI (PIC Klinik)</p>
        <Pick label="Follow-up compliance ≥70%" value={followUp} yes="Capai" no="Tidak" onChange={setFollowUp} />
        <Pick label="Registry updated" value={registry} yes="Ya" no="Tidak" onChange={setRegistry} />
        <Pick label="Reminder dilakukan" value={reminder} yes="Ya" no="Tidak" onChange={setReminder} />
        <Pick label="Syarat bayaran elaun" value={eligible} yes="Layak" no="Tidak layak" onChange={setEligible} />
        <input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder={eligible === false ? 'Why it is not payable (needed, the staff member sees it)' : 'Note (optional)'} className={`${field} w-full`} />
        <p className="text-xs text-slate-500">Layak: approved and sent straight to HR. Tidak layak: returned to the staff member with your note.</p>
        <div className="flex gap-2"><button type="button" onClick={() => void save()} disabled={busy || followUp === null || registry === null || reminder === null || eligible === null || (eligible === false && !note.trim())} className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-40">{eligible === false ? 'Return to staff' : 'Approve and send to HR'}</button>{kpi && <button type="button" onClick={() => setEditing(false)} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">Cancel</button>}</div></div>}
    {viewing && <CareFormView claim={claim} onClose={() => setViewing(false)} />}
  </article>;
}
export function CareReviewPage({ load: fetchClaims, review, onError }: { load: () => Promise<{ claims: CareClaim[]; notSetUp?: boolean }>; review: (payload: Record<string, unknown>) => Promise<unknown>; onError: (message: string) => void }) {
  const [claims, setClaims] = useState<CareClaim[] | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const [by, setBy] = useState(() => { try { return localStorage.getItem(NAME_KEY) || 'Dr Luqman Hakim bin Mohd Kamal'; } catch { return 'Dr Luqman Hakim bin Mohd Kamal'; } });
  const load = () => fetchClaims().then((result) => { setClaims(result.claims); setNotSetUp(Boolean(result.notSetUp)); }).catch((cause: Error) => { setClaims([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);
  const saveName = (value: string) => { setBy(value); try { localStorage.setItem(NAME_KEY, value); } catch { /* storage not available */ } };
  const waiting = (claims || []).filter((claim) => claim.status === 'submitted'), rest = (claims || []).filter((claim) => claim.status !== 'submitted');
  return <div className="space-y-4">
    <section className={`${card} flex flex-wrap items-center gap-3`}><p className="min-w-0 flex-1 text-sm text-slate-500">The AraCare coordinators send their <strong>Care Coordination Allowance (RM 100)</strong> claim from their Incentive page. You check the three KPIs and decide if it is payable. A payable claim goes <strong>straight to HR</strong>; it does not go through Clinical Admin.</p><label className="text-xs font-semibold text-slate-500">Checked by<input value={by} maxLength={80} onChange={(event) => saveName(event.target.value)} className={`${field} mt-1 block w-72`} /></label></section>
    {notSetUp && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">AraCare is not set up yet. System Admin needs to run the latest database migration first.</p>}
    <h3 className="text-sm font-semibold text-slate-700">Waiting for your check {claims && <span className="font-normal text-slate-400">({waiting.length})</span>}</h3>
    {!claims ? <p className="text-sm text-slate-500">Loading…</p> : !waiting.length ? <section className={card}><p className="text-sm text-slate-500">Nothing is waiting.</p></section> : waiting.map((claim) => <CareCard key={`${claim.id}-w`} claim={claim} by={by} review={review} onSaved={() => void load()} onError={onError} />)}
    {rest.length > 0 && <><h3 className="pt-2 text-sm font-semibold text-slate-700">Checked <span className="font-normal text-slate-400">({rest.length})</span></h3>{rest.map((claim) => <CareCard key={`${claim.id}-${claim.status}-${claim.kpi?.at}`} claim={claim} by={by} review={review} onSaved={() => void load()} onError={onError} />)}</>}
  </div>;
}

