import { Fragment, useEffect, useState } from 'react';
import { CheckCheck, ChevronDown, FileDown, Printer, RefreshCw, Undo2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { approvedTotal, claimTotal, codeName, dmy, monthLabel, rm } from './lib/incentiveCodes';
import { ClaimPages, PdfHint, usePrintSheet } from './IncentiveSheet';
import { PrintPage, PrintPortal } from './PrintPortal';
import { Claim, MonthSummary } from './ClinicalIncentives';

// Office HR: the staff incentive claims that Clinical Admin has approved and sent to HR, by month. Read only:
// Clinical Admin checks and approves each claim, and returning one there takes it back from this list.
const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 7);
const shiftMonth = (month: string, by: number) => { const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by; return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`; };
// Every month from the memo's start (October 2026) up to this month, newest first.
const RECEIVER_KEY = 'ara_incentive_hr_receiver';
const claimMonths = () => { const months: string[] = []; for (let month = thisMonth(); month >= '2026-10'; month = shiftMonth(month, -1)) months.push(month); return months.length ? months : ['2026-10']; };

export function HRIncentives({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(() => { const start = new Date().getDate() <= 10 ? shiftMonth(thisMonth(), -1) : thisMonth(); return start < '2026-10' ? '2026-10' : start; });
  const [branch, setBranch] = useState('');
  const [name, setName] = useState('');
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const [openId, setOpenId] = useState('');
  const [state, setState] = useState('');
  const [receiver, setReceiver] = useState(() => { try { return localStorage.getItem(RECEIVER_KEY) || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [printing, setPrinting] = useState<'' | 'print' | 'pdf'>('');
  const load = () => {
    setClaims(null);
    officeFetch(`/api/status?resource=hr&action=incentives&month=${month}`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setClaims(result.claims); setNotSetUp(Boolean(result.notSetUp)); })
      .catch((cause: Error) => { setClaims([]); onError(cause.message); });
  };
  useEffect(() => { setOpenId(''); load(); }, [month]);
  usePrintSheet(Boolean(printing), `Incentive Claims for HR - ${month === 'all' ? 'All months' : month}`, () => setPrinting(''));

  const branches = [...new Set((claims || []).map((claim) => claim.branch))].sort();
  const words = name.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (claims || []).filter((claim) => (!branch || claim.branch === branch) && (!state || (state === 'received' ? !!claim.hrReceivedAt : !claim.hrReceivedAt)) && words.every((word) => `${claim.staffName} ${claim.staffCode}`.toLowerCase().includes(word)))
    .sort((a, b) => b.month.localeCompare(a.month) || a.branch.localeCompare(b.branch) || a.staffName.localeCompare(b.staffName));
  const entries = shown.flatMap((claim) => claim.entries);
  const waiting = shown.filter((claim) => !claim.hrReceivedAt);
  // Marks claims received (or undoes it) and shows the result straight away.
  const mark = async (ids: string[], receive: boolean) => {
    if (receive && ids.length > 1 && !window.confirm(`Mark ${ids.length} claims as received by HR?`)) return;
    setBusy(true); setProblem('');
    try {
      const response = await officeFetch('/api/status?resource=hr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: receive ? 'incentive_receive' : 'incentive_unreceive', ids, by: receiver.trim() || 'HR' }) });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      if (receive) { try { localStorage.setItem(RECEIVER_KEY, receiver.trim()); } catch { /* remembering the name is optional */ } }
      const at = new Date().toISOString();
      setClaims((current) => (current || []).map((claim) => ids.includes(claim.id) ? { ...claim, hrReceivedAt: receive ? at : null, hrReceivedBy: receive ? receiver.trim() || 'HR' : '' } : claim));
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'Unable to save.'; setProblem(message); onError(message); }
    finally { setBusy(false); }
  };
  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
  const sent = (claim: Claim) => claim.hrSubmittedAt ? new Date(claim.hrSubmittedAt).toLocaleDateString('en-GB') : '';

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Staff incentives</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Incentive claims that Clinical Admin has checked, approved and sent to HR. Only the rows Clinical Admin ticked ✓ are counted in the approved amount.</p></section>
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Search name or staff code" aria-label="Search staff" className={`${field} min-w-[200px] flex-1`} />
      <select value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Month" className={field}><option value="all">All months</option>{claimMonths().map((item) => <option key={item} value={item}>{monthLabel(item)}</option>)}</select>
      <select value={state} onChange={(event) => setState(event.target.value)} aria-label="Status" className={field}><option value="">All</option><option value="waiting">Not received yet</option><option value="received">Received</option></select>
      <select value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="Branch" className={field}><option value="">All branches</option>{branches.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <button onClick={load} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
      <button onClick={() => setPrinting('pdf')} disabled={!shown.length} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b587b] px-3 text-xs font-semibold text-white hover:bg-[#0a4b69] disabled:opacity-40"><FileDown className="h-3.5 w-3.5" />Save PDF ({shown.length})</button>
      <button onClick={() => setPrinting('print')} disabled={!shown.length} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Printer className="h-3.5 w-3.5" />Print all</button>
    </section>
    {problem && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">Could not mark received: {problem}</p>}
    {notSetUp && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Sending incentives to HR is not set up yet. System Admin needs to run the latest database migration first.</p>}
    {claims && waiting.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#f4fafd] p-4"><p className="min-w-[200px] flex-1 text-sm text-slate-700"><strong>{waiting.length} {waiting.length === 1 ? 'claim' : 'claims'}</strong> {waiting.length === 1 ? 'has' : 'have'} not been marked received.</p>
      <input value={receiver} onChange={(event) => setReceiver(event.target.value)} placeholder="Your name (optional)" aria-label="Your name" className={`${field} w-52`} />
      <button onClick={() => void mark(waiting.map((claim) => claim.id), true)} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCheck className="h-4 w-4" />Mark {waiting.length} received</button></div>}
    <div className="grid gap-3 sm:grid-cols-3">{[['Claims sent to HR', claims ? String(shown.length) : '…'], ['Total claimed', claims ? rm(claimTotal(entries)) : '…'], ['Total approved', claims ? rm(approvedTotal(entries)) : '…']].map(([label, value]) => <div key={label} className={card}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-3xl font-semibold text-[#0b587b]">{value}</p></div>)}</div>
    <section className={`${card} overflow-x-auto`}>
      {!claims ? <p className="text-sm text-slate-500">Loading…</p> : !shown.length ? <p className="text-sm text-slate-500">{claims.length ? 'No claim matches these filters.' : `Nothing has been sent to HR for ${month === 'all' ? 'any month' : monthLabel(month)} yet. Clinical Admin sends approved claims from Staff incentives.`}</p> :
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="py-2 pr-4 font-semibold">Staff</th><th className="py-2 pr-4 font-semibold">Month</th><th className="py-2 pr-4 text-right font-semibold">Entries</th><th className="py-2 pr-4 text-right font-semibold">Claimed (RM)</th><th className="py-2 pr-4 text-right font-semibold">Approved (RM)</th><th className="py-2 pr-4 font-semibold">Approved by</th><th className="py-2 pr-4 font-semibold">Sent to HR</th><th className="py-2 font-semibold">HR</th></tr></thead>
          <tbody>{shown.map((claim) => <Fragment key={claim.id}>
            <tr onClick={() => setOpenId(openId === claim.id ? '' : claim.id)} className="cursor-pointer border-b border-slate-50 hover:bg-[#f4fafd]">
              <td className="py-3 pr-4"><p className="flex items-center gap-1.5 font-semibold"><ChevronDown className={`h-4 w-4 text-slate-300 transition ${openId === claim.id ? 'rotate-180' : ''}`} />{claim.staffName}</p><p className="ml-5 text-xs text-slate-400">{claim.branch} · {claim.staffCode}</p></td>
              <td className="py-3 pr-4">{monthLabel(claim.month)}</td><td className="py-3 pr-4 text-right">{claim.entries.length}</td><td className="py-3 pr-4 text-right">{claimTotal(claim.entries).toFixed(2)}</td><td className="py-3 pr-4 text-right font-semibold text-emerald-700">{approvedTotal(claim.entries).toFixed(2)}</td>
              <td className="py-3 pr-4 text-xs text-slate-600">{claim.approvedBy}</td><td className="py-3 text-xs text-slate-600">{sent(claim)}{claim.hrSubmittedBy ? <span className="block text-slate-400">by {claim.hrSubmittedBy}</span> : null}</td>
              <td className="py-3 pr-4 text-xs" onClick={(event) => event.stopPropagation()}>{claim.hrReceivedAt
                ? <span><span className="inline-block rounded-full bg-teal-50 px-2.5 py-1 font-bold text-teal-700">Received {new Date(claim.hrReceivedAt).toLocaleDateString('en-GB')}</span>{claim.hrReceivedBy && <span className="block text-slate-400">by {claim.hrReceivedBy}</span>}<button onClick={() => void mark([claim.id], false)} disabled={busy} className="mt-1 inline-flex items-center gap-1 text-slate-400 hover:text-rose-600 disabled:opacity-50"><Undo2 className="h-3 w-3" />Undo</button></span>
                : <button onClick={() => void mark([claim.id], true)} disabled={busy} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">Mark received</button>}</td>
            </tr>
            {openId === claim.id && <tr><td colSpan={8} className="bg-slate-50/60 px-4 py-3"><table className="w-full text-xs"><thead className="text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="py-1 text-left">Date</th><th className="text-left">Patient</th><th className="text-left">Code</th><th className="text-right">RM</th><th className="text-right">Clinic check</th></tr></thead>
              <tbody>{claim.entries.map((entry) => <tr key={entry.id} className={entry.review === 'rejected' ? 'text-slate-400 line-through' : ''}><td className="py-1">{dmy(entry.date)}</td><td>{entry.patient || '—'}</td><td><span className="font-mono font-bold text-[#0b587b]">{entry.code}</span> {codeName(entry.code)}</td><td className="text-right">{entry.rm.toFixed(2)}</td><td className="text-right no-underline">{entry.review === 'approved' ? '✓ Approved' : entry.review === 'rejected' ? '✗ Not approved' : ''}</td></tr>)}</tbody></table>
              {claim.adminNote && <p className="mt-2 text-xs text-slate-500">Clinical Admin note: {claim.adminNote}</p>}</td></tr>}
          </Fragment>)}</tbody>
        </table>}
    </section>
    {printing === 'pdf' && <PdfHint />}
    {printing && <PrintPortal>
      <PrintPage><MonthSummary claims={shown} title={`${branch || 'All branches'} · ${month === 'all' ? 'All months' : monthLabel(month)}`} /></PrintPage>
      {shown.map((claim) => <ClaimPages key={claim.id} claim={claim} />)}
    </PrintPortal>}
  </div>;
}
