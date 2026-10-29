import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { ATTACHMENT_REQUIRED_FOR, AttachmentPicker, Attached } from './LeaveAttachments';

// Office HR: enter leave for one staff member or many at once (Infotech's Leave Application on Behalf and Batch Leave).
// The leave is approved straight away and comes off the balance. "Check first" shows each person's days and balance
// without saving anything.
type Staff = { id: string; company: string; code: string; name: string; status: string };
type Result = { id: string; name: string; code: string; ok: boolean; days?: number; balanceAfter?: number | null; error?: string };
const TYPES: [string, string, boolean][] = [['AL', 'Annual Leave', true], ['EL', 'Emergency Leave', false], ['ML', 'Medical Leave', true], ['HOSP', 'Hospitalization Leave', false], ['MARRG', 'Marriage Leave', false], ['HAJUMR', 'Haji / Umrah Leave', false], ['UL', 'Unpaid Leave', true]];
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
async function call(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

export function HRLeaveApply({ onError, onSaved }: { onError: (message: string) => void; onSaved: () => void }) {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [type, setType] = useState('AL');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [half, setHalf] = useState<'' | 'AM' | 'PM'>('');
  const [reason, setReason] = useState('');
  const [allowOver, setAllowOver] = useState(false);
  const [files, setFiles] = useState<Attached[]>([]);
  const [noFile, setNoFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ preview: boolean; rows: Result[] } | null>(null);
  useEffect(() => { call('action=leave_staff').then((result) => setStaff((result.staff as Staff[]).filter((person) => person.status === 'Active'))).catch((cause: Error) => { setStaff([]); onError(cause.message); }); }, []);
  const list = useMemo(() => (staff || []).filter((person) => !query.trim() || `${person.code} ${person.name}`.toLowerCase().includes(query.trim().toLowerCase())), [staff, query]);
  const info = TYPES.find(([code]) => code === type)!;
  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const pick = (value: boolean, only?: string) => setPicked((current) => { const next = new Set(current); for (const person of list) if (!only || person.company === only) { if (value) next.add(person.id); else next.delete(person.id); } return next; });
  const payload = (preview: boolean) => ({ employeeIds: [...picked], type, start, end: end || start, half: half || null, reason: reason.trim(), allowOver, preview, attachmentIds: files.map((file) => file.id), skipAttachment: noFile });
  const run = async (preview: boolean) => {
    setBusy(true); setResults(null);
    try {
      if (!preview && !window.confirm(`Enter ${info[1]} (${start}${end !== start ? ` to ${end}` : ''}) for ${picked.size} staff? It is approved straight away and comes off their balance.`)) return;
      const result = await call('action=leave_hr_apply', payload(preview));
      setResults({ preview, rows: result.results });
      if (!preview && result.saved) { onSaved(); setFiles([]); setNoFile(false); }
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to enter the leave.'); }
    finally { setBusy(false); }
  };
  const needsFile = ATTACHMENT_REQUIRED_FOR.has(type) && !files.length && !noFile;
  const ready = picked.size > 0 && reason.trim().length >= 2 && start && (end || start) >= start && !needsFile;
  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
  const failed = results?.rows.filter((row) => !row.ok).length || 0;

  return <div className="space-y-5">
    <section className={`${card} space-y-4`}>
      <div><h2 className="text-lg font-semibold">Enter leave for staff</h2><p className="text-sm text-slate-500">For one person or many at once (for example a company leave day). It is approved straight away and comes off the balance; days follow each person's roster, rest days and public holidays.</p></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold text-slate-600">Leave type<select value={type} onChange={(event) => { setType(event.target.value); if (!TYPES.find(([code]) => code === event.target.value)![2]) setHalf(''); }} className={`${field} mt-1 block min-w-[200px]`}>{TYPES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">From<input type="date" value={start} onChange={(event) => { setStart(event.target.value); if (!end || end < event.target.value) setEnd(event.target.value); }} className={`${field} mt-1 block`} /></label>
        <label className="text-xs font-bold text-slate-600">To<input type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} className={`${field} mt-1 block`} /></label>
        {info[2] && start === end && <label className="text-xs font-bold text-slate-600">Day<select value={half} onChange={(event) => setHalf(event.target.value as '' | 'AM' | 'PM')} className={`${field} mt-1 block`}><option value="">Full day</option><option value="AM">Morning</option><option value="PM">Afternoon</option></select></label>}
      </div>
      <label className="block text-xs font-bold text-slate-600">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="e.g. Company leave day, or MC received by WhatsApp" className={`${field} mt-1 block w-full`} /></label>
      <AttachmentPicker files={files} onChange={setFiles} upload={async (name, data) => (await call('action=leave_attachment_upload', { fileName: name, data })).file} required={ATTACHMENT_REQUIRED_FOR.has(type) && !noFile} onError={onError} label={type === 'ML' ? 'Medical certificate' : 'Attachment'} />
      {ATTACHMENT_REQUIRED_FOR.has(type) && !files.length && <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" checked={noFile} onChange={(event) => setNoFile(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />No attachment <span className="text-xs text-slate-400">(HR is entering this medical leave without a certificate)</span></label>}
      <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" checked={allowOver} onChange={(event) => setAllowOver(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />Allow over balance <span className="text-xs text-slate-400">(Annual Leave normally stops at the year's entitlement)</span></label>
    </section>
    <section className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or code" className={`${field} w-52`} />
        <button onClick={() => pick(true)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">Select all shown</button>
        <button onClick={() => pick(true, 'KJ')} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">All KJ</button>
        <button onClick={() => pick(true, 'SK')} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">All SK</button>
        <button onClick={() => setPicked(new Set())} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">Clear</button>
        <span className="ml-auto text-xs font-semibold text-[#0b587b]">{picked.size} selected</span>
      </div>
      <div className="grid max-h-72 gap-x-4 overflow-y-auto rounded-2xl border border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-3">{!staff ? <p className="text-sm text-slate-500">Loading…</p> : list.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={picked.has(person.id)} onChange={() => toggle(person.id)} className="h-4 w-4 accent-[#0b587b]" /><span className="min-w-0 flex-1 truncate">{person.name}</span><span className="text-[10px] text-slate-400">{person.code}</span></label>)}</div>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => void run(true)} disabled={busy || !ready} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-50">{busy ? 'Working…' : 'Check first'}</button>
        <button onClick={() => void run(false)} disabled={busy || !ready} className="h-11 rounded-xl bg-[#0b587b] px-6 text-sm font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50">Enter leave for {picked.size} staff</button>
      </div>
    </section>
    {results && <section className={`${card} space-y-3`}>
      <h3 className="font-semibold">{results.preview ? 'Check result (nothing saved yet)' : `Entered: ${results.rows.length - failed} of ${results.rows.length}`}</h3>
      {failed > 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{failed} could not be {results.preview ? 'entered' : 'entered and were skipped'}. The reason is shown on each line.</p>}
      <ul className="divide-y divide-slate-100 text-sm">{results.rows.map((row) => <li key={row.id} className="flex flex-wrap items-center gap-3 py-2">{row.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-rose-500" />}<span className="min-w-[180px] font-semibold">{row.name}<span className="ml-2 text-[10px] font-normal text-slate-400">{row.code}</span></span>{row.ok ? <span className="text-slate-600">{row.days} day{row.days === 1 ? '' : 's'}{row.balanceAfter !== null && row.balanceAfter !== undefined ? ` · balance after ${row.balanceAfter}` : ''}</span> : <span className="text-rose-600">{row.error}</span>}</li>)}</ul>
    </section>}
  </div>;
}
