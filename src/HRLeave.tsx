import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Search, Tags, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { HRLeaveStaff } from './HRLeaveStaff';
import { HRLeaveReport } from './HRLeaveReport';

// Office HR: every leave request made from Individual Sign In, with where each one is in the two-level approval
// (supervisor first, then the final approver). Read only: staff apply and approvers decide in Individual Sign In.
type Request = { id: string; company: string; code: string; applicant: string; type: string; group: string; start: string; end: string; half: 'AM' | 'PM' | null; days: number; reason: string; status: 'pending' | 'supervisor_approved' | 'approved' | 'rejected' | 'cancelled'; supervisor: string; backupApprover: string; finalApprover: string; supervisorBy: string; supervisorNote: string; decidedBy: string; note: string; createdAt: string };
const LABEL: Record<Request['status'], string> = { pending: 'Waiting for supervisor', supervisor_approved: 'Waiting for final approver', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };
const TONE: Record<Request['status'], string> = { pending: 'bg-amber-50 text-amber-700', supervisor_approved: 'bg-sky-50 text-sky-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', cancelled: 'bg-slate-100 text-slate-500' };
const imported = (row: Request) => row.note.startsWith('Imported from Infotech');
const dmy = (date: string) => date.split('-').reverse().join('/');
const range = (r: Request) => r.start === r.end ? `${dmy(r.start)}${r.half ? ` (${r.half})` : ''}` : `${dmy(r.start)} – ${dmy(r.end)}`;
const days = (value: number) => String(Math.round(value * 10) / 10);

