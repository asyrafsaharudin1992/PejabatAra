import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, FileDown, FileText, LogOut, Plus, Printer, Send, Trash2, Undo2, X } from 'lucide-react';
import { assessmentFetch, Shell, SignIn, TOKEN_KEY } from './AssessmentRoom';
import { ClaimSheet, PdfHint, SheetClaim, SheetPreview, usePrintSheet } from './IncentiveSheet';
import { approvedTotal, claimTotal, codeName, dmy, INCENTIVE_BRANCHES, INCENTIVE_CODES, INCENTIVE_GROUPS, IncentiveEntry, IncentiveStatus, monthLabel, rm, STATUS_LABEL, STATUS_TONE } from './lib/incentiveCodes';

// Staff Incentive Claims (memo HSO/MEMO/SM/2026/0012). Staff sign in from their own
// phones like the Assessment Room (same session), add each procedure as they do it,
// and submit the month's claim for their Clinical Admin to approve.
type Claim = { month: string; branch: string; entries: IncentiveEntry[]; status: IncentiveStatus; adminNote: string; approvedBy: string; submittedAt: string | null; decidedAt: string | null };
type History = { month: string; status: IncentiveStatus; total: number; count: number }[];

const FIRST_MONTH = '2026-10';
const todayKL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

// Every month from the memo's start up to this month, newest first.
function claimMonths() {
  const months: string[] = [];
  let [year, month] = todayKL().slice(0, 7).split('-').map(Number);
  while (`${year}-${String(month).padStart(2, '0')}` >= FIRST_MONTH) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1; if (!month) { month = 12; year -= 1; }
  }
  return months;
}

const field = 'h-11 w-full rounded-xl border-0 bg-[#f4f6fa] px-3 text-sm outline-none focus:ring-4 focus:ring-[#0b587b]/10';

function AddEntry({ claim, onAdded, onError }: { key?: string; claim: Claim; onAdded: (claim: Claim) => void; onError: (message: string) => void }) {
  const lastDay = claim.month === todayKL().slice(0, 7) ? todayKL() : `${claim.month}-${new Date(Number(claim.month.slice(0, 4)), Number(claim.month.slice(5, 7)), 0).getDate()}`;
  const [date, setDate] = useState(lastDay);
  const [code, setCode] = useState('');
  const [patient, setPatient] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [outstanding, setOutstanding] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const chosen = INCENTIVE_CODES.find((item) => item.code === code);
  const procedure = !chosen || /^(\d|L)/.test(chosen.code);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); onError('');
    try {
      const result = await assessmentFetch('action=incentive_add', { method: 'POST', body: JSON.stringify({ month: claim.month, branch: claim.branch, entry: { date, code, patient, clinicId, outstanding, rm: amount } }) });
      onAdded(result.claim);
      // Keep the date and code: staff often add several of the same in a row.
      setPatient(''); setClinicId(''); setOutstanding(''); setAmount('');
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to add.'); }
    finally { setSaving(false); }
  };

  return <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)]">
    <h2 className="font-semibold">Add a procedure or incentive</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-700">Code incentive</span>
        <select required value={code} onChange={(event) => setCode(event.target.value)} className={field}>
          <option value="">Choose…</option>
          {INCENTIVE_GROUPS.map((group) => <optgroup key={group} label={group}>{INCENTIVE_CODES.filter((item) => item.group === group).map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}{item.ownAmount ? '' : ` (RM ${item.rate})`}</option>)}</optgroup>)}
        </select>
      </label>
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Date</span><input required type="date" min={`${claim.month}-01`} max={lastDay} value={date} onChange={(event) => setDate(event.target.value)} className={field} /></label>
      {chosen?.ownAmount && <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Amount (RM)</span><input required type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={field} /></label>}
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Patient name{procedure ? '' : ' (optional)'}</span><input required={procedure} value={patient} onChange={(event) => setPatient(event.target.value)} className={field} /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Patient clinic ID{procedure ? '' : ' (optional)'}</span><input required={procedure} value={clinicId} onChange={(event) => setClinicId(event.target.value)} className={`${field} font-mono`} /></label>
      <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-700">Outstanding payment (optional)</span><input value={outstanding} onChange={(event) => setOutstanding(event.target.value)} placeholder="e.g. RM 20 belum bayar" className={field} /></label>
    </div>
    <button disabled={saving} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b587b] text-sm font-semibold text-white hover:bg-[#083a55] disabled:opacity-60"><Plus className="h-4 w-4" />{saving ? 'Adding…' : 'Add to claim'}</button>
  </form>;
}

