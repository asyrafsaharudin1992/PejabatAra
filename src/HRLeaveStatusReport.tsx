import { useEffect, useState } from 'react';
import { bulk } from './lib/bulkReports';
import { Download, Printer } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { csvCell } from './lib/hrReportExport';
import { card } from './AssessmentStaff';
import { PeriodPicker, type Period } from './PeriodPicker';
import { PrintPage, PrintPortal } from './PrintPortal';
import { usePrintSheet } from './IncentiveSheet';
import { PrintMenu } from './PrintMenu';
import { perDay, TYPE_NAME } from './HRLeaveReport';

// Office HR > Leave > Reports > Leave Status: every leave request of the period with its status, who it waits for or who approved it, the officer's comment and the
// dates applied and decided, one block for each person, like Infotech's Leave Status Report. On screen, as a CSV, and printed (or saved as a PDF) on A4 landscape.
type Row = { type: string; start: string; end: string; half: 'AM' | 'PM' | null; days: number; reason: string; status: string; pendingWith: string; approvedBy: string; comment: string; applied: string; decided: string };
type Person = { id: string; company: string; code: string; name: string; requests: Row[] };
const COMPANY: Record<string, string> = { KJ: 'KJ- HSO HEALTHCARE SDN. BHD.', SK: 'SK- HSO HEALTHCARE SDN. BHD.' };
const dmy = (date: string) => date ? date.split('-').reverse().join('-') : '';
const n2 = (value: number) => value.toFixed(2);
const nowText = () => { const d = new Date(), p = (x: number) => String(x).padStart(2, '0'); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
const GRID = 'grid grid-cols-[72px_96px_72px_92px_92px_58px_minmax(120px,1fr)_minmax(90px,0.7fr)_72px_72px] gap-x-2';
const typeName = (code: string) => TYPE_NAME[code] || code;

function Block({ person }: { key?: string; person: Person }) {
  const lines = perDay<Row>(person.requests);
  const total = lines.reduce((sum, row) => sum + row.days, 0);
  return <div className="mt-4 break-inside-avoid text-[10.5px]">
    <p><b className="text-orange-600">Employee Code:</b> {person.code} &nbsp;&nbsp; <b className="text-orange-600">Name:</b> {person.name}</p>
    {lines.map((row, index) => <div key={index} className={`${GRID} mt-1.5`}>
      <span>{dmy(row.start)}</span><span>{typeName(row.type)}</span><span className="uppercase">{row.status}</span><span>{row.pendingWith}</span><span>{row.approvedBy}</span><span>{n2(row.days)} {row.half ? 'half' : 'day'}</span><span className="whitespace-pre-wrap">{row.reason}</span><span>{row.comment}</span><span>{dmy(row.applied)}</span><span>{dmy(row.decided)}</span>
    </div>)}
    <p className="mt-1 text-right"><b className="text-[#1f3a6b]">Sub Total :</b> &nbsp;{n2(total)}</p>
  </div>;
}

function Page({ company, people, period, at, grand }: { key?: string; company: string; people: Person[]; period: Period; at: string; grand: number }) {
  return <article className="bg-white p-4 text-[11px] text-slate-800 print:p-0">
    <header className="relative text-center"><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" className="absolute left-0 top-0 h-12 w-auto" /><p className="font-bold text-[#1f3a6b]">{COMPANY[company] || company}</p><p className="font-bold text-[#1f3a6b]">Leave Status Report (Individual)</p></header>
    <div className="mt-2 flex justify-between border-y border-[#1f3a6b] py-1"><span>Date : {at}</span><span>Period From: {dmy(period.from)} To: {dmy(period.to)}</span></div>
    <div className={`${GRID} mt-1 border-b border-[#1f3a6b] pb-1 font-bold`}><span>Leave Date</span><span>Leave Type</span><span>Leave Status</span><span>Pending With</span><span>Approved Up To</span><span>Day / Hour</span><span>Remarks</span><span>Officer Comment</span><span>Applied Date</span><span>Approved Date</span></div>
    {people.map((person) => <Block key={person.id} person={person} />)}
    <p className="mt-4 text-right"><b className="text-orange-600">Grand Total :</b> &nbsp;{n2(grand)}</p>
  </article>;
}

export function HRLeaveStatusReport({ onError }: { onError: (message: string) => void }) {
  const [period, setPeriod] = useState<Period | null>(null);
  const [company, setCompany] = useState<string>(bulk.active ? bulk.company : '');
  const [staffId, setStaffId] = useState('');
  const [status, setStatus] = useState('');
  const [staff, setStaff] = useState<{ id: string; fullName: string; company: string }[]>([]);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [at, setAt] = useState('');
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    let live = true;
    officeFetch('/api/status?resource=hr&action=employees').then((response) => response.json()).then((result) => { if (live) setStaff((result.employees || []).filter((item: { status: string }) => item.status === 'Active').sort((a: { fullName: string }, b: { fullName: string }) => a.fullName.localeCompare(b.fullName))); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!period) return;
    let live = true; setPeople(null);
    officeFetch(`/api/status?resource=hr&action=leave_status_report&from=${period.from}&to=${period.to}${company ? `&company=${company}` : ''}${staffId ? `&id=${staffId}` : ''}${status ? `&status=${status}` : ''}`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); if (live) { setPeople(result.people); setAt(nowText()); } }).catch((cause: Error) => { if (live) { setPeople([]); onError(cause.message); } });
    return () => { live = false; };
  }, [period?.from, period?.to, company, staffId, status]);
  usePrintSheet(printing, `Leave Status Report - ${period?.label || ''}`, () => setPrinting(false));
  const byCompany = ['KJ', 'SK'].map((code) => ({ code, people: (people || []).filter((person) => person.company === code) })).filter((group) => group.people.length);
  const grandOf = (list: Person[]) => list.reduce((sum, person) => sum + perDay<Row>(person.requests).reduce((inner, row) => inner + row.days, 0), 0);
  const csv = () => {
    const head = ['Company', 'Employee code', 'Name', 'Leave date', 'Leave type', 'Leave status', 'Pending with', 'Approved up to', 'Day', 'Remarks', 'Officer comment', 'Applied date', 'Approved date'];
    const lines = (people || []).flatMap((person) => perDay<Row>(person.requests).map((row) => [person.company, person.code, person.name, dmy(row.start), typeName(row.type), row.status.toUpperCase(), row.pendingWith, row.approvedBy, row.days, row.reason, row.comment, dmy(row.applied), dmy(row.decided)]));
    downloadBlob([[head, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')], `leave-status-${period?.from}-to-${period?.to}.csv`, 'text/csv');
  };
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">Leave Status Report</h2><p className="text-sm text-slate-500">Every leave request with a leave date in the period: status, who it waits for or who approved it, the comment, and the dates applied and decided.</p></div>
      <PeriodPicker onChange={setPeriod} />
      <label className="text-xs font-bold text-slate-600">Company<select aria-label="Company" value={company} onChange={(event) => { setCompany(event.target.value); setStaffId(''); }} className={`${field} mt-1 block`}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
      <label className="text-xs font-bold text-slate-600">Staff<select aria-label="Staff" value={staffId} onChange={(event) => setStaffId(event.target.value)} className={`${field} mt-1 block max-w-[220px]`}><option value="">All staff</option>{staff.filter((item) => !company || item.company === company).map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Status<select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)} className={`${field} mt-1 block`}><option value="">All statuses</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></label>
      <PrintMenu onPrint={() => setPrinting(true)} onCsv={csv} pdf={{ scope: '.leave-status-pages', landscape: true, filename: `Leave status ${period?.from}-to-${period?.to}` }} disabled={!people?.length} onError={onError} label="Print" />
    </section>
    {!people ? <p className="text-sm text-slate-500">Building the report…</p> : !people.length ? <p className={`${card} text-sm text-slate-500`}>No leave in this period.</p> :
      <div className="leave-status-pages space-y-6 print:hidden">{byCompany.map((group) => <div key={group.code} className={`${card} overflow-x-auto`}><div data-pdf-page className="min-w-[1000px]"><Page company={group.code} people={group.people} period={period!} at={at} grand={grandOf(group.people)} /></div></div>)}</div>}
    {printing && <PrintPortal margin={8}>{byCompany.map((group) => <PrintPage key={group.code}><div className="cv-fit"><Page company={group.code} people={group.people} period={period!} at={at} grand={grandOf(group.people)} /></div></PrintPage>)}</PrintPortal>}
  </div>;
}
