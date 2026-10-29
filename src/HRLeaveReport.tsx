import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { HRLeaveConsolidate } from './HRLeaveConsolidate';
import { HRLeaveCredit } from './HRLeaveCredit';
import { HRLeaveGcr } from './HRLeaveGcr';

// Office HR: Leave History Report, laid out like the Infotech report (one person per page: approved leave by leave
// type, then the Annual Leave and Medical Leave box). Print it or save it as a PDF from the browser.
type Bal = { eligible: number; broughtForward: number; credit: number; earn: number; forfeit: number; total: number; taken: number; balance: number };
type Row = { type: string; start: string; end: string; half: 'AM' | 'PM' | null; days: number; reason: string };
type Person = { id: string; company: string; code: string; name: string; joinDate: string; requests: Row[]; al: Bal | null; ml: Bal | null };
const TYPE_NAME: Record<string, string> = { AL: 'ANNUAL LEAVE', EL: 'EMERGENCY LEAVE', ML: 'MEDICAL LEAVE', HOSP: 'HOSPITALIZATION LEAVE', MARRG: 'MARRIAGE LEAVE', MATN: 'MATERNITY LEAVE', PATN: 'PATERNITY LEAVE', HAJUMR: 'HAJI/UMRAH LEAVE', UL: 'UNPAID LEAVE', ULEL: 'UNPAID LEAVE (EMERGENCY LEAVE)' };
const COMPANY: Record<string, string> = { KJ: 'KJ- HSO HEALTHCARE SDN. BHD.', SK: 'SK- HSO HEALTHCARE SDN. BHD.' };
const dmy = (date: string) => date.split('-').reverse().join('-');
const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
const n2 = (value: number) => value.toFixed(2);
const nowText = () => { const d = new Date(), p = (x: number) => String(x).padStart(2, '0'); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

// Infotech lists leave one day per line. A request that covers every day in its range (no rest days or holidays inside) is split that way.
const addDay = (date: string, by: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + by); return d.toISOString().slice(0, 10); };
function perDay(rows: Row[]): Row[] {
  return rows.flatMap((row) => {
    const span = Math.round((Date.parse(`${row.end}T00:00:00Z`) - Date.parse(`${row.start}T00:00:00Z`)) / 86400000) + 1;
    if (row.start === row.end || row.half || span < 2 || span > 31 || Math.abs(row.days - span) > 0.001) return [row];
    const notes = row.reason.split('; ');
    return Array.from({ length: span }, (_, index) => ({ ...row, start: addDay(row.start, index), end: addDay(row.start, index), days: 1, reason: notes.length === span ? notes[index] : row.reason }));
  });
}