export function HRLeave({ onError, onTypes }: { onError: (message: string) => void; onTypes: () => void }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<Request[] | null>(null);
  const [status, setStatus] = useState('');
  const [company, setCompany] = useState('');
  const [month, setMonth] = useState(''); // 1-12, or '' for the whole year
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    setRows(null); setMonth('');
    officeFetch(`/api/status?resource=hr&action=leave_requests&year=${year}`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setRows(result.requests); })
      .catch((cause: Error) => { setRows([]); onError(cause.message); });
  }, [year]);

  const [removing, setRemoving] = useState('');
  const [tab, setTab] = useState<'requests' | 'staff' | 'year_end' | 'reports'>('requests');
  // Deleting is final: approved leave that AraOffice took off the balance goes back on it; the person's HR history records it.
  const remove = async (row: Request) => {
    const note = row.status === 'approved' && !imported(row) ? ` The ${days(row.days)} day(s) go back on ${row.applicant}'s balance.` : imported(row) ? ' This was imported from Infotech, so no balance changes.' : '';
    if (!window.confirm(`Delete ${row.applicant}'s ${row.type} leave (${range(row)})?${note} This cannot be undone.`)) return;
    setRemoving(row.id);
    try {
      const response = await officeFetch('/api/status?resource=hr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'leave_delete', id: row.id }) });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      setRows((current) => (current || []).filter((item) => item.id !== row.id));
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to delete.'); }
    setRemoving('');
  };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  // A request belongs to a month when any of its days falls in that month.
  const monthStart = month ? `${year}-${month.padStart(2, '0')}-01` : '', monthEnd = month ? `${year}-${month.padStart(2, '0')}-31` : '';
  const inScope = (row: Request) => (!company || row.company === company) && (!month || (row.start <= monthEnd && row.end >= monthStart));
  const count = (status: Request['status']) => (rows || []).filter((row) => inScope(row) && row.status === status).length;
  const onLeaveToday = (rows || []).filter((row) => row.status === 'approved' && row.start <= today && row.end >= today);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => (rows || []).filter((row) => (!status || row.status === status) && inScope(row) && words.every((word) => `${row.applicant} ${row.code} ${row.type}`.toLowerCase().includes(word))), [rows, status, company, query, month, year]);
  // 20 requests to a page; a new filter, search, year or month goes back to the first page.
  const PAGE_SIZE = 20;
  useEffect(() => { setPage(1); }, [status, company, month, query, year]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const goTo = (next: number) => { setPage(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const numbers = Array.from({ length: pages }, (_, index) => index + 1).filter((number) => pages <= 7 || number === 1 || number === pages || Math.abs(number - current) <= 1);
  const tiles: [string, number, string][] = [['Waiting for supervisor', count('pending'), 'text-amber-600'], ['Waiting for final approver', count('supervisor_approved'), 'text-sky-600'], ['Approved', count('approved'), 'text-emerald-600'], ['On leave today', onLeaveToday.length, 'text-[#0b587b]']];

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Leave</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Every leave request from Individual Sign In. Each goes to the staff member's supervisor first, then to the final approver, and the balance only comes off after the final approval.</p></div>
        <button onClick={onTypes} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-white/12 px-5 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/20"><Tags className="h-4 w-4" />Leave types</button>
      </div>
    </section>
    <div role="tablist" className="inline-flex flex-wrap rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-100">{([['requests', 'Leave requests'], ['staff', 'Staff leave'], ['year_end', 'Leave year end'], ['reports', 'Reports']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${tab === id ? 'bg-[#0b587b] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div>
    {tab === 'staff' ? <HRLeaveStaff onError={onError} /> : tab === 'reports' ? <HRLeaveReport onError={onError} /> : tab === 'year_end' ? <YearEndPanel onError={onError} /> : <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tiles.map(([label, value, tone]) => <div key={label} className={card}><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-1 text-3xl font-semibold ${tone}`}>{rows ? value : '…'}</p></div>)}</div>
    {onLeaveToday.length > 0 && <p className="rounded-xl bg-[#f4fafd] p-3 text-sm text-slate-700"><strong className="text-[#0b587b]">On leave today:</strong> {onLeaveToday.map((row) => `${row.applicant} (${row.type})`).join(', ')}</p>}
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, staff code or leave type" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm" /></div>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All statuses</option>{(Object.keys(LABEL) as Request['status'][]).map((key) => <option key={key} value={key}>{LABEL[key]}</option>)}</select>
      <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Company" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      <select value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Month" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All months</option>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1)}>{new Date(2026, index, 1).toLocaleDateString('en-GB', { month: 'long' })}</option>)}</select>
      <select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Year" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">{[thisYear + 1, thisYear, thisYear - 1].map((value) => <option key={value} value={value}>{value}</option>)}</select>
    </section>
    <section className={`${card} overflow-x-auto`}>
      {!rows ? <p className="text-sm text-slate-500">Loading…</p> : !shown.length ? <p className="text-sm text-slate-500">{rows.length ? 'No request matches these filters.' : `No leave requests in ${year} yet.`}</p> :
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="py-2 pr-4 font-semibold">Staff</th><th className="py-2 pr-4 font-semibold">Leave</th><th className="py-2 pr-4 font-semibold">Dates</th><th className="py-2 pr-4 font-semibold">Days</th><th className="py-2 pr-4 font-semibold">Status</th><th className="py-2 pr-4 font-semibold">Supervisor</th><th className="py-2 pr-4 font-semibold">Backup officer</th><th className="py-2 pr-4 font-semibold">Final approver</th><th className="py-2 font-semibold"><span className="sr-only">Delete</span></th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.id} className="border-b border-slate-50 align-top">
            <td className="py-3 pr-4"><p className="font-semibold">{row.applicant}</p><p className="text-xs text-slate-400">{row.company} · {row.code}</p></td>
            <td className="py-3 pr-4"><span className="font-mono text-xs font-bold text-[#0b587b]">{row.type}</span>{row.reason && <p className="mt-0.5 max-w-[220px] text-xs text-slate-500">{row.reason}</p>}</td>
            <td className="py-3 pr-4 whitespace-nowrap text-[#0b587b]">{range(row)}</td>
            <td className="py-3 pr-4">{days(row.days)}</td>
            <td className="py-3 pr-4"><span className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold ${TONE[row.status]}`}>{LABEL[row.status]}</span>{imported(row) && <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">From Infotech</span>}</td>
            <td className="py-3 pr-4 text-xs text-slate-600">{row.supervisor || <span className="text-slate-300">Not set</span>}{row.supervisorNote && <p className="mt-0.5 text-slate-400">“{row.supervisorNote}”</p>}</td>
            <td className="py-3 pr-4 text-xs text-slate-600">{row.backupApprover || <span className="text-slate-300">—</span>}</td>
            <td className="py-3 text-xs text-slate-600">{row.finalApprover || <span className="text-slate-300">{imported(row) ? '—' : 'None (supervisor is final)'}</span>}{row.note && !imported(row) && <p className="mt-0.5 text-slate-400">“{row.note}”</p>}</td>
            <td className="py-3 text-right"><button onClick={() => void remove(row)} disabled={removing === row.id} aria-label={`Delete ${row.applicant}'s leave`} title="Delete this leave request" className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></td>
          </tr>)}</tbody>
        </table>}
      {rows && pages > 1 && <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4" aria-label="Leave request pages">
        <p className="text-sm text-slate-500">Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, shown.length)} of {shown.length}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => goTo(current - 1)} disabled={current === 1} className="inline-flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>
          {numbers.map((number, index) => <span key={number} className="flex items-center gap-1.5">{index > 0 && number - numbers[index - 1] > 1 && <span className="text-slate-400">…</span>}<button onClick={() => goTo(number)} aria-current={number === current ? 'page' : undefined} className={`h-10 min-w-10 rounded-xl px-3 text-sm font-semibold ${number === current ? 'bg-[#0b587b] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{number}</button></span>)}
          <button onClick={() => goTo(current + 1)} disabled={current === pages} className="inline-flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button>
        </div>
      </nav>}
    </section>
    </>}
  </div>;
}

type YearEndRow = { employeeId: string; company: string; code: string; name: string; joinDate: string | null; track: string; annual: { eligible: number; broughtForward: number; calculatedCarry?: number; carryOverride?: { days: number; note: string } | null; sourceBalance: number | null; gcr?: { burn: number; bfExpired: number; eligibleUnused: number; paid: number; carry: number; qualifies: boolean; overLimit: number; limit: number; overdrawn: number } | null }; medical: { eligible: number; broughtForward: number; sourceBalance: number | null }; missingJoinDate: boolean; missingAnnual: boolean; missingMedical: boolean; missingPolicy: boolean };
type YearEndPreview = { targetYear: number; sourceYear: number; rows: YearEndRow[]; pending: { id: string; employee_id: string; leave_type: string; start_date: string; end_date: string; status: string }[]; closure: null | { target_year: number; source_year: number; bf_expiry: string; staff_count: number; processed_at: string } };
async function hrLeaveApi(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return response.json();
}
// The "Carried over" figure for one staff member: the calculated number, which HR can change (management approval) and explain.
function CarryCell({ row, year, onChanged, onError }: { row: YearEndRow; year: number; onChanged: () => void; onError: (message: string) => void }) {
  const calculated = row.annual.calculatedCarry ?? row.annual.broughtForward;
  const [value, setValue] = useState(String(row.annual.broughtForward));
  const [note, setNote] = useState(row.annual.carryOverride?.note || '');
  useEffect(() => { setValue(String(row.annual.broughtForward)); setNote(row.annual.carryOverride?.note || ''); }, [row.annual.broughtForward, row.annual.carryOverride?.note]);
  const changed = row.annual.carryOverride != null;
  const save = async (nextValue: string, nextNote: string) => {
    const number = Number(nextValue);
    if (nextValue.trim() === '' || !Number.isFinite(number)) { setValue(String(row.annual.broughtForward)); return; }
    const same = Math.abs(number - calculated) < 0.005;
    if (same && !changed) return;
    try { const result = await hrLeaveApi('action=leave_carry_override', { employeeId: row.employeeId, year, days: same ? null : number, note: nextNote }); if (result.error) throw new Error(result.error); onChanged(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); setValue(String(row.annual.broughtForward)); }
  };
  return <div className="flex min-w-[150px] flex-col items-end gap-1">
    <input type="number" min="0" max="100" step="0.5" value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => void save(value, note)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-label={`Days carried over for ${row.name}`} className={`h-8 w-20 rounded-lg border px-2 text-right text-sm font-bold tabular-nums ${changed ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-[#0b587b]'}`} />
    {changed && <><input value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => void save(value, note)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} placeholder="Reason (approval)" maxLength={200} className="h-7 w-36 rounded-lg border border-amber-200 bg-white px-2 text-[11px]" /><span className="text-[10px] text-amber-700">calculated {days(calculated)} · edited</span></>}
  </div>;
}

function YearEndPanel({ onError }: { onError: (message: string) => void }) {
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [expiry, setExpiry] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [loadError, setLoadError] = useState('');
  const load = () => hrLeaveApi('action=leave_year_end_preview').then((data) => { if (data.error) throw new Error(data.error); setPreview(data); setLoadError(''); setDone(''); }).catch((cause: Error) => { setLoadError(cause.message); onError(cause.message); });
  useEffect(() => { void load(); }, []);
  const process = async () => {
    if (!preview || preview.targetYear > Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4)) || preview.closure || preview.pending.length || preview.rows.some((row) => row.missingJoinDate || row.missingAnnual || row.missingMedical) || !expiry || !backupConfirmed) return;
    if (!window.confirm(`Process ${preview.sourceYear} → ${preview.targetYear} for ${preview.rows.length} active staff? This creates their new Annual and Medical Leave balances and locks the ${preview.sourceYear} cycle. This cannot be undone.`)) return;
    setSaving(true);
    try { const result = await hrLeaveApi('action=leave_year_end_process', { targetYear: preview.targetYear, bfExpiry: expiry }); if (result.error) throw new Error(result.error); setDone(`Year ${result.sourceYear} is closed. Year ${result.targetYear} balances were created for ${result.staffCount} staff.`); await load(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to process Leave Year End.'); }
    finally { setSaving(false); }
  };
  if (!preview) return <p className={`${card} text-sm ${loadError ? 'text-rose-700' : 'text-slate-500'}`}>{loadError || 'Loading Year End preview…'}</p>;
  const currentYear = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4));
  const blocked = preview.targetYear > currentYear || preview.pending.length > 0 || preview.rows.some((row) => row.missingJoinDate || row.missingAnnual || row.missingMedical) || preview.closure !== null;
  return <div className="space-y-5">
    <section className="ara-hero rounded-[28px] p-6 text-white sm:p-8"><div className="flex items-start gap-4"><CalendarDays className="mt-1 h-6 w-6 shrink-0 text-[#70d8fa]" /><div><h3 className="text-xl font-semibold">Leave Year End · {preview.sourceYear} → {preview.targetYear}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-[#b9cfdd]">Review the projected Annual Leave (AL) and Medical Leave (ML) entitlement and bring-forward figures. Every pending request dated in {preview.sourceYear} must be approved, rejected, or cancelled first. Processing locks the old year.</p></div></div></section>
    {preview.closure && <p className={`${card} bg-emerald-50 text-sm text-emerald-800`}>Year {preview.sourceYear} was closed on {new Date(preview.closure.processed_at).toLocaleDateString('en-MY')}. BF expires {preview.closure.bf_expiry}.</p>}
    {preview.pending.length > 0 && <p className={`${card} border border-amber-200 bg-amber-50 text-sm text-amber-800`}>Year End is blocked: {preview.pending.length} leave request(s) from {preview.sourceYear} are still waiting for a decision.</p>}
    {preview.rows.some((row) => row.missingJoinDate) && <p className={`${card} border border-rose-200 bg-rose-50 text-sm text-rose-800`}>Add a join date to every active staff profile before processing the new year.</p>}
    {preview.rows.some((row) => row.missingPolicy) && <p className={`${card} border border-sky-100 bg-sky-50 text-sm text-sky-800`}>{preview.rows.filter((row) => row.missingPolicy).length} staff have no saved leave category yet. Process saves one for them automatically (worked out from their entitlement and job), so nothing needs to be done first. You can still change a category under Leave → Staff leave → Company policy.</p>}
    {preview.targetYear > currentYear && <p className={`${card} border border-sky-100 bg-sky-50 text-sm text-sky-800`}>You can review the {preview.targetYear} cycle now. Processing opens on 1 January {preview.targetYear}, after the {preview.sourceYear} cycle ends.</p>}
    {preview.rows.some((row) => row.missingAnnual || row.missingMedical) && <p className={`${card} border border-rose-200 bg-rose-50 text-sm text-rose-800`}>Set up both previous-year AL and ML balances for every active staff member under Leave → Staff leave before processing. Year End is blocked while any previous-year balance is missing.</p>}
    {done && <p className={`${card} bg-emerald-50 text-sm text-emerald-800`}>{done}</p>}
    {!preview.closure && <section className={`${card} flex flex-wrap items-end gap-4`}><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">BF expiry date for the new cycle</span><input type="date" value={expiry} min={`${preview.targetYear}-01-01`} max={`${preview.targetYear}-12-31`} onChange={(event) => setExpiry(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" /></label><span className="max-w-xl text-xs leading-5 text-slate-500">Set this to the BF expiry date confirmed in Infotech/company policy. HR chooses the date before processing.</span><label className="flex items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={backupConfirmed} onChange={(event) => setBackupConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />I have backed up the current leave records.</label><button onClick={() => void load()} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-[#0b587b]">Refresh</button><button onClick={() => void process()} disabled={saving || blocked || !expiry || !backupConfirmed} className="ml-auto h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-bold text-white disabled:opacity-40">{saving ? 'Processing…' : `Process ${preview.targetYear}`}</button></section>}
    <section className={`${card} space-y-2 text-sm leading-6 text-slate-600`}>
      <p className="font-semibold text-slate-800">How each row is worked out</p>
      <p><strong>Leftover {preview.sourceYear}</strong> is the Annual Leave the staff member has left once the whole year is earned (before December it can be higher than the balance they can take today, because leave is earned month by month). From it we take away <span className="font-semibold text-rose-600">credit leave not used</span> (it burns on 31 December), <span className="font-semibold text-rose-600">old brought-forward not used</span> (it expires with its cycle), the days <span className="font-semibold text-rose-600">paid as GCR</span> (set under Reports → GCR), and anything <span className="font-semibold text-rose-600">over the carry limit</span>. What remains is <strong className="text-[#0b587b]">carried to {preview.targetYear}</strong>. HR can change that number for anyone (management approval) and write the reason; it turns amber and is what Process uses. Their new {preview.targetYear} Annual Leave is the <strong>{preview.targetYear} entitlement</strong> from company policy plus what is carried. Medical Leave does not carry forward.</p>
    </section>
    <section className={`${card} overflow-x-auto`}><table className="w-full min-w-[1000px] text-left text-sm"><thead>
      <tr className="text-[11px] font-bold uppercase tracking-wider"><th className="py-2 pr-4" /><th colSpan={5} className="border-l border-slate-100 px-3 py-2 text-center text-slate-500">{preview.sourceYear} Annual Leave: what happens to the leftover</th><th colSpan={3} className="border-l border-slate-100 px-3 py-2 text-center text-[#0b587b]">{preview.targetYear} Annual Leave</th><th className="border-l border-slate-100 px-3 py-2 text-center text-teal-700">Medical</th></tr>
      <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="py-2 pr-4">Staff</th><th className="border-l border-slate-100 px-3 py-2 text-right">Leftover {preview.sourceYear}</th><th className="px-3 py-2 text-right">− Credit burns</th><th className="px-3 py-2 text-right">− Old BF expires</th><th className="px-3 py-2 text-right">− GCR paid</th><th className="px-3 py-2 text-right">− Over limit</th><th className="border-l border-slate-100 px-3 py-2 text-right text-[#0b587b]">Carried over</th><th className="px-3 py-2 text-right">New entitlement</th><th className="px-3 py-2 text-right text-[#0b587b]">{preview.targetYear} total</th><th className="border-l border-slate-100 px-3 py-2 text-right">{preview.targetYear} entitlement</th></tr>
    </thead><tbody>{preview.rows.map((row) => { const g = row.annual.gcr; const out = (value: number | undefined) => value && value > 0 ? <span className="font-semibold text-rose-600">−{days(value)}</span> : <span className="text-slate-300">0</span>; return <tr key={row.employeeId} className="border-b border-slate-50">
      <td className="py-3 pr-4"><strong>{row.name}</strong><span className="block text-xs text-slate-400">{row.company} · {row.code} · {row.track === 'admin' ? 'Admin' : row.track === 'parttime' ? 'Part-time' : 'Operation'}{g ? ` · carry limit ${days(g.limit)}` : ''}{row.missingJoinDate ? ' · join date missing' : ''}</span></td>
      <td className="border-l border-slate-50 px-3 py-3 text-right tabular-nums">{g ? days(g.burn + g.bfExpired + g.eligibleUnused) : <span className="text-xs text-slate-400">new staff</span>}</td>
      <td className="px-3 py-3 text-right tabular-nums">{out(g?.burn)}</td><td className="px-3 py-3 text-right tabular-nums">{out(g?.bfExpired)}</td><td className="px-3 py-3 text-right tabular-nums">{out(g?.paid)}</td><td className="px-3 py-3 text-right tabular-nums">{out(g?.overLimit)}</td>
      <td className="border-l border-slate-50 px-3 py-2 text-right"><CarryCell row={row} year={preview.sourceYear} onChanged={() => void load()} onError={onError} /></td>
      <td className="px-3 py-3 text-right tabular-nums">{days(row.annual.eligible)}</td>
      <td className="px-3 py-3 text-right font-bold tabular-nums text-[#0b587b]">{days(row.annual.eligible + row.annual.broughtForward)}</td>
      <td className="border-l border-slate-50 px-3 py-3 text-right tabular-nums">{days(row.medical.eligible)}</td>
    </tr>; })}</tbody></table></section>
  </div>;
}
