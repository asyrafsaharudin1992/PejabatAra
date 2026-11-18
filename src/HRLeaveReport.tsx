import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SubTabs } from './SubTabs';
import { Printer, X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { HRLeaveConsolidate } from './HRLeaveConsolidate';
import { HRLeaveCredit } from './HRLeaveCredit';
import { HRLeaveGcr } from './HRLeaveGcr';
import { HRLeaveStatusReport } from './HRLeaveStatusReport';
import { PeriodPicker, type Period } from './PeriodPicker';

// Office HR: Leave History Report, laid out like the Infotech report (one person per page: approved leave by leave
// type, then the Annual Leave and Medical Leave box). Print it or save it as a PDF from the browser.
type Bal = { eligible: number; broughtForward: number; credit: number; earn: number; forfeit: number; total: number; taken: number; balance: number };
type Row = { type: string; start: string; end: string; half: 'AM' | 'PM' | null; days: number; reason: string };
type Person = { id: string; company: string; code: string; name: string; joinDate: string; requests: Row[]; al: Bal | null; ml: Bal | null };
export const TYPE_NAME: Record<string, string> = { AL: 'ANNUAL LEAVE', EL: 'EMERGENCY LEAVE', ML: 'MEDICAL LEAVE', HOSP: 'HOSPITALIZATION LEAVE', MARRG: 'MARRIAGE LEAVE', MATN: 'MATERNITY LEAVE', PATN: 'PATERNITY LEAVE', HAJUMR: 'HAJI/UMRAH LEAVE', UL: 'UNPAID LEAVE', ULEL: 'UNPAID LEAVE (EMERGENCY LEAVE)' };
const COMPANY: Record<string, string> = { KJ: 'KJ- HSO HEALTHCARE SDN. BHD.', SK: 'SK- HSO HEALTHCARE SDN. BHD.' };
const dmy = (date: string) => date.split('-').reverse().join('-');
const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
const n2 = (value: number) => value.toFixed(2);
const nowText = () => { const d = new Date(), p = (x: number) => String(x).padStart(2, '0'); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

// Infotech lists leave one day per line. A request that covers every day in its range (no rest days or holidays inside) is split that way.
const addDay = (date: string, by: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + by); return d.toISOString().slice(0, 10); };
export function perDay<T extends { start: string; end: string; half: 'AM' | 'PM' | null; days: number; reason: string }>(rows: T[]): T[] {
  return rows.flatMap((row) => {
    const span = Math.round((Date.parse(`${row.end}T00:00:00Z`) - Date.parse(`${row.start}T00:00:00Z`)) / 86400000) + 1;
    if (row.start === row.end || row.half || span < 2 || span > 31 || Math.abs(row.days - span) > 0.001) return [row];
    const notes = row.reason.split('; ');
    return Array.from({ length: span }, (_, index) => ({ ...row, start: addDay(row.start, index), end: addDay(row.start, index), days: 1, reason: notes.length === span ? notes[index] : row.reason }));
  });
}

// On a phone each person's page is shown as a small A4 (the whole page, scaled down to the screen). Tap it to read it full size, and pinch or scroll to move.
// On a tablet or computer, and when printing, the page is shown as it is.
const A4_WIDTH = 794;
function A4Preview({ label, children }: { key?: string; label: string; children: ReactNode }) {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const outer = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  useEffect(() => { const query = window.matchMedia('(max-width: 639px)'); const change = () => setPhone(query.matches); query.addEventListener('change', change); return () => query.removeEventListener('change', change); }, []);
  useEffect(() => {
    if (!phone) return;
    const measure = () => setBox({ width: outer.current?.clientWidth || 0, height: inner.current?.offsetHeight || 0 });
    measure();
    const watch = new ResizeObserver(measure); if (outer.current) watch.observe(outer.current); if (inner.current) watch.observe(inner.current);
    return () => watch.disconnect();
  }, [phone]);
  if (!phone) return <>{children}</>;
  const scale = box.width ? Math.min(1, box.width / A4_WIDTH) : 0.4;
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`Open the leave history of ${label} full size`} className="leave-a4-thumb block w-full rounded-lg border border-slate-200 bg-white p-0 text-left shadow-sm">
      <div ref={outer} className="w-full overflow-hidden" style={{ height: box.height * scale || undefined }}>
        <div ref={inner} className="leave-a4-inner pointer-events-none" style={{ width: A4_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
      </div>
      <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] font-semibold text-[#0b587b]">{label} · tap to open</p>
    </button>
    {open && <div role="dialog" aria-modal="true" aria-label={`Leave history of ${label}`} className="fixed inset-0 z-50 overflow-auto bg-slate-900/70 p-2 print:hidden">
      <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="sticky left-0 top-0 z-10 mb-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-slate-700 shadow"><X className="h-4 w-4" />Close</button>
      <div style={{ width: A4_WIDTH }} className="bg-white">{children}</div>
    </div>}
  </>;
}

export function LeaveHistory({ onError }: { onError: (message: string) => void }) {
  // The period is chosen as a payroll period, a month or a year (it starts as the whole year, like Infotech's report).
  const [period, setPeriod] = useState<Period | null>(null);
  const from = period?.from || '', to = period?.to || '';
  const [company, setCompany] = useState('');
  const [staffId, setStaffId] = useState(''); // '' is all staff
  const [staff, setStaff] = useState<{ id: string; fullName: string; company: string; employeeCode: string }[]>([]);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [shown, setShown] = useState<{ from: string; to: string; at: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const response = await officeFetch(`/api/status?resource=hr&action=leave_history_report&from=${from}&to=${to}${company ? `&company=${company}` : ''}${staffId ? `&id=${staffId}` : ''}`);
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Unable to build the report.');
      setPeople(result.people); setShown({ from, to, at: nowText() });
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to build the report.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (period) void run(); }, [period?.from, period?.to, company, staffId]);
  // The staff to choose from (active, for the chosen company).
  useEffect(() => {
    let live = true;
    officeFetch('/api/status?resource=hr&action=employees').then((response) => response.json()).then((result) => { if (live) setStaff((result.employees || []).filter((item: { status: string }) => item.status === 'Active').sort((a: { fullName: string }, b: { fullName: string }) => a.fullName.localeCompare(b.fullName))); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  let serial = 0;
  const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">Leave History Report</h2><p className="text-sm text-slate-500">Approved leave per person for a period, grouped by leave type, with the Annual and Medical Leave balance. Print it or save it as a PDF.</p></div>
      <PeriodPicker onChange={setPeriod} allowYear defaultMode="year" />
      <label className="text-xs font-bold text-slate-600">Company<select value={company} onChange={(event) => { setCompany(event.target.value); setStaffId(''); }} className={`${field} mt-1 block`}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
      <label className="text-xs font-bold text-slate-600">Staff<select aria-label="Staff" value={staffId} onChange={(event) => setStaffId(event.target.value)} className={`${field} mt-1 block max-w-[240px]`}><option value="">All staff</option>{staff.filter((item) => !company || item.company === company).map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.company}</option>)}</select></label>
            <button onClick={() => window.print()} disabled={!people?.length} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Printer className="h-4 w-4" />Print / PDF</button>
    </section>
    {!people ? <p className="text-sm text-slate-500">Building the report…</p> : !people.length ? <p className={`${card} text-sm text-slate-500`}>No leave in this period.</p> :
      <div className="leave-report space-y-6 print:space-y-0">{people.map((person) => {
        const groups: string[] = Array.from(new Set<string>(person.requests.map((row) => row.type))).sort((a, b) => Object.keys(TYPE_NAME).indexOf(a) - Object.keys(TYPE_NAME).indexOf(b));
        const al = person.al, ml = person.ml;
        // Laid out as Infotech's own Leave History Report (Individual): no logo, the company and the title, Date / Period / Page, the employee line, the columns
        // (S No., Leave Date, Day, Remarks, Day / Hr, ML Claim Amt), each leave type with its Total, then the Annual Leave, Medical Leave and Medical Claim box.
        const COLS = 'grid grid-cols-[38px_92px_84px_1fr_104px_92px] gap-x-2';
        const pageNo = people.indexOf(person) + 1;
        const box = (label: string, value: number) => <span key={label} className="flex justify-between gap-2"><span>{label}</span><span className="flex flex-1 justify-between"><span>:</span><span>{n2(value)}</span></span></span>;
        const page = <article className="leave-report-page bg-white p-6 font-sans text-[10.5px] leading-[1.35] text-slate-900 shadow-sm print:break-after-page print:p-0 print:shadow-none" style={{ minHeight: 1000 }}>
          <header className="pt-1 text-center"><p className="text-[12px] font-bold text-[#1f3a6b]">{COMPANY[person.company] || person.company}</p><p className="mt-3 text-[11px] font-bold text-[#1f3a6b]">Leave History Report (Individual)</p></header>
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] border-y border-[#1f3a6b] py-1.5"><span>Date : &nbsp;{shown?.at}</span><span>Period From: {dmy(shown?.from || from)} To: {dmy(shown?.to || to)}</span><span className="text-right">Page : {pageNo} of {people.length}</span></div>
          <p className="mx-3 mt-6 border-b border-[#1f3a6b] pb-1 text-center text-[10px] font-bold text-[#1f3a6b]">Emp Code: {person.code} &nbsp; Employee: {person.name} {person.joinDate && <>&nbsp; Leave Calculation Date: {dmy(person.joinDate)}</>}</p>
          <div className={`${COLS} mt-1 border-b border-[#1f3a6b]/60 pb-1 font-bold`}><span>S No.</span><span>Leave Date</span><span>Day</span><span>Remarks</span><span>Day / Hr</span><span>ML Claim Amt</span></div>
          {!groups.length && <p className="py-4 text-slate-500">No approved leave in this period.</p>}
          {groups.map((type) => { const rows = perDay(person.requests.filter((row) => row.type === type)); return <div key={type} className="mt-8 break-inside-avoid">
            <p><b>Leave Type:</b> &nbsp;&nbsp;<span className="text-[#1f3a6b]">{type} - {TYPE_NAME[type] || type}</span></p>
            {rows.map((row, index) => { serial += 1; return <div key={`${row.start}-${index}`} className={`${COLS} mt-4`}><span>{serial}</span><span>{dmy(row.start)}{row.end !== row.start && <><br />to {dmy(row.end)}</>}</span><span>{dayName(row.start)}</span><span className="whitespace-pre-line font-mono text-[10.5px]">{row.reason}</span><span><span className="inline-block min-w-[100px] border-b border-slate-400 pb-0.5">{n2(row.days)} {row.half ? `day (${row.half})` : 'day'}</span></span><span /></div>; })}
            <div className={`${COLS} mt-1`}><span /><span /><span /><span className="text-right"><b className="text-orange-600">Total :</b></span><span><span className="inline-block min-w-[100px] border-b border-slate-400 pb-0.5">{n2(rows.reduce((sum, row) => sum + row.days, 0))}</span></span><span /></div>
          </div>; })}
          <div className="mt-8 grid w-[84%] grid-cols-[1.25fr_1.15fr_0.9fr] border border-[#1f3a6b] text-[10px] font-bold break-inside-avoid">
            <div className="p-2"><p className="mb-1 text-center text-purple-800">Annual Leave</p>
              {al ? <div className="grid grid-cols-2 gap-x-3 text-purple-800"><div className="space-y-1">{box('Eligible', al.eligible)}{box('Credit', al.credit)}{box('Earned', al.earn)}{box('Bring Fwd', al.broughtForward)}{box('BF.Forfeit', al.forfeit)}</div><div className="space-y-1">{box('Un-Earned', 0)}{box('Total', al.total)}{box('Taken', al.taken)}{box('Balance', al.balance)}</div></div> : <p className="font-normal text-slate-400">No balance on record.</p>}</div>
            <div className="border-l border-[#1f3a6b] p-2"><p className="mb-1 text-center text-teal-700">Medical Leave</p>
              {ml ? <div className="grid grid-cols-2 gap-x-3 text-teal-700"><div className="space-y-1 pt-4">{box('Eligible', ml.eligible)}{box('Earn', ml.earn)}</div><div className="space-y-1 pt-2">{box('Un Earn', 0)}{box('Taken', ml.taken)}{box('Balance', ml.balance)}</div></div> : <p className="font-normal text-slate-400">No balance on record.</p>}</div>
            <div className="border-l border-[#1f3a6b] p-2"><p className="mb-1 text-center text-green-700">Medical Claim</p><div className="space-y-1 pt-2 text-green-700">{box('Limit', 0)}{box('Taken', 0)}{box('Balance', 0)}</div></div>
          </div>
          <div className="mt-6 w-[84%] border-t border-[#1f3a6b]" />
        </article>;
        return <A4Preview key={person.id} label={`${person.code} · ${person.name}`}>{page}</A4Preview>;
      })}</div>}
  </div>;
}

// Reports tab: the Leave History Report (printable pages) and the Leave Consolidate Report (table and Excel).
export function HRLeaveReport({ onError }: { onError: (message: string) => void }) {
  const [which, setWhich] = useState<'history' | 'consolidate' | 'credit' | 'gcr' | 'status'>('consolidate');
  return <div className="space-y-5">
    <SubTabs className="print:hidden" active={which} onSelect={setWhich} tabs={[{ id: 'consolidate', label: 'Leave Consolidate', short: 'Consolidate' }, { id: 'credit', label: 'Credit Annual Leave', short: 'Credit' }, { id: 'gcr', label: 'GCR' }, { id: 'history', label: 'Leave History', short: 'History' }, { id: 'status', label: 'Leave Status', short: 'Status' }]} />
    {which === 'consolidate' ? <HRLeaveConsolidate onError={onError} /> : which === 'credit' ? <HRLeaveCredit onError={onError} /> : which === 'gcr' ? <HRLeaveGcr onError={onError} /> : which === 'status' ? <HRLeaveStatusReport onError={onError} /> : <LeaveHistory onError={onError} />}
  </div>;
}