function LeaveHistory({ onError }: { onError: (message: string) => void }) {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [company, setCompany] = useState('');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [shown, setShown] = useState<{ from: string; to: string; at: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const response = await officeFetch(`/api/status?resource=hr&action=leave_history_report&from=${from}&to=${to}${company ? `&company=${company}` : ''}`);
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Unable to build the report.');
      setPeople(result.people); setShown({ from, to, at: nowText() });
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to build the report.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void run(); }, []);

  let serial = 0;
  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">Leave History Report</h2><p className="text-sm text-slate-500">Approved leave per person for a period, grouped by leave type, with the Annual and Medical Leave balance. Print it or save it as a PDF.</p></div>
      <label className="text-xs font-bold text-slate-600">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${field} mt-1 block`} /></label>
      <label className="text-xs font-bold text-slate-600">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${field} mt-1 block`} /></label>
      <label className="text-xs font-bold text-slate-600">Company<select value={company} onChange={(event) => setCompany(event.target.value)} className={`${field} mt-1 block`}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
      <button onClick={() => void run()} disabled={loading} className="h-10 rounded-xl bg-[#0b587b] px-5 text-sm font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-60">{loading ? 'Building…' : 'Preview'}</button>
      <button onClick={() => window.print()} disabled={!people?.length} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Printer className="h-4 w-4" />Print / PDF</button>
    </section>
    {!people ? <p className="text-sm text-slate-500">Building the report…</p> : !people.length ? <p className={`${card} text-sm text-slate-500`}>No leave in this period.</p> :
      <div className="leave-report space-y-6 print:space-y-0">{people.map((person) => {
        const groups: string[] = Array.from(new Set<string>(person.requests.map((row) => row.type))).sort((a, b) => Object.keys(TYPE_NAME).indexOf(a) - Object.keys(TYPE_NAME).indexOf(b));
        const al = person.al, ml = person.ml;
        return <article key={person.id} className="leave-report-page rounded-2xl bg-white p-6 text-[12px] text-slate-800 shadow-sm print:break-after-page print:rounded-none print:p-0 print:shadow-none">
          <header className="flex items-center justify-center gap-4"><img src="/forms/ara-logo.jpg" alt="Klinik ARA 24 Jam" className="h-14 w-14 shrink-0 object-contain" /><div className="text-center"><p className="font-bold text-[#1f3a6b]">{COMPANY[person.company] || person.company}</p><p className="text-[11px] font-semibold text-slate-600">Klinik ARA 24 Jam</p><p className="mt-1 font-bold text-[#1f3a6b]">Leave History Report (Individual)</p></div></header>
          <div className="mt-3 flex justify-between border-y border-[#1f3a6b] py-1.5 text-[11px]"><span>Date : {shown?.at}</span><span>Period From: {dmy(shown?.from || from)} To: {dmy(shown?.to || to)}</span></div>
          <p className="mt-3 border-b border-[#1f3a6b] pb-1.5 text-center text-[11px] font-bold text-[#1f3a6b]">Emp Code: {person.code} &nbsp; Employee: {person.name} {person.joinDate && <>&nbsp; Leave Calculation Date: {dmy(person.joinDate)}</>}</p>
          <div className="mt-1.5 grid grid-cols-[40px_95px_85px_1fr_70px] gap-2 border-b border-slate-300 pb-1 text-[11px] font-bold"><span>S No.</span><span>Leave Date</span><span>Day</span><span>Remarks</span><span className="text-right">Day / Hr</span></div>
          {!groups.length && <p className="py-4 text-slate-500">No approved leave in this period.</p>}
          {groups.map((type) => { const rows = perDay(person.requests.filter((row) => row.type === type)); return <div key={type} className="mt-4 break-inside-avoid">
            <p className="text-[11px]"><b>Leave Type:</b> &nbsp;<span className="text-[#1f3a6b]">{type} - {TYPE_NAME[type] || type}</span></p>
            {rows.map((row, index) => { serial += 1; return <div key={`${row.start}-${index}`} className="mt-1.5 grid grid-cols-[40px_95px_85px_1fr_70px] gap-2"><span>{serial}</span><span>{dmy(row.start)}{row.end !== row.start && <><br />to {dmy(row.end)}</>}</span><span>{dayName(row.start)}</span><span className="whitespace-pre-line font-mono text-[11px]">{row.reason}</span><span className="text-right">{n2(row.days)} day{row.half ? ` (${row.half})` : ''}</span></div>; })}
            <p className="mt-1 text-right text-[11px]"><b className="text-orange-600">Total :</b> &nbsp;{n2(rows.reduce((sum, row) => sum + row.days, 0))}</p>
          </div>; })}
          <div className="mt-6 grid grid-cols-[1.1fr_0.9fr_0.9fr] border border-[#1f3a6b] text-[11px] break-inside-avoid">
            <div className="p-2"><p className="mb-1 text-center font-bold text-purple-800">Annual Leave</p>
              {al ? <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-bold text-purple-800">{([['Eligible', al.eligible], ['Un-Earned', 0], ['Credit', al.credit], ['Total', al.total], ['Earned', al.earn], ['Taken', al.taken], ['Bring Fwd', al.broughtForward], ['Balance', al.balance], ['BF.Forfeit', al.forfeit]] as const).map(([label, value]) => <span key={label} className="flex justify-between"><span>{label}</span><span>{n2(value)}</span></span>)}</div> : <p className="text-slate-400">No balance on record.</p>}</div>
            <div className="border-l border-[#1f3a6b] p-2"><p className="mb-1 text-center font-bold text-teal-700">Medical Leave</p>
              {ml ? <div className="space-y-0.5 font-bold text-teal-700">{([['Eligible', ml.eligible], ['Earn', ml.earn], ['Taken', ml.taken], ['Balance', ml.balance]] as const).map(([label, value]) => <span key={label} className="flex justify-between"><span>{label}</span><span>{n2(value)}</span></span>)}</div> : <p className="text-slate-400">No balance on record.</p>}</div>
            <div className="border-l border-[#1f3a6b] p-2"><p className="mb-1 text-center font-bold text-green-700">Medical Claim</p><p className="text-center text-slate-400">Not used</p></div>
          </div>
        </article>;
      })}</div>}
  </div>;
}

// Reports tab: the Leave History Report (printable pages) and the Leave Consolidate Report (table and Excel).
export function HRLeaveReport({ onError }: { onError: (message: string) => void }) {
  const [which, setWhich] = useState<'history' | 'consolidate' | 'credit' | 'gcr'>('consolidate');
  return <div className="space-y-5">
    <div role="tablist" className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-100 print:hidden">{([['consolidate', 'Leave Consolidate'], ['credit', 'Credit Annual Leave'], ['gcr', 'GCR'], ['history', 'Leave History']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={which === id} onClick={() => setWhich(id)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${which === id ? 'bg-[#e9f6fb] text-[#0b587b]' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}</div>
    {which === 'consolidate' ? <HRLeaveConsolidate onError={onError} /> : which === 'credit' ? <HRLeaveCredit onError={onError} /> : which === 'gcr' ? <HRLeaveGcr onError={onError} /> : <LeaveHistory onError={onError} />}
  </div>;
}
