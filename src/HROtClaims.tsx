import { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { card } from './AssessmentStaff';
import { csvCell } from './lib/hrReportExport';
import { downloadBlob } from './lib/downloadBlob';
import { officeFetch } from './lib/officeApi';
import { newCode } from './lib/shiftCodes';
import { PdfHint, usePrintSheet } from './IncentiveSheet';
import { PrintPage, PrintPortal } from './PrintPortal';

// Office HR > Attendance > OT > Claim report: every OT claim of a period, one block per staff member, like Infotech's
// Attendance Request Status Report. On screen, as a CSV, and printed (or saved as a PDF) on A4 landscape.
import { Block, buildOtClaimPages, dmy, generatedAt, OtClaimPage, RATES, Staff, Summary, SUMMARY_CSS, TABLE_CSS } from './OtClaimBlock';

const ghost = 'inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-50';
const solid = 'inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 text-xs font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50';
const selectClass = 'h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm';
const lastMonths = () => Array.from({ length: 12 }, (_, index) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - index); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
const payrollWindow = (value: string) => { const [year, month] = value.split('-').map(Number); const before = new Date(year, month - 2, 1); return { from: `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, '0')}-20`, to: `${value}-19` }; };
const monthLast = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
const monthLabel = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
export function OtClaims({ onError }: { onError: (message: string) => void }) {
  const now = new Date(); const current = now.getDate() >= 20 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const [payroll, setPayroll] = useState(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
  const [month, setMonth] = useState('');
  const [place, setPlace] = useState('');
  const [group, setGroup] = useState('');
  const [status, setStatus] = useState('');
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [printing, setPrinting] = useState<'' | 'print' | 'pdf'>('');
  const range = month ? { from: `${month}-01`, to: monthLast(month) } : payrollWindow(payroll);
  const periodName = month ? monthLabel(month) : `Payroll ${monthLabel(payroll)} (${dmy(range.from)} to ${dmy(range.to)})`;
  useEffect(() => {
    let live = true; setStaff(null);
    officeFetch(`/api/status?resource=hr&action=attendance_ot_claims&from=${range.from}&to=${range.to}`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); if (live) setStaff(result.staff); }).catch((cause: Error) => { if (live) { setStaff([]); onError(cause.message); } });
    return () => { live = false; };
  }, [range.from, range.to]);
  const shown = (staff || []).filter((person) => (!place || person.company === place) && (!group || person.group === group)).map((person) => ({ ...person, claims: person.claims.filter((claim) => !status || claim.status === status) })).filter((person) => person.claims.length);
  usePrintSheet(Boolean(printing), `OT Claim Status Report - ${periodName}`, () => setPrinting(''));
  const total = shown.reduce((sum, person) => sum + person.claims.length, 0);
  const exportCsv = () => {
    const head = ['Location', 'Code', 'Staff', 'Designation', 'Date', 'Day', 'Shift', 'Clock in', 'Clock out', 'OT asked (h)', 'Approved 1.0x (h)', 'Approved 1.5x (h)', 'Approved 2.0x (h)', 'Approved 3.0x (h)', 'Status', 'Pending with', 'Approved by', 'Remarks', 'Officer comments', 'Applied', 'Approved on', 'Pay'];
    const lines = shown.flatMap((person) => person.claims.map((claim) => [person.company, person.code, person.name, person.designation, claim.date, claim.day, claim.shift ? `${newCode(claim.shift)} ${claim.shiftStart}-${claim.shiftEnd}` : 'No shift', claim.clockIn, claim.clockOut, claim.askedMinutes / 60, ...RATES.map((rate) => claim.status === 'Approved' ? (claim.approved[rate] || 0) / 60 : 0), claim.status, claim.pendingWith, claim.approvedBy, claim.remarks, claim.comments, claim.applied, claim.decided, claim.pay]));
    downloadBlob([[head, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')], `ot-claim-status-${range.from}-to-${range.to}.csv`, 'text/csv');
  };
  const pages = buildOtClaimPages(shown, place);
  const generated = generatedAt();
  const filterText = [place || 'All locations', group || 'All staff', status || 'All statuses'].join(' · ');
  return <section className={`${card} space-y-4`}>
    <style>{TABLE_CSS}</style>
    <div className="flex flex-wrap items-center gap-3">
      <select aria-label="Payroll" value={month ? '' : payroll} onChange={(event) => { setPayroll(event.target.value); setMonth(''); }} className={selectClass}><option value="" disabled>Payroll…</option>{lastMonths().map((value) => { const r = payrollWindow(value); return <option key={value} value={value}>{`Payroll ${monthLabel(value)} · ${dmy(r.from).slice(0, 5)} to ${dmy(r.to).slice(0, 5)}`}</option>; })}</select>
      <select aria-label="Month" value={month} onChange={(event) => setMonth(event.target.value)} className={selectClass}><option value="">By payroll</option>{lastMonths().map((value) => <option key={value} value={value}>{`Month ${monthLabel(value)}`}</option>)}</select>
      <select aria-label="Location" value={place} onChange={(event) => setPlace(event.target.value)} className={selectClass}><option value="">All locations</option><option value="KJ">KJ · Kajang</option><option value="SK">SK · Seri Kembangan</option></select>
      <select aria-label="Staff group" value={group} onChange={(event) => setGroup(event.target.value)} className={selectClass}><option value="">All staff</option><option value="CA">CA</option><option value="Others">Others</option></select>
      <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}><option value="">All statuses</option><option value="Approved">Approved</option><option value="Pending">Pending</option><option value="Rejected">Rejected</option><option value="Cancelled">Cancelled</option></select>
      <span className="ml-auto flex flex-wrap gap-2"><button onClick={() => setPrinting('pdf')} disabled={!total} className={solid}><Printer className="h-4 w-4" />Print / Save PDF</button><button onClick={exportCsv} disabled={!total} className={ghost}><Download className="h-4 w-4" />Download CSV</button></span>
    </div>
    <p className="text-sm text-slate-500">The same layout as the Infotech Attendance Request Status Report: for each OT claim, the original clocks and OT counted by the system, what the staff asked for, and what HR approved, at each rate (1.0, 1.5, 2.0, 3.0). A fixed day pay on a rest day or public holiday is shown as the hours it equals. Times are written 8.59 and hours as decimals (3.02), as in Infotech.</p>
    {range.from < '2026-10-20' && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Remarks: claims dated before 20 October 2026 were taken from Infotech (approved hours only). The hours paid are on the payslip and may differ, as HR may adjust OT in payroll.</p>}
    {!staff ? <p className="text-sm text-slate-500">Loading…</p> : !total ? <p className="text-sm text-slate-500">No OT claims for this selection.</p> : <>
      <p className="text-xs font-semibold text-slate-500">{shown.length} staff · {total} claims</p>
      <div className="overflow-x-auto"><style>{SUMMARY_CSS}</style><Summary staff={shown} /></div>
      <div className="space-y-4 overflow-x-auto">{shown.map((person) => <div key={person.id} className="min-w-[900px]"><Block person={person} claims={person.claims} /></div>)}</div>
    </>}
    {printing === 'pdf' && <PdfHint />}
    {printing && <PrintPortal margin={6}>{pages.map((sheet, index) => <PrintPage key={index}><div className="cv-fit"><OtClaimPage sheet={sheet} index={index} count={pages.length} from={range.from} to={range.to} filterText={filterText} generated={generated} /></div></PrintPage>)}</PrintPortal>}
  </section>;
}
