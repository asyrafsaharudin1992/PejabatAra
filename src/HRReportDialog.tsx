import { FormEvent, useEffect, useRef, useState } from 'react';
import { Printer, X, Eye, Download } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { newCode } from './lib/shiftCodes';
import { rosterColors, rosterShiftColor } from './lib/rosterColors';
import { reviewApi, ReviewFull } from './lib/performanceReview';
import { ReviewSheet, ReviewDocument, useReviewPrint } from './ReviewSheet';
import { StaffProfilePrint, StaffProfileDocument, useStaffProfilePrint } from './StaffProfilePrint';
import type { Employee, CareerEntry } from './HRProfiles';
import { Claim, MonthSummary } from './ClinicalIncentives';
import { ClaimPages, usePrintSheet } from './IncentiveSheet';
import { PrintPage, PrintPortal } from './PrintPortal';
import { ReportPreviewFrame } from './ReportPreviewFrame';
import { downloadReportCsv, downloadReportExcel, reportExportSections, type PreparedReport as Prepared, type ReportSection } from './lib/hrReportExport';
import HRProjectionDocument from './HRProjectionDocument';
import { projectionMonths, shiftProjectionMonth } from './lib/hrProjection';

type Person = { id: string; company: string; fullName: string; employeeCode: string; status: string };
type TableSection = ReportSection;

const day = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const dateLabel = (date: string) => date ? date.slice(0, 10).split('-').reverse().join('/') : '—';
const num = (value: number | undefined | null) => value == null ? '—' : Number(value).toFixed(2);
const field = 'mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';
async function hr(action: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ resource: 'hr', action, ...params });
  const response = await officeFetch(`/api/status?${query}`);
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Unable to prepare this report.');
  return result;
}

