import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, FileDown, Printer, RefreshCw, Send, Undo2, X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card, input } from './AssessmentStaff';
import { approvedTotal, claimTotal, codeName, dmy, IncentiveEntry, IncentiveStatus, monthLabel, rm, STATUS_LABEL, STATUS_TONE } from './lib/incentiveCodes';
import { ClaimPages, PdfHint, usePrintSheet } from './IncentiveSheet';
import { PrintPage, PrintPortal } from './PrintPortal';

// Clinical Admin side of the staff incentive claims: the branch's claims for a month,
// approved or returned to the staff member with a note. Loaded when the tab opens or
// Refresh is pressed; nothing polls.
const API = '/api/status?resource=clinical';
const APPROVER_KEY = 'ara_incentive_approver';
export type Claim = { hrSubmittedAt?: string | null; hrSubmittedBy?: string; hrReceivedAt?: string | null; hrReceivedBy?: string; id: string; month: string; branch: string; staffName: string; staffCode: string; entries: IncentiveEntry[]; status: IncentiveStatus; adminNote: string; approvedBy: string; submittedAt: string | null; decidedAt: string | null };

const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 7);
const shiftMonth = (month: string, by: number) => { const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by; return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`; };
// Statuses an admin acts on come first.
const ORDER: Record<IncentiveStatus, number> = { submitted: 0, returned: 1, approved: 2, draft: 3 };

// Every month from the memo's start (October 2026) up to this month, newest first.
const claimMonths = () => { const months: string[] = []; for (let month = thisMonth(); month >= '2026-10'; month = shiftMonth(month, -1)) months.push(month); return months; };

export default function ClinicalIncentives({ branch, branches, onError }: { key?: string; branch: string; branches: string[]; onError: (message: string) => void }) {
  // At the start of a month most claims being checked are last month's.
  const [month, setMonth] = useState(() => { const start = new Date().getDate() <= 10 ? shiftMonth(thisMonth(), -1) : thisMonth(); return start < '2026-10' ? '2026-10' : start; });
  // Accounts that see more than one branch can list them all together.
  const [branchFilter, setBranchFilter] = useState(branch);
  const [name, setName] = useState('');
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [openId, setOpenId] = useState('');
  const [printing, setPrinting] = useState<'' | 'print' | 'pdf'>('');
  const [sender, setSender] = useState(() => { try { return localStorage.getItem(APPROVER_KEY) || ''; } catch { return ''; } });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const months = claimMonths();

  const load = async () => {
    setClaims(null);
    try { setClaims((await (await officeFetch(`${API}&action=incentives&branch=${encodeURIComponent(branchFilter)}&month=${month}`)).json()).claims); }
    catch (cause) { setClaims([]); onError(cause instanceof Error ? cause.message : 'Unable to load claims.'); }
  };
  useEffect(() => { setOpenId(''); setNotice(''); void load(); }, [branchFilter, month]);
  // Approved claims of the month wait here until Clinical Admin sends them to HR.
  const toSend = month === 'all' ? [] : (claims || []).filter((claim) => claim.status === 'approved' && !claim.hrSubmittedAt);
  // Why nothing can be sent right now: claims must be approved first, and each is sent only once.
  const approvedCount = (claims || []).filter((claim) => claim.status === 'approved').length;
  const sendHint = !claims?.length ? `No claims for ${monthLabel(month)} yet.` : approvedCount ? `All ${approvedCount} approved ${approvedCount === 1 ? 'claim' : 'claims'} for ${monthLabel(month)} ${approvedCount === 1 ? 'has' : 'have'} been sent to HR.` : `Nothing to send to HR yet: approve a claim first (open it and tick every row). Approved claims can then be sent to HR from here.`;
  const sendToHr = async () => {
    if (!sender.trim()) { onError('Enter your name to send to HR.'); return; }
    if (!window.confirm(`Send ${toSend.length} approved ${toSend.length === 1 ? 'claim' : 'claims'} for ${monthLabel(month)} to HR?`)) return;
    setSending(true); setNotice('');
    try {
      const response = await officeFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'incentive_submit_hr', branch: branchFilter, month, by: sender.trim() }) });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      try { localStorage.setItem(APPROVER_KEY, sender.trim()); } catch { /* remembering the name is optional */ }
      setNotice(`Sent ${result.sent} ${result.sent === 1 ? 'claim' : 'claims'} to HR.`); await load();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to send to HR.'); }
    finally { setSending(false); }
  };
  // Hooks must run on every render, so this comes before the early return below.
  usePrintSheet(Boolean(printing), `Incentive Claims - ${branchFilter === 'all' ? 'All branches' : branchFilter} - ${month === 'all' ? 'All months' : month}`, () => setPrinting(''));

  const open = claims?.find((claim) => claim.id === openId);
  if (open) return <ClaimDetail key={open.id} claim={open} onBack={() => { setOpenId(''); void load(); }} onDecided={async () => { await load(); }} onError={onError} />;

  const words = name.toLowerCase().split(/\s+/).filter(Boolean);
  const sorted = (claims || []).filter((claim) => words.every((word) => `${claim.staffName} ${claim.staffCode}`.toLowerCase().includes(word)))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.month.localeCompare(a.month) || a.staffName.localeCompare(b.staffName));
  const waiting = sorted.filter((claim) => claim.status === 'submitted').length;
  const field = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-[#0b587b]/10';
  const label = month === 'all' ? 'any month' : monthLabel(month);
  return <div className="mx-auto max-w-[1500px] space-y-6">
    <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#70d8fa]">{branchFilter === 'all' ? 'All branches' : branchFilter} · Staff incentives</p><h2 className="mt-3 text-3xl font-semibold">Incentive claims</h2><p className="mt-3 text-[#b9cfdd]">Staff record their procedures on their own phones (Incentive Claims on the AraOffice sign-in page) and submit at month end. Check each row, then approve the month or return it with a note to be fixed.</p></section>
    <section className={`${card} space-y-4`}>
      <div className={`grid gap-3 ${branches.length > 1 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Staff name</span><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && setName('')} placeholder="Search name or staff code" className={field} /></label>
        {branches.length > 1 && <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Branch</span><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className={field}><option value="all">All branches</option>{branches.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Month</span><select value={month} onChange={(event) => setMonth(event.target.value)} className={field}><option value="all">All months</option>{months.map((item) => <option key={item} value={item}>{monthLabel(item)}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-slate-500">{claims ? `${sorted.length} ${sorted.length === 1 ? 'claim' : 'claims'}${waiting ? ` · ${waiting} waiting for approval` : ''}${sorted.length !== claims.length ? ` (of ${claims.length})` : ''}` : 'Loading…'}</span>
        <button onClick={() => setPrinting('pdf')} disabled={!sorted.length} title="A summary page, then one page per staff member" className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0a4b69] disabled:opacity-40"><FileDown className="h-3.5 w-3.5" />Save PDF ({sorted.length})</button>
        <button onClick={() => setPrinting('print')} disabled={!sorted.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Printer className="h-3.5 w-3.5" />Print all</button>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" />Refresh</button></div>
      {month !== 'all' && claims && <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#f4fafd] p-4">
        {toSend.length > 0 ? <><p className="min-w-[200px] flex-1 text-sm text-slate-700"><strong>{toSend.length} approved {toSend.length === 1 ? 'claim' : 'claims'}</strong> for {monthLabel(month)} not sent to HR yet.</p>
          <input value={sender} onChange={(event) => setSender(event.target.value)} placeholder="Your name" aria-label="Your name" className="h-10 w-44 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
          <button onClick={() => void sendToHr()} disabled={sending} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white hover:bg-[#0a4b69] disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Sending…' : `Send ${toSend.length} to HR`}</button></> : <p className={`text-sm ${notice ? 'font-semibold text-emerald-700' : 'text-slate-600'}`}>{notice || sendHint}</p>}
      </div>}
    </section>
    {claims && !sorted.length && <p className={`${card} text-sm text-slate-500`}>{claims.length ? `No claims match “${name.trim()}”.` : `No claims for ${label} yet.`}</p>}
    {sorted.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sorted.map((claim) => <button key={claim.id} onClick={() => setOpenId(claim.id)} className={`${card} text-left transition hover:-translate-y-0.5 hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{claim.staffName}</p><p className="mt-0.5 text-xs text-slate-400"><span className="font-mono">{claim.staffCode}</span>{branchFilter === 'all' ? ` · ${claim.branch}` : ''}{month === 'all' ? ` · ${monthLabel(claim.month)}` : ''}</p></div><span className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[claim.status]}`}>{STATUS_LABEL[claim.status]}</span>{claim.hrSubmittedAt && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${claim.hrReceivedAt ? 'bg-teal-50 text-teal-700' : 'bg-violet-50 text-violet-700'}`}>{claim.hrReceivedAt ? 'Received by HR' : 'Sent to HR'}</span>}</span></div>
      <p className="mt-4 text-2xl font-semibold">{rm(claim.status === 'approved' ? approvedTotal(claim.entries) : claimTotal(claim.entries))}</p>
      <p className="mt-1 text-xs text-slate-500">{claim.entries.length} entries{claim.submittedAt ? ` · submitted ${new Date(claim.submittedAt).toLocaleDateString('en-GB')}` : ''}</p>
    </button>)}</div>}
    {printing === 'pdf' && <PdfHint />}
    {printing && <PrintPortal>
      <PrintPage><MonthSummary claims={sorted} title={`${branchFilter === 'all' ? 'All branches' : branchFilter} · ${month === 'all' ? 'All months' : monthLabel(month)}`} /></PrintPage>
      {sorted.map((claim) => <ClaimPages key={claim.id} claim={claim} />)}
    </PrintPortal>}
  </div>;
}

function ClaimDetail({ claim, onBack, onDecided, onError }: { key?: string; claim: Claim; onBack: () => void; onDecided: () => Promise<void>; onError: (message: string) => void }) {
  const [approver, setApprover] = useState(() => { try { return localStorage.getItem(APPROVER_KEY) || ''; } catch { return ''; } });
  const [note, setNote] = useState(claim.adminNote);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  // Each row is checked (✓ or ✗) before the month is approved; every press is saved straight away.
  const [entries, setEntries] = useState(claim.entries);
  // Saves still on their way to the server; Approve waits for them.
  const [marking, setMarking] = useState(0);
  const total = claimTotal(entries);
  const approved = approvedTotal(entries);
  const unchecked = entries.filter((entry) => !entry.review).length;
  const rejectedCount = entries.filter((entry) => entry.review === 'rejected').length;
  const open = claim.status !== 'approved';

  usePrintSheet(printing, `Incentive Claim - ${claim.staffName} - ${claim.branch} - ${claim.month}`, () => { setPrinting(false); setSavingPdf(false); });

  const post = (body: Record<string, unknown>) => officeFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  // Pressing the chosen mark again clears it back to "not checked". The mark shows at once and
  // is saved in the background; saves go one after another (the server rewrites the whole
  // claim each time), and if one fails the rows go back to what the server holds.
  const queue = useRef(Promise.resolve());
  const applyMark = (list: IncentiveEntry[], entryId: string, review: 'approved' | 'rejected' | null) => list.map((entry) => {
    if (entryId === '*' ? entry.review : entry.id !== entryId) return entry;
    const { review: _previous, ...rest } = entry;
    return review ? { ...rest, review } : rest;
  });
  const mark = (entryId: string, review: 'approved' | 'rejected' | null) => {
    setEntries((current) => applyMark(current, entryId, review));
    setMarking((count) => count + 1);
    queue.current = queue.current.then(async () => {
      try { await post({ action: 'incentive_entry', id: claim.id, entryId, review }); }
      catch (cause) {
        onError(cause instanceof Error ? cause.message : 'Unable to save.');
        try { setEntries((await (await officeFetch(`${API}&action=incentives&branch=${encodeURIComponent(claim.branch)}&month=${claim.month}`)).json()).claims.find((item: Claim) => item.id === claim.id)?.entries || claim.entries); } catch { /* keep what is shown */ }
      } finally { setMarking((count) => count - 1); }
    });
  };
  const sendThisToHr = async () => {
    if (!approver.trim()) { onError('Enter your name to send to HR.'); return; }
    setSaving(true);
    try {
      const response = await post({ action: 'incentive_submit_hr', id: claim.id, branch: claim.branch, month: claim.month, by: approver.trim() });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      try { localStorage.setItem(APPROVER_KEY, approver.trim()); } catch { /* remembering the name is optional */ }
      await onDecided();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to send to HR.'); }
    finally { setSaving(false); }
  };
  const decide = async (decision: 'approve' | 'return') => {
    if (decision === 'return' && !note.trim()) { onError('Write a note telling the staff member what to fix.'); return; }
    if (decision === 'approve' && !approver.trim()) { onError('Enter your name for "Approved by".'); return; }
    if (decision === 'approve' && claim.status !== 'submitted' && !window.confirm(`${claim.staffName} has not submitted this claim yet. Approve ${monthLabel(claim.month)} now? They will not be able to add more entries.`)) return;
    setSaving(true);
    try {
      await post({ action: 'incentive_decide', id: claim.id, decision, approvedBy: approver.trim(), note: note.trim() });
      try { localStorage.setItem(APPROVER_KEY, approver.trim()); } catch { /* remembering the name is optional */ }
      await onDecided();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    finally { setSaving(false); }
  };

  const markButton = (entry: IncentiveEntry, review: 'approved' | 'rejected') => {
    const chosen = entry.review === review;
    const tone = review === 'approved' ? (chosen ? 'bg-emerald-600 text-white' : 'border border-slate-200 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700') : (chosen ? 'bg-rose-600 text-white' : 'border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-700');
    return <button onClick={() => mark(entry.id, chosen ? null : review)} title={review === 'approved' ? 'Approve' : 'Do not approve'} aria-label={review === 'approved' ? 'Approve entry' : 'Do not approve entry'} aria-pressed={chosen} className={`grid h-8 w-8 place-items-center rounded-lg transition disabled:opacity-50 ${tone}`}>{review === 'approved' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}</button>;
  };

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe]"><ArrowLeft className="h-4 w-4" />All claims</button><span className="flex flex-wrap items-center gap-2"><button onClick={() => { setSavingPdf(true); setPrinting(true); }} title="Opens the print window: choose “Save as PDF” as the printer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><FileDown className="h-4 w-4" />Save PDF</button><button onClick={() => setPrinting(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><Printer className="h-4 w-4" />Print</button></span></div>
    <section className="rounded-[28px] bg-[#0b3d59] px-7 py-6 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#70d8fa]">{claim.branch} · {monthLabel(claim.month)}</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{claim.staffName}</h2><p className="mt-2 text-[#b9cfdd]"><span className={`mr-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[claim.status]}`}>{STATUS_LABEL[claim.status]}</span>{entries.length} entries · {rm(total)} claimed{claim.approvedBy ? ` · approved by ${claim.approvedBy}` : ''}</p></section>
    {claim.status === 'returned' && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">Returned to {claim.staffName}: {claim.adminNote}</p>}
    <section className={`${card} overflow-x-auto`}>
      {open && entries.length > 0 && <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{unchecked ? <><strong className="text-amber-700">{unchecked} of {entries.length}</strong> rows not checked yet. Tick ✓ to approve or ✗ to not approve each row.</> : <span className="font-semibold text-emerald-700">Every row has been checked.</span>}</p>{unchecked > 0 && <button onClick={() => mark('*', 'approved')} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">✓ Approve all {unchecked} unchecked rows</button>}</div>}
      <table className="w-full min-w-[720px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="py-2 pr-3">Date</th><th className="pr-3">Patient</th><th className="pr-3">Clinic ID</th><th className="pr-3">Outstanding</th><th className="pr-3">Code</th><th className="pr-3 text-right">RM</th><th className="text-center">Approve</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{entries.map((entry) => {
          const rejected = entry.review === 'rejected';
          return <tr key={entry.id} className={rejected ? 'bg-rose-50/40 text-slate-400' : entry.review === 'approved' ? 'bg-emerald-50/30' : ''}>
            <td className={`whitespace-nowrap py-2.5 pr-3 ${rejected ? 'line-through' : ''}`}>{dmy(entry.date)}</td><td className={`pr-3 ${rejected ? 'line-through' : ''}`}>{entry.patient || '—'}</td><td className={`pr-3 font-mono text-xs ${rejected ? 'line-through' : ''}`}>{entry.clinicId || '—'}</td><td className="pr-3 text-xs">{entry.outstanding || ''}</td>
            <td className={`pr-3 ${rejected ? 'line-through' : ''}`}><span className="font-mono text-xs font-bold text-[#0b587b]">{entry.code}</span> <span className="text-xs text-slate-500">{codeName(entry.code)}</span></td>
            <td className={`pr-3 text-right font-semibold ${rejected ? 'line-through' : ''}`}>{entry.rm.toFixed(2)}</td>
            <td className="whitespace-nowrap py-1.5 text-center">{open
              ? <span className="inline-flex gap-1">{markButton(entry, 'approved')}{markButton(entry, 'rejected')}</span>
              : <span className={`text-xs font-bold ${rejected ? 'text-rose-600' : 'text-emerald-600'}`}>{rejected ? '✗ Not approved' : '✓ Approved'}</span>}</td>
          </tr>;
        })}</tbody>
        <tfoot><tr className="border-t-2 border-slate-200"><td colSpan={5} className="pt-3 text-right font-semibold">Total claimed incentives</td><td className="pr-3 pt-3 text-right font-semibold">{total.toFixed(2)}</td><td /></tr>
          <tr><td colSpan={5} className="pb-3 text-right font-semibold text-emerald-700">Total approved{rejectedCount ? ` (${rejectedCount} not approved)` : ''}{unchecked && open ? ` · ${unchecked} not checked` : ''}</td><td className="pr-3 pb-3 text-right text-lg font-semibold text-emerald-700">{approved.toFixed(2)}</td><td /></tr></tfoot>
      </table>
    </section>
    <section className={`${card} space-y-4`}>
      <h3 className="font-semibold">{open ? `Approve ${monthLabel(claim.month)}` : `${monthLabel(claim.month)} approved`}</h3>
      {open && claim.status !== 'submitted' && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{claim.staffName} has not submitted this claim yet{claim.status === 'returned' ? ' (it was returned to fix)' : ''}. Approving it locks it, so they cannot add more entries.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {(open || (claim.status === 'approved' && !claim.hrSubmittedAt)) && <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">{open ? 'Approved by' : 'Your name (sent by)'}</span><input value={approver} onChange={(event) => setApprover(event.target.value)} placeholder="Your name" className={input} /></label>}
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Note to staff {open ? '(needed to return)' : '(why it is being returned)'}</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. 12/10 DXT entered twice" className={input} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {open && <button onClick={() => void decide('approve')} disabled={saving || marking > 0 || unchecked > 0 || !entries.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" />Approve {monthLabel(claim.month)} · {rm(approved)}</button>}
        {claim.status === 'approved' && !claim.hrSubmittedAt && <button onClick={() => void sendThisToHr()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4b69] disabled:opacity-50"><Send className="h-4 w-4" />Send to HR</button>}
        {claim.hrSubmittedAt && <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${claim.hrReceivedAt ? 'bg-teal-50 text-teal-700' : 'bg-violet-50 text-violet-700'}`}>{claim.hrReceivedAt ? `Received by HR ${new Date(claim.hrReceivedAt).toLocaleDateString('en-GB')}${claim.hrReceivedBy ? ` · ${claim.hrReceivedBy}` : ''}` : `Sent to HR ${new Date(claim.hrSubmittedAt).toLocaleDateString('en-GB')}${claim.hrSubmittedBy ? ` · ${claim.hrSubmittedBy}` : ''}`}</span>}
        {!claim.hrReceivedAt && <button onClick={() => void decide('return')} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"><Undo2 className="h-4 w-4" />Return to staff</button>}
        {open && unchecked > 0 && <span className="text-xs text-amber-700">Check every row first ({unchecked} left).</span>}{marking > 0 && <span className="text-xs text-slate-500">Saving ticks…</span>}
      </div>
    </section>
    {savingPdf && printing && <PdfHint />}
    {printing && <PrintPortal><ClaimPages claim={{ ...claim, entries }} /></PrintPortal>}
  </div>;
}

// First page of a whole-month PDF: one line per claim.
export function MonthSummary({ claims, title }: { claims: Claim[]; title: string }) {
  const cell = 'border border-black px-[1.5mm] py-[1mm]';
  return <div className="cv-fit text-[9.5pt]">
    <div className="flex items-center gap-[4mm]"><img src="/forms/ara-logo.jpg" alt="" className="h-[16mm] w-[16mm] object-contain" /><div><p className="text-[13pt] font-bold">KLINIK ARA 24 JAM · STAFF INCENTIVES</p><p className="text-[11pt]">Summary · {title}</p></div></div>
    <table className="mt-[4mm] w-full border-collapse"><thead><tr className="font-bold"><th className={cell}>No.</th><th className={cell}>Staff name</th><th className={cell}>Code</th><th className={cell}>Branch</th><th className={cell}>Month</th><th className={cell}>Entries</th><th className={cell}>Claimed (RM)</th><th className={cell}>Approved (RM)</th><th className={cell}>Status</th><th className={cell}>Approved by</th></tr></thead>
      <tbody>{claims.map((claim, index) => <tr key={claim.id}><td className={`${cell} text-center`}>{index + 1}</td><td className={cell}>{claim.staffName}</td><td className={cell}>{claim.staffCode}</td><td className={cell}>{claim.branch}</td><td className={cell}>{monthLabel(claim.month)}</td><td className={`${cell} text-center`}>{claim.entries.length}</td><td className={`${cell} text-right`}>{claimTotal(claim.entries).toFixed(2)}</td><td className={`${cell} text-right`}>{approvedTotal(claim.entries).toFixed(2)}</td><td className={cell}>{STATUS_LABEL[claim.status]}</td><td className={cell}>{claim.approvedBy}</td></tr>)}</tbody>
      <tfoot><tr className="font-bold"><td colSpan={6} className={`${cell} text-right`}>Total</td><td className={`${cell} text-right`}>{claimTotal(claims.flatMap((claim) => claim.entries)).toFixed(2)}</td><td className={`${cell} text-right`}>{approvedTotal(claims.flatMap((claim) => claim.entries)).toFixed(2)}</td><td colSpan={2} className={cell} /></tr></tfoot>
    </table>
    <p className="mt-[3mm] text-[8pt]">Printed {new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' })}. Approved (RM) counts only rows ticked ✓ by the Clinical Admin.</p>
  </div>;
}