// The claim laid out as the memo's STAFF INCENTIVES form, with Print and Save PDF.
function ViewForm({ claim, onClose }: { claim: SheetClaim; onClose: () => void }) {
  const [printing, setPrinting] = useState<'' | 'print' | 'pdf'>('');
  usePrintSheet(Boolean(printing), `Incentive Claim - ${claim.staffName} - ${claim.month}`, () => setPrinting(''));
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  return <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-900/70 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
    <div className="mx-auto max-w-[1180px]" onClick={(event) => event.stopPropagation()}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-semibold text-white">{monthLabel(claim.month)} · Staff incentives form</p>
        <button onClick={() => setPrinting('pdf')} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><FileDown className="h-4 w-4" />Save PDF</button>
        <button onClick={() => setPrinting('print')} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><Printer className="h-4 w-4" />Print</button>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white hover:bg-white/25" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <SheetPreview claim={claim} />
    </div>
    {printing === 'pdf' && <PdfHint />}
    {printing && createPortal(<div className="cv-print"><style>{'@page{size:A4 landscape;margin:10mm}'}</style><ClaimSheet claim={claim} /></div>, document.body)}
  </div>;
}

export default function IncentiveClaims() {
  const [signedIn, setSignedIn] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));
  const [me, setMe] = useState<{ name: string; branch: string } | null>(null);
  const [month, setMonth] = useState(todayKL().slice(0, 7));
  const [claim, setClaim] = useState<Claim | null>(null);
  const [history, setHistory] = useState<History>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const months = useMemo(claimMonths, []);

  const load = async () => {
    setError('');
    try {
      const [profile, result] = await Promise.all([me ? Promise.resolve({ staff: me }) : assessmentFetch('action=me'), assessmentFetch(`action=incentive&month=${month}`)]);
      setMe(profile.staff); setClaim(result.claim); setHistory(result.history);
    } catch (cause: any) { if (cause.status === 401) setSignedIn(false); else setError(cause.message); }
  };
  useEffect(() => { if (signedIn) { setClaim(null); void load(); } }, [signedIn, month]);

  const act = async (action: string, payload: Record<string, unknown>) => {
    setBusy(true); setError('');
    try { setClaim((await assessmentFetch(`action=${action}`, { method: 'POST', body: JSON.stringify({ month, branch: claim?.branch, ...payload }) })).claim); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong.'); return false; }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!claim || !window.confirm(`Submit your ${monthLabel(month)} claim (${rm(claimTotal(claim.entries))})? You cannot change it after this unless your Clinical Admin returns it.`)) return;
    if (await act('incentive_submit', {})) void load();
  };
  const signOut = async () => {
    await assessmentFetch('action=logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    localStorage.removeItem(TOKEN_KEY);
    setMe(null); setClaim(null); setSignedIn(false);
  };

  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} title="Incentive Claims" intro="Record the procedures you perform and submit your monthly incentive claim. Sign in with your name, staff code and the last 4 digits of your IC." button="Open my claims" />;

  const editable = claim && (claim.status === 'draft' || claim.status === 'returned');
  const total = claim ? claimTotal(claim.entries) : 0;
  return <Shell>
    <a href="#" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b]"><ArrowLeft className="h-4 w-4" />AraOffice lobby</a>
    <div className="mt-5 flex items-start justify-between gap-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#0b9aca]">STAFF INCENTIVES</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{me ? `Hi, ${me.name.split(' ')[0]}` : 'Loading…'}</h1><p className="mt-1 text-sm text-slate-500">Tick the procedures you performed, then submit at month end.</p></div>
      <button onClick={signOut} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><LogOut className="h-4 w-4" />Sign out</button>
    </div>

    <div className="mt-6 grid grid-cols-2 gap-3">
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Month</span><select value={month} onChange={(event) => setMonth(event.target.value)} className={`${field} bg-white`}>{months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label>
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Branch</span><select value={claim?.branch || ''} disabled={!editable} onChange={(event) => claim && setClaim({ ...claim, branch: event.target.value })} className={`${field} bg-white disabled:opacity-70`}><option value="">Choose…</option>{Object.values(INCENTIVE_BRANCHES).map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
    </div>

    {error && <div className="mt-4 flex gap-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {!claim && !error && <p className="mt-6 text-sm text-slate-500">Loading your claim…</p>}
    {claim && <>
      {claim.status === 'submitted' && <p className="mt-5 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" />Submitted. Waiting for your Clinical Admin to approve it.</p>}
      {claim.status === 'approved' && <p className="mt-5 flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>Approved by {claim.approvedBy}.{claim.adminNote ? ` Note: ${claim.adminNote}` : ''}</span></p>}
      {claim.status === 'returned' && <p className="mt-5 flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><Undo2 className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Returned to fix:</strong> {claim.adminNote} Fix your entries, then submit again.</span></p>}

      {editable && <div className="mt-5"><AddEntry key={claim.month} claim={claim} onAdded={setClaim} onError={setError} /></div>}

      <section className="mt-5 rounded-2xl bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{monthLabel(claim.month)} claim</h2><span className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[claim.status]}`}>{STATUS_LABEL[claim.status]}</span>{claim.entries.length > 0 && <button onClick={() => setViewing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><FileText className="h-3.5 w-3.5" />View form</button>}</span></div>
        {!claim.entries.length ? <p className="mt-4 text-sm text-slate-500">No entries yet. Add each procedure after you perform it.</p>
          : <ul className="mt-4 divide-y divide-slate-100">{claim.entries.map((entry) => <li key={entry.id} className="flex items-start gap-3 py-3">
            <span className="w-12 shrink-0 font-mono text-xs font-bold text-[#0b587b]">{entry.code}</span>
            <div className={`min-w-0 flex-1 ${entry.review === 'rejected' ? 'opacity-60' : ''}`}><p className="text-sm font-semibold">{codeName(entry.code)}{entry.review === 'rejected' && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">Not approved</span>}{entry.review === 'approved' && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Approved</span>}</p><p className="mt-0.5 text-xs text-slate-500">{dmy(entry.date)}{entry.patient ? ` · ${entry.patient}` : ''}{entry.clinicId ? ` · ${entry.clinicId}` : ''}{entry.outstanding ? ` · Outstanding: ${entry.outstanding}` : ''}</p></div>
            <span className="shrink-0 text-sm font-semibold">{rm(entry.rm)}</span>
            {editable && <button onClick={() => { if (window.confirm(`Remove ${entry.code} on ${dmy(entry.date)}?`)) void act('incentive_remove', { id: entry.id }); }} disabled={busy} className="-mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove entry"><Trash2 className="h-4 w-4" /></button>}
          </li>)}</ul>}
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-4"><span className="text-sm font-semibold">Total claimed incentives</span><span className="text-lg font-semibold">{rm(total)}</span></div>
        {claim.entries.some((entry) => entry.review) && <div className="mt-1 flex items-center justify-between"><span className="text-sm font-semibold text-emerald-700">Total approved</span><span className="text-lg font-semibold text-emerald-700">{rm(approvedTotal(claim.entries))}</span></div>}
        {editable && claim.entries.length > 0 && <button onClick={() => void submit()} disabled={busy || !claim.branch} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Send className="h-4 w-4" />{claim.branch ? `Submit ${monthLabel(claim.month)} claim` : 'Choose your branch to submit'}</button>}
      </section>

      {history.filter((item) => item.month !== month).length > 0 && <section className="mt-6"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Other months</h2><div className="mt-2 space-y-2">{history.filter((item) => item.month !== month).map((item) => <button key={item.month} onClick={() => setMonth(item.month)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left text-sm shadow-sm hover:bg-slate-50"><span className="font-semibold">{monthLabel(item.month)}</span><span className="flex items-center gap-2"><span className="text-xs text-slate-500">{item.count} entries · {rm(item.total)}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[item.status]}`}>{STATUS_LABEL[item.status]}</span></span></button>)}</div></section>}
      {viewing && <ViewForm claim={{ ...claim, staffName: me?.name || '' }} onClose={() => setViewing(false)} />}
    </>}
  </Shell>;
}