// Reports fetch only the records needed for printing. No management screens or write actions mount here.
export function HRReportDialog({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const [month, setMonth] = useState(day().slice(0, 7));
  const [date, setDate] = useState(day());
  const [year, setYear] = useState(Number(day().slice(0, 4)));
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [company, setCompany] = useState('');
  const [staffStatus, setStaffStatus] = useState('Active');
  const [forecastFrom, setForecastFrom] = useState('2026-01'), [forecastTo, setForecastTo] = useState('2026-12');
  const [employeeId, setEmployeeId] = useState('');
  const [group, setGroup] = useState('staff');
  const [codes, setCodes] = useState('new');
  const [branch, setBranch] = useState('');
  const [reveal, setReveal] = useState(false);
  const [reviewId, setReviewId] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [reviews, setReviews] = useState<{ id: string; staffName: string; periodLabel: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [previewKey, setPreviewKey] = useState('');
  const selectionKey = JSON.stringify([month, date, year, from, to, company, employeeId, group, codes, branch, reveal, reviewId, staffStatus, forecastFrom, forecastTo]);
  const ready = prepared !== null && previewKey === selectionKey;
  const dialog = useRef<HTMLDialogElement>(null);
  const printTitle = `${title} - ${id === 'forecast' ? `${forecastFrom} to ${forecastTo}` : month}`;
  usePrintSheet(printing && (prepared?.kind === 'table' || prepared?.kind === 'incentives' || prepared?.kind === 'forecast'), printTitle, () => setPrinting(false));
  useStaffProfilePrint(printing && prepared?.kind === 'profile', `Staff Profile - ${prepared?.kind === 'profile' ? prepared.employee.fullName : ''}`, () => setPrinting(false));
  useReviewPrint(printing && prepared?.kind === 'review', `Performance Review - ${prepared?.kind === 'review' ? prepared.review.staffName : ''}`, () => setPrinting(false));

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previousFocus?.focus();
  }, []);
  useEffect(() => {
    let live = true;
    const load = async () => {
      if (['staff-summary', 'forecast'].includes(id)) return;
      const [staffResult, reviewResult] = await Promise.all([hr('employees'), id === 'performance' ? reviewApi('action=hr_list') : Promise.resolve(null)]);
      if (!live) return;
      const active: Person[] = (staffResult.employees || []).filter((item: Person) => item.status === 'Active').sort((a: Person, b: Person) => a.fullName.localeCompare(b.fullName));
      setPeople(active);
      if (reviewResult) {
        const codes = new Set(active.map((item) => item.employeeCode));
        setReviews((reviewResult.reviews || []).filter((item: { status: string; employeeCode: string }) => item.status === 'submitted' && codes.has(item.employeeCode)));
      }
    };
    load().catch((cause: Error) => { if (live) setError(cause.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);
  const person = people.find((item) => item.id === employeeId);
  const companyParams = company ? { company } : {};
  const matches = (row: { id?: string; company?: string; code?: string }) => (!company || row.company === company) && (!employeeId || row.id === employeeId || row.code === person?.employeeCode && row.company === person?.company);
  const needsMonth = ['roster', 'attendance-monthly', 'incentives'].includes(id);
  const needsRange = ['leave-credit', 'leave-history'].includes(id);
  const needsYear = ['leave-consolidate', 'leave-gcr'].includes(id);
  const peopleShown = people.filter((item) => !company || item.company === company);

  const run = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true); setPrepared(null);
    try {
      if (needsRange && from > to) throw new Error('The end date must be on or after the start date.');
      if (id === 'forecast' && (forecastFrom > forecastTo || forecastTo > shiftProjectionMonth(forecastFrom, 11))) throw new Error('Choose a forecast period of at most 12 months.');
      let next: Prepared;
      const subtitle = [company || 'KJ and SK', needsMonth ? month : needsRange ? `${dateLabel(from)} – ${dateLabel(to)}` : needsYear ? String(year) : dateLabel(date), person?.fullName].filter(Boolean).join(' · ');
      if (id === 'staff-profile') {
        const [profile, career] = await Promise.all([hr('employee', { id: employeeId }), hr('career', { employeeId })]);
        if (profile.employee?.status !== 'Active') throw new Error('Only active staff can be selected for an individual profile report.');
        if (!profile.employee) throw new Error('This staff profile is unavailable.');
        next = { kind: 'profile', employee: profile.employee, career: career.entries || [] };
      } else if (id === 'forecast') {
        const result = await hr('calendar_projection', { month: forecastFrom, through: forecastTo });
        next = { kind: 'forecast', people: result.people || [], plan: result.plan, probation: result.probation || {}, months: projectionMonths(forecastFrom, forecastTo), branches: ['KJ', 'SK'].filter((branch) => !company || branch === company), subtitle: `${company || 'KJ and SK'} · ${forecastFrom} – ${forecastTo}` };
      } else if (id === 'performance') {
        const result = await reviewApi(`action=hr_get&id=${encodeURIComponent(reviewId)}`);
        if (!result.review || result.review.status === 'pending') throw new Error('Choose a submitted review to print.');
        next = { kind: 'review', review: result.review };
      } else if (id === 'incentives') {
        const result = await hr('incentives', { month });
        const claims = (result.claims || []).filter((claim: Claim) => (!branch || claim.branch.toLowerCase().includes(branch.trim().toLowerCase())) && (!person || claim.staffCode === person.employeeCode));
        if (!claims.length) throw new Error('No incentive claims match these options.');
        next = { kind: 'incentives', claims, subtitle: [month, branch || 'All branches', person?.fullName].filter(Boolean).join(' · ') };
      } else {
        const sections: TableSection[] = [];
        if (id === 'staff-summary') {
          const result = await hr('staff_summary_report', { ...companyParams, status: staffStatus });
          const rows = (result.rows || []).sort((a: any, b: any) => a.company.localeCompare(b.company) || a.employeeCode.localeCompare(b.employeeCode, undefined, { numeric: true }));
          for (const company of [...new Set<string>(rows.map((r: any) => r.company))]) {
            const staff = rows.filter((r: any) => r.company === company);
            sections.push({ title: `${company === 'KJ' ? 'Kajang' : 'Seri Kembangan'} · ${staff.length} staff`, note: `${rows.length} staff in total · ${staffStatus || 'All statuses'} · Employment summary`, headers: ['No.', 'Code', 'Staff name', 'Position', 'Department', 'Employment type', 'Joined', 'Confirmed', 'Last day', 'Status'], rows: staff.map((p: any, index: number) => [index + 1, p.employeeCode, p.fullName, p.designation || '—', p.department || '—', p.employmentType || '—', dateLabel(p.joinDate), dateLabel(p.confirmDate), dateLabel(p.resignDate), p.status === 'Active' && p.joinDate > day() ? 'Upcoming' : p.status]) });
          }
        } else if (id === 'roster') {
          const result = await hr('roster', { month });
          const dates = Array.from({ length: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
          const days = new Map((result.days || []).map((item: { id: string; date: string; shift: string }) => [`${item.id}|${item.date}`, item.shift]));
          const roster = (result.people || []).filter((row: { id: string; company: string; code: string; designation: string }) => matches(row) && (group === 'doctors') === /\b(DR|DOCTOR)\b/i.test(row.designation)).sort((a: { company: string; name: string }, b: { company: string; name: string }) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
          sections.push({ roster: true, note: `${group === 'doctors' ? 'Doctors' : 'Staff'} · ${codes === 'new' ? 'AraOffice codes' : 'Infotech codes'} · AM: day; PM: night; OH: office hours; OFF: off day; REST: rest day; AL: annual leave; MC/ML: medical leave; PH: public holiday; ·: no roster`, headers: ['Staff', ...dates.map((value) => value.slice(8))], rows: roster.map((row: { id: string; name: string; company: string; code: string }) => [`${row.name}\n${row.company} · ${row.code}`, ...dates.map((value) => { const shift = days.get(`${row.id}|${value}`) as string | undefined; return shift ? codes === 'new' ? newCode(shift) : shift : '·'; })]) });
        } else if (id === 'attendance-daily') {
          const result = await hr('attendance_daily', { date });
          sections.push({ headers: ['Staff', 'Company / code', 'Shift', 'In', 'Out', 'Late (min)', 'Status'], rows: (result.rows || []).filter(matches).map((row: any) => [row.name, `${row.company} · ${row.code}`, row.shift || '—', row.inTime || '—', row.outTime || '—', row.lateCounted, row.status]) });
        } else if (id === 'attendance-monthly') {
          const result = await hr('attendance_month', { month });
          sections.push({ headers: ['Staff', 'Company / code', 'Expected', 'Present', 'Absent', 'Leave', 'Late days', 'Late min', 'Worked (h)', 'OT approved (h)', 'OT waiting (h)'], rows: (result.rows || []).filter(matches).map((row: any) => [row.name, `${row.company} · ${row.code}`, row.expected, row.present, row.absent, row.leave, row.lateDays, row.lateMinutes, num(row.workedMinutes / 60), num(row.otApprovedMinutes / 60), num(row.otWaitingMinutes / 60)]) });
        } else if (id === 'attendance-late') {
          const result = await hr('attendance_late_pattern');
          sections.push({ note: `Last six months · ${result.grace}-minute grace · monthly cells show days / minutes late`, headers: ['Staff', 'Company / code', ...(result.months || []), 'Total days'], rows: (result.rows || []).filter(matches).map((row: any) => [row.name, `${row.company} · ${row.code}`, ...row.perMonth.map((item: any) => `${item.days} / ${item.minutes}m`), row.total]) });
        } else if (id === 'leave-consolidate') {
          const result = await hr('leave_consolidate', { year: String(year), ...companyParams });
          sections.push({ headers: ['Staff', 'Company / code', 'AL eligible', 'AL BF', 'AL credit', 'AL earned', 'AL taken', 'AL balance', 'ML eligible', 'ML taken', 'ML balance'], rows: (result.rows || []).filter(matches).map((row: any) => [row.name, `${row.company} · ${row.code}`, num(row.al?.eligible), num(row.al?.broughtForward), num(row.al?.credit), num(row.al?.earn), num(row.al?.taken), num(row.al?.balance), num(row.ml?.eligible), num(row.ml?.taken), num(row.ml?.balance)]) });
        } else if (id === 'leave-gcr') {
          const result = await hr('leave_gcr', { year: String(year), ...companyParams });
          sections.push({ note: `Eligibility: at least ${result.settings?.minUsedPercent}% used · maximum ${result.settings?.maxDays} days paid`, headers: ['Staff', 'Company / code', 'Eligible', 'Used', '% used', 'Burn', 'Unused', 'Qualifies', 'Can pay', 'Chosen / paid', 'Carry fwd'], rows: (result.rows || []).filter((row: any) => row.gcr && matches(row)).map((row: any) => [row.name, `${row.company} · ${row.code}`, num(row.gcr.eligible), num(row.gcr.eligibleUsed), `${num(row.gcr.percentUsed)}%`, num(row.gcr.burn), num(row.gcr.eligibleUnused), row.gcr.qualifies ? 'Yes' : 'No', num(row.gcr.maxPay), num(row.gcr.paid), num(row.gcr.carry)]) });
        } else if (id === 'leave-credit') {
          const result = await hr('leave_credit_report', { from, to, ...companyParams });
          sections.push({ headers: ['Staff', 'Company / code', 'Date', 'Remarks', 'Days'], rows: (result.people || []).filter(matches).flatMap((row: any) => row.credits.map((credit: any) => [row.name, `${row.company} · ${row.code}`, dateLabel(credit.date), credit.remarks, num(credit.days)])) });
        } else if (id === 'leave-history') {
          const result = await hr('leave_history_report', { from, to, ...companyParams });
          for (const row of (result.people || []).filter(matches)) sections.push({ title: `${row.name} · ${row.company} · ${row.code}`, note: `Annual Leave balance: ${num(row.al?.balance)} · Medical Leave balance: ${num(row.ml?.balance)}`, headers: ['Leave type', 'From', 'To', 'Days', 'Remarks'], rows: row.requests.map((request: any) => [request.type, dateLabel(request.start), dateLabel(request.end), num(request.days), request.reason || '—']) });
        }
        if (!sections.some((section) => section.rows.length)) throw new Error('No records match these options.');
        next = { kind: 'table', sections, subtitle };
      }
      setPrepared(next); setPreviewKey(selectionKey);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to prepare this report.'); }
    finally { setBusy(false); }
  };
  const rowsPerPage = id === 'staff-summary' ? 24 : 10;
  const pages = prepared?.kind === 'table' ? prepared.sections.flatMap((section) => Array.from({ length: Math.max(1, Math.ceil(section.rows.length / rowsPerPage)) }, (_, index) => ({ ...section, rows: section.rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage) }))) : [];

  const download = async (format: 'csv' | 'excel') => {
    if (!ready || !prepared) return;
    setExporting(true); setError(''); setNotice('');
    try {
      const sections = reportExportSections(prepared, reveal).map((section) => ({ ...section, note: [title, prepared.kind === 'table' || prepared.kind === 'incentives' || prepared.kind === 'forecast' ? prepared.subtitle : '', section.note].filter(Boolean).join(' · ') }));
      const name = `${title} - ${id === 'forecast' ? `${forecastFrom} to ${forecastTo}` : needsMonth ? month : needsYear ? year : needsRange ? `${from} to ${to}` : date}`.replace(/[\\/:*?"<>|]/g, '-');
      if (format === 'csv') downloadReportCsv(sections, name);
      else await downloadReportExcel(sections, name);
      setNotice(`${format === 'csv' ? 'CSV' : 'Excel'} downloaded.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to download this report.'); }
    finally { setExporting(false); }
  };
  const tableContent = (page: TableSection, index: number) => <div className={`cv-fit hr-table-print${id === 'roster' ? ' hr-roster-table' : id === 'staff-summary' ? ' hr-staff-summary' : page.headers.length > 8 ? ' hr-table-wide' : ''}`}>
    <header><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" /><div><p>KLINIK ARA 24 JAM · HUMAN RESOURCES</p><h1>{title}</h1><p>{prepared?.kind === 'table' ? prepared.subtitle : ''}</p>{page.title && <h2>{page.title}</h2>}</div></header>
    {page.note && <p className="hr-table-note">{page.note}</p>}
    {page.roster && <div className="hr-roster-legend" aria-label="Shift colour legend">{rosterColors.map((color) => <span key={color.label} style={{ backgroundColor: color.backgroundColor, color: color.textColor }}>{color.label}</span>)}</div>}
    <table><thead><tr>{page.headers.map((heading, column) => <th key={column}>{heading}</th>)}</tr></thead><tbody>{page.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, column) => <td key={column} style={(() => { const color = page.roster && column > 0 ? rosterShiftColor(value) : undefined; return color ? { backgroundColor: color.backgroundColor, color: color.textColor, fontWeight: 700 } : undefined; })()}>{value ?? '—'}</td>)}</tr>)}</tbody></table>
    <footer>Printed {dateLabel(day())} · Page {index + 1} of {pages.length}</footer>
  </div>;
  return <>
    <dialog ref={dialog} onCancel={(event) => { if (busy || printing || exporting) event.preventDefault(); else onClose(); }} className={`review-compact report-options m-auto max-h-[90vh] w-[calc(100%_-_32px)] ${ready ? 'max-w-[1120px]' : 'max-w-[560px]'} overflow-y-auto rounded-3xl bg-white p-6 text-[#14233b] shadow-2xl backdrop:bg-slate-950/40`} aria-labelledby="report-options-title">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#0b9aca]">Report options</p><h2 id="report-options-title" className="mt-1 text-xl font-semibold">{title}</h2></div><button type="button" disabled={busy || printing || exporting} onClick={onClose} aria-label="Close report options" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <form onSubmit={(event) => void run(event)} className="mt-5 space-y-4">
        <fieldset disabled={busy || printing || exporting} className="grid gap-4 sm:grid-cols-2">
        {needsMonth && <label className="block text-sm font-semibold">Month<input type="month" required value={month} onChange={(event) => setMonth(event.target.value)} className={field} /></label>}
        {id === 'attendance-daily' && <label className="block text-sm font-semibold">Date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={field} /></label>}
        {needsYear && <label className="block text-sm font-semibold">Year<input type="number" required min="2000" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} className={field} /></label>}
        {needsRange && <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-semibold">From<input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} className={field} /></label><label className="block text-sm font-semibold">To<input type="date" required min={from} value={to} onChange={(event) => setTo(event.target.value)} className={field} /></label></div>}
        {id === 'forecast' && <><label className="block text-sm font-semibold">From month<input aria-label="Forecast report from month" type="month" required value={forecastFrom} onChange={(e) => { const value = e.target.value; setForecastFrom(value); if (value && (forecastTo < value || forecastTo > shiftProjectionMonth(value, 11))) setForecastTo(shiftProjectionMonth(value, 11)); }} className={field} /></label><label className="block text-sm font-semibold">To month<input aria-label="Forecast report to month" type="month" required min={forecastFrom} max={forecastFrom ? shiftProjectionMonth(forecastFrom, 11) : undefined} value={forecastTo} onChange={(e) => setForecastTo(e.target.value)} className={field} /></label></>}
        {id === 'staff-summary' && <label className="block text-sm font-semibold">Staff status<select aria-label="Summary staff status" value={staffStatus} onChange={(e) => setStaffStatus(e.target.value)} className={field}><option value="Active">Active staff (including upcoming starters)</option><option value="">All staff, including inactive</option><option value="Inactive">Inactive staff</option></select></label>}
        {!['performance', 'incentives'].includes(id) && <label className="block text-sm font-semibold">Company<select value={company} onChange={(event) => { setCompany(event.target.value); setEmployeeId(''); }} className={field}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>}
        {!['performance', 'staff-summary', 'forecast'].includes(id) && <label className="block text-sm font-semibold">Staff member<select required={id === 'staff-profile'} disabled={loading} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className={field}><option value="">{loading ? 'Loading staff…' : id === 'staff-profile' ? 'Choose staff…' : 'All staff'}</option>{peopleShown.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.company} · {item.employeeCode}</option>)}</select></label>}
        {id === 'roster' && <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-semibold">Roster for<select value={group} onChange={(event) => setGroup(event.target.value)} className={field}><option value="staff">Staff</option><option value="doctors">Doctors</option></select></label><label className="block text-sm font-semibold">Shift codes<select value={codes} onChange={(event) => setCodes(event.target.value)} className={field}><option value="new">AraOffice codes</option><option value="original">Infotech codes</option></select></label></div>}
        {id === 'incentives' && <label className="block text-sm font-semibold">Branch (optional)<input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="All branches" className={field} /></label>}
        {id === 'performance' && <label className="block text-sm font-semibold">Submitted review<select required disabled={loading} value={reviewId} onChange={(event) => setReviewId(event.target.value)} className={field}><option value="">{loading ? 'Loading reviews…' : 'Choose review…'}</option>{reviews.map((item) => <option key={item.id} value={item.id}>{item.staffName} · {item.periodLabel}</option>)}</select></label>}
        {id === 'staff-profile' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reveal} onChange={(event) => setReveal(event.target.checked)} />Include private details in this print</label>}
        {id === 'attendance-late' && <p className="text-sm text-slate-500">Includes the last six months of late attendance.</p>}
        <p className="text-xs text-slate-500 sm:col-span-2">{id === 'forecast' ? 'Uses saved HR forecast edits. One PDF page per branch, each with the ARA logo. Edit the forecast under Staff Profiles → Forecast.' : id === 'staff-summary' ? 'All roles are included. Choose a branch and staff status, then preview the summary.' : 'Individual selections show active staff only. Preview first, then download or print the same report.'}</p>
        </fieldset>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        {prepared && !ready && <p role="status" className="text-sm text-amber-700">Options changed. Press Preview to refresh the report.</p>}
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-y border-slate-100 bg-white py-3">
          <button disabled={loading || busy || printing || exporting} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Eye className="h-4 w-4" />{busy ? 'Preparing…' : 'Preview'}</button>
          <button type="button" disabled={!ready || busy || printing || exporting} onClick={() => void download('csv')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-[#0b587b] disabled:opacity-40"><Download className="h-4 w-4" />Download CSV</button>
          <button type="button" disabled={!ready || busy || printing || exporting} onClick={() => void download('excel')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-[#0b587b] disabled:opacity-40"><Download className="h-4 w-4" />Download Excel</button>
          <button type="button" disabled={!ready || busy || printing || exporting} onClick={() => setPrinting(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#0b587b] disabled:opacity-40"><Printer className="h-4 w-4" />{printing ? 'Printing…' : 'Print / PDF'}</button>
        </div>

      </form>
      {ready && prepared && <section aria-label="Report preview" className="report-preview mt-5 overflow-auto rounded-xl border border-slate-200 bg-slate-200 p-4">
        {prepared.kind === 'table' && pages.map((page, index) => <div key={index}><ReportPreviewFrame><div className="report-preview-landscape">{tableContent(page, index)}</div></ReportPreviewFrame></div>)}
        {prepared.kind === 'profile' && <ReportPreviewFrame portrait><StaffProfileDocument employee={prepared.employee} career={prepared.career} reveal={reveal} /></ReportPreviewFrame>}
        {prepared.kind === 'review' && <ReportPreviewFrame portrait><ReviewDocument review={prepared.review} /></ReportPreviewFrame>}
        {prepared.kind === 'incentives' && <><ReportPreviewFrame>{Array.from({ length: Math.ceil(prepared.claims.length / 12) }, (_, index) => <div key={index} className="report-preview-landscape"><MonthSummary claims={prepared.claims.slice(index * 12, (index + 1) * 12)} title={prepared.subtitle} /></div>)}{prepared.claims.map((claim) => <ClaimPages key={claim.id} claim={claim} />)}</ReportPreviewFrame></>}
        {prepared.kind === 'forecast' && prepared.branches.map((branch) => <div key={branch}><ReportPreviewFrame><div className="report-preview-landscape"><div className="cv-fit"><HRProjectionDocument {...prepared} branches={[branch]} compact /></div></div></ReportPreviewFrame></div>)}
      </section>}
    </dialog>
    {printing && prepared?.kind === 'profile' && <StaffProfilePrint employee={prepared.employee} career={prepared.career} reveal={reveal} />}
    {printing && prepared?.kind === 'review' && <ReviewSheet review={prepared.review} />}
    {printing && prepared?.kind === 'table' && <PrintPortal margin={10}>{pages.map((page, index) => <PrintPage key={index}>{tableContent(page, index)}</PrintPage>)}</PrintPortal>}
    {printing && prepared?.kind === 'incentives' && <PrintPortal>{Array.from({ length: Math.ceil(prepared.claims.length / 12) }, (_, index) => <PrintPage key={index}><MonthSummary claims={prepared.claims.slice(index * 12, (index + 1) * 12)} title={`${prepared.subtitle} · ${index + 1}`} /></PrintPage>)}{prepared.claims.map((claim) => <ClaimPages key={claim.id} claim={claim} />)}</PrintPortal>}
    {printing && prepared?.kind === 'forecast' && <PrintPortal margin={8}>{prepared.branches.map((branch) => <PrintPage key={branch}><div className="cv-fit"><HRProjectionDocument {...prepared} branches={[branch]} compact /></div></PrintPage>)}</PrintPortal>}
  </>;
}
