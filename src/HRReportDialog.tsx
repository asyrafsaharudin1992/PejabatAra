import { FormEvent, useEffect, useRef, useState } from 'react';
import { bulk, bulkYear } from './lib/bulkReports';
import { PeriodPicker } from './PeriodPicker';
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
import { PrintMenu } from './PrintMenu';
import { RosterDutyDocument, type DutyData } from './RosterDutyReport';
import { downloadReportCsv, downloadReportExcel, reportExportSections, type PreparedReport as Prepared, type ReportSection } from './lib/hrReportExport';
import HRProjectionDocument from './HRProjectionDocument';
import { buildOtClaimPages, generatedAt, OtClaimPage, otClaimSections, type Staff as OtStaff } from './OtClaimBlock';
import { projectionMonths, shiftProjectionMonth } from './lib/hrProjection';

type Person = { id: string; company: string; fullName: string; employeeCode: string; status: string };
type TableSection = ReportSection;

const day = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const dateLabel = (date: string) => date ? date.slice(0, 10).split('-').reverse().join('/') : '—';
const num = (value: number | undefined | null) => value == null ? '—' : Number(value).toFixed(2);
const field = 'mt-1 block h-10 w-auto min-w-[150px] max-w-[260px] rounded-xl border border-slate-200 bg-white px-3 text-sm';
// A payroll month runs from the 20th of the month before to the 19th (Nov payroll: 20 Oct to 19 Nov).
const payrollRangeOf = (value: string) => { const [year, number] = value.split('-').map(Number); const before = new Date(year, number - 2, 1); return { from: `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, '0')}-20`, to: `${value}-19` }; };
const monthRangeOf = (value: string) => ({ from: `${value}-01`, to: new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5)), 0)).toISOString().slice(0, 10) });
const hoursOf = (minutes: number) => (minutes / 60).toFixed(2);
async function hr(action: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ resource: 'hr', action, ...params });
  const response = await officeFetch(`/api/status?${query}`);
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Unable to prepare this report.');
  return result;
}

// Reports fetch only the records needed for printing. No management screens or write actions mount here.
export function HRReportDialog({ id, title, onClose, rosterGroup }: { id: string; title: string; onClose: () => void; rosterGroup?: 'staff' | 'doctors' }) {
  const [month, setMonth] = useState(bulk.active && bulk.month ? bulk.month : day().slice(0, 7));
  const [date, setDate] = useState(day());
  const [year, setYear] = useState(bulk.active ? bulkYear() : Number(day().slice(0, 4)));
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [company, setCompany] = useState<string>(bulk.active ? bulk.company : '');
  const [staffStatus, setStaffStatus] = useState('Active');
  const [forecastFrom, setForecastFrom] = useState('2026-01'), [forecastTo, setForecastTo] = useState('2026-12');
  const [employeeId, setEmployeeId] = useState('');
  const [group, setGroup] = useState<string>(rosterGroup || 'staff');
  const [codes, setCodes] = useState('new');
  const [branch, setBranch] = useState('');
  const [reveal, setReveal] = useState(false);
  const [otBasis, setOtBasis] = useState<'payroll' | 'month'>('payroll');
  const [otStatus, setOtStatus] = useState('');
  const [design, setDesign] = useState<'usual' | 'araoffice'>(rosterGroup === 'doctors' ? 'usual' : 'araoffice');
  const [rosterVersion, setRosterVersion] = useState<'current' | 'original'>('current');
  const [reviewId, setReviewId] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  type ReviewItem = { id: string; staffName: string; employeeCode: string; position?: string; assessorName?: string; periodLabel: string; periodEnd?: string; status: string; totalScore?: number | null; overall?: string; submittedAt?: string | null; hrReceivedOn?: string | null; formType?: string };
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [previewKey, setPreviewKey] = useState('');
  const selectionKey = JSON.stringify([month, date, year, from, to, company, employeeId, group, codes, branch, reveal, reviewId, staffStatus, forecastFrom, forecastTo, otBasis, otStatus, design, rosterVersion]);
  const ready = prepared !== null && previewKey === selectionKey;
  const printTitle = `${title} - ${id === 'forecast' ? `${forecastFrom} to ${forecastTo}` : month}`;
  usePrintSheet(printing && (prepared?.kind === 'table' || prepared?.kind === 'incentives' || prepared?.kind === 'forecast' || prepared?.kind === 'otclaims' || prepared?.kind === 'duty'), printTitle, () => setPrinting(false));
  useStaffProfilePrint(printing && prepared?.kind === 'profile', `Staff Profile - ${prepared?.kind === 'profile' ? prepared.employee.fullName : ''}`, () => setPrinting(false));
  useReviewPrint(printing && prepared?.kind === 'review', `Performance Review - ${prepared?.kind === 'review' ? prepared.review.staffName : ''}`, () => setPrinting(false));

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
  const needsMonth = ['roster', 'attendance-monthly', 'incentives', 'ot-claims'].includes(id);
  const needsRange = ['leave-credit', 'leave-history', 'credit-hours', 'attendance-late', 'performance'].includes(id);
  // The submitted reviews inside the chosen period, company and staff member.
  const inScope = reviews.filter((item) => { const day = String(item.submittedAt || item.periodEnd || '').slice(0, 10); const own = people.find((person) => person.employeeCode === item.employeeCode); return item.status === 'submitted' && day >= from && day <= to && (!company || own?.company === company) && (!employeeId || own?.id === employeeId); });
  const needsYear = ['leave-consolidate', 'leave-gcr'].includes(id);
  const peopleShown = people.filter((item) => !company || item.company === company);

  // The Monthly Roster in HR's usual layout: one page for each company (or the chosen one), with the weeks (Monday to Sunday) that end in the month.
  const buildDutyPages = async (): Promise<DutyData[]> => {
    const [yearNumber, monthNumber] = month.split('-').map(Number);
    const monthMode = design === 'araoffice' && group !== 'doctors';
    const last = new Date(Date.UTC(yearNumber, monthNumber, 0));
    let end = last; if (!monthMode) while (end.getUTCDay() !== 0) end = new Date(end.getTime() - 86400000);
    let start = new Date(Date.UTC(yearNumber, monthNumber - 1, 1)); if (!monthMode) while (start.getUTCDay() !== 1) start = new Date(start.getTime() - 86400000);
    const iso = (value: Date) => value.toISOString().slice(0, 10);
    const dates: string[] = []; for (let at = start; at <= end; at = new Date(at.getTime() + 86400000)) dates.push(iso(at));
    const previous = start.getUTCMonth() !== monthNumber - 1 ? `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}` : '';
    const twoVersions = month >= '2026-12';
    const asked = rosterVersion;
    const [now, before, holidayResult, ot, leave, everyone, log] = await Promise.all([hr('roster', asked === 'original' ? { month, version: 'original' } : { month }), previous ? hr('roster', { month: previous }) : Promise.resolve({ days: [] }), hr('holidays'), hr('attendance_ot_claims', { from: dates[0], to: dates[dates.length - 1] }), hr('leave_requests', { year: String(yearNumber) }), hr('employees'), asked === 'current' && twoVersions ? hr('roster_log', { month }) : Promise.resolve({ log: [] })]);
    const savedAt: string = now.original?.savedAt || '';
    const peopleByCode = new Map<string, string>((now.people || []).map((row: { code: string; id: string }) => [row.code, row.id]));
    const changes = ((log.log || []) as { at: string; by: string; name: string; code: string; date: string; from: string; to: string }[]).filter((item) => item.date >= dates[0] && item.date <= dates[dates.length - 1] && (!savedAt || item.at >= savedAt)).map((item) => ({ ...item, staffId: peopleByCode.get(item.code) || '' }));
    const shift: Record<string, string> = {}, notes: Record<string, string> = {};
    for (const day of [...(before.days || []), ...(now.days || [])]) { shift[`${day.id}|${day.date}`] = day.shift; if (day.note) notes[`${day.id}|${day.date}`] = day.note; }
    const holidays = (holidayResult.holidays || []).filter((item: { date?: string; holidayDate?: string }) => { const day = item.date || item.holidayDate || ''; return day >= dates[0] && day <= dates[dates.length - 1]; }).map((item: { date?: string; holidayDate?: string; name: string }) => ({ date: item.date || item.holidayDate || '', name: item.name }));
    const seen = new Set<string>();
    const uniqueHolidays = holidays.filter((item: { date: string; name: string }) => { const key = `${item.date}|${item.name}`; if (seen.has(key)) return false; seen.add(key); return true; });
    const wanted = (group === 'doctors');
    const places = company ? [company] : ['KJ', 'SK'];
    const pages: DutyData[] = [];
    for (const place of places) {
      const staff = (now.people || []).filter((row: { id: string; company: string; designation: string }) => row.company === place && (wanted ? /\b(DR|DOCTOR)\b/i.test(row.designation) : /CLINIC ASSISTANT/i.test(row.designation) && !/\b(DR|DOCTOR)\b/i.test(row.designation)) && dates.some((date) => shift[`${row.id}|${date}`])).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)).map((row: { id: string; name: string; short?: string }) => ({ id: row.id, name: (row.short || row.name.split(' ')[0]).toUpperCase() }));
      if (!staff.length) continue;
      const ids = new Set(staff.map((person: { id: string }) => person.id));
      const nameOf = new Map(staff.map((person: { id: string; name: string }) => [person.id, person.name]));
      const requests = new Map<string, string[]>();
      for (const item of (leave.requests || []) as { employeeId?: string; applicantId?: string; applicant: string; code: string; company: string; start: string; end: string; status: string }[]) {
        if (item.status !== 'approved' || item.company !== place) continue;
        const own = (now.people || []).find((row: { code: string }) => row.code === item.code); if (!own || !ids.has(own.id)) continue;
        for (let at = new Date(`${item.start}T00:00:00Z`); iso(at) <= item.end; at = new Date(at.getTime() + 86400000)) { const day = iso(at); if (day >= `${month}-01` && day <= iso(last)) requests.set(nameOf.get(own.id) as string, [...(requests.get(nameOf.get(own.id) as string) || []), day]); }
      }
      const overtime: DutyData['overtime'] = [];
      for (const row of (ot.staff || []) as OtStaff[]) { if (row.company !== place || !ids.has(row.id)) continue; for (const claim of row.claims) if (claim.status === 'Approved' && claim.approvedMinutes > 0 && claim.date >= `${month}-01` && claim.date <= iso(last)) overtime.push({ name: String(nameOf.get(row.id)), date: claim.date, text: `${claim.typedIn || ''} - ${claim.typedOut || ''} (${Math.round(claim.approvedMinutes / 6) / 10}HRS)` }); }
      const resigns = ((everyone.employees || []) as { company: string; fullName: string; resignDate?: string | null }[]).filter((row) => row.company === place && row.resignDate && row.resignDate >= `${month}-01` && row.resignDate <= iso(last)).map((row) => ({ name: row.fullName, date: String(row.resignDate) }));
      pages.push({ title: `DUTY ROSTER ${wanted ? 'DOCTORS' : 'CLINIC ASSISTANT'} ${new Date(Date.UTC(yearNumber, monthNumber - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase()}`, company: place === 'KJ' ? 'KAJANG' : 'SERI KEMBANGAN', monthLabel: new Date(Date.UTC(yearNumber, monthNumber - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase(), staff, dates, shift, notes, holidays: uniqueHolidays, requests: [...requests.entries()].map(([name, days]) => ({ name, dates: days.sort() })), resigns, overtime: overtime.sort((a, b) => a.date.localeCompare(b.date)), signer: { name: "DR. AHMAD SYAFIQ BIN SO'IB", title: 'KETUA PEGAWAI SUMBER MANUSIA' }, version: twoVersions ? asked : undefined, savedAt: savedAt || undefined, changes: asked === 'current' && twoVersions ? changes.filter((item) => item.staffId && ids.has(item.staffId)).sort((x, y) => x.at.localeCompare(y.at)) : [], style: monthMode ? 'araoffice' : undefined, doctors: wanted, letterhead: { name: 'HSO Healthcare Sdn Bhd', lines: ['202201004242 (1449939-U)', 'TIN: C29715204010', place === 'KJ' ? 'D-13-GA Jalan Prima Saujana 2/F, Taman Prima Saujana, 43000 Kajang, Selangor' : 'H-7-1, Jalan PP25, Putra Walk Block H, Taman Pinggiran Putra, Seri Kembangan, Selangor', 'operation@hsohealthcare.com', '+60182194256'] } });
    }
    return pages;
  };
  const runId = useRef(0);
  const run = async (event?: FormEvent) => {
    event?.preventDefault(); const mine = ++runId.current; setError(''); setNotice(''); setBusy(true); setPrepared(null);
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
      } else if (id === 'roster') {
        const pages = await buildDutyPages();
        if (!pages.length) throw new Error('No roster for these options.');
        next = { kind: 'duty', pages, sections: pages.map((page) => ({ title: `${page.title} · ${page.company}`, headers: ['Date', 'Day', ...page.staff.map((person) => person.name)], rows: page.dates.map((date) => [date.split('-').reverse().join('/'), new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), ...page.staff.map((person) => page.shift[`${person.id}|${date}`] || '')]) })), subtitle: [month, company || 'KJ and SK'].join(' · ') };
      } else if (id === 'performance' && reviewId && inScope.some((item) => item.id === reviewId)) {
        const result = await reviewApi(`action=hr_get&id=${encodeURIComponent(reviewId)}`);
        if (!result.review || result.review.status === 'pending') throw new Error('Choose a submitted review to print.');
        next = { kind: 'review', review: result.review };
      } else if (id === 'performance') {
        // The submitted reviews of the period (by the date they were submitted) for the chosen company and staff, as one table; pick one under "Show form" to see that form itself.
        if (!inScope.length) throw new Error('No submitted performance reviews match these options.');
        const table: TableSection[] = [];
        table.push({ note: `${dateLabel(from)} – ${dateLabel(to)} · ${inScope.length} ${inScope.length === 1 ? 'review' : 'reviews'}`, headers: ['No.', 'Staff', 'Company / code', 'Position', 'Review', 'Supervisor', 'Submitted', 'Score', 'Overall', 'Received by HR'], rows: inScope.map((item, index) => { const own = people.find((person) => person.employeeCode === item.employeeCode); return [String(index + 1), item.staffName, `${own?.company || ''} · ${item.employeeCode}`, item.position || '', item.periodLabel, item.assessorName || '', item.submittedAt ? dateLabel(item.submittedAt.slice(0, 10)) : '', item.totalScore === null || item.totalScore === undefined ? '' : String(item.totalScore), item.overall || '', item.hrReceivedOn ? dateLabel(String(item.hrReceivedOn).slice(0, 10)) : '']; }) });
        next = { kind: 'table', sections: table, subtitle };
      } else if (id === 'ot-claims') {
        const range = otBasis === 'payroll' ? payrollRangeOf(month) : monthRangeOf(month);
        const result = await hr('attendance_ot_claims', range);
        const staff: OtStaff[] = (result.staff || []).filter((row: OtStaff) => (!company || row.company === company) && (!person || row.code === person.employeeCode)).map((row: OtStaff) => ({ ...row, claims: row.claims.filter((claim) => !otStatus || claim.status === otStatus) })).filter((row: OtStaff) => row.claims.length);
        if (!staff.length) throw new Error(`No OT claims match these options (${range.from} to ${range.to}, ${company || 'KJ and SK'}${otStatus ? `, ${otStatus}` : ''}; the server found ${(result.staff || []).length} staff with OT in that period).`);
        const label = otBasis === 'payroll' ? `Payroll ${month} (${range.from.split('-').reverse().join('-')} to ${range.to.split('-').reverse().join('-')})` : month;
        next = { kind: 'otclaims', staff, from: range.from, to: range.to, company, filterText: [company || 'All locations', otStatus || 'All statuses', person?.fullName].filter(Boolean).join(' · '), sections: otClaimSections(staff), subtitle: [label, company || 'KJ and SK', otStatus].filter(Boolean).join(' · ') };
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
          const result = await hr('attendance_late_days', { from, to });
          const list = (result.rows || []).filter(matches);
          // One block for each person (their name, then every late day in date order, then their total), like the Infotech reports.
          const byPerson = new Map<string, any[]>();
          for (const row of list) { const key = `${row.company}|${row.code}`; byPerson.set(key, [...(byPerson.get(key) || []), row]); }
          // The first page is the summary of everyone; each person's own blocks follow.
          const people = [...byPerson.values()].sort((x, y) => x[0].name.localeCompare(y[0].name));
          const sumMinutes = (rows: any[]) => rows.reduce((total: number, row: any) => total + row.lateMinutes, 0);
          sections.push({ title: 'Summary of all staff', note: `${dateLabel(from)} – ${dateLabel(to)} · ${result.grace}-minute grace`, headers: ['No.', 'Staff', 'Company / code', 'Days late', 'Minutes late'], rows: [...people.map((rows, index) => [String(index + 1), rows[0].name, `${rows[0].company} · ${rows[0].code}`, String(rows.length), String(sumMinutes(rows))]), ['', 'Total', `${people.length} staff`, String(list.length), String(sumMinutes(list))]] });
          for (const rows of people) {
            const minutes = rows.reduce((total: number, row: any) => total + row.lateMinutes, 0);
            sections.push({ title: `${rows[0].name} · ${rows[0].company} · ${rows[0].code}`, note: `${dateLabel(from)} – ${dateLabel(to)} · ${rows.length} ${rows.length === 1 ? 'day' : 'days'} late · ${minutes} minutes in total · ${result.grace}-minute grace`, headers: ['No.', 'Date', 'Day', 'Shift', 'Shift starts', 'Clocked in', 'Minutes late'], rows: [...rows.map((row: any, index: number) => [String(index + 1), dateLabel(row.date), new Date(`${row.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }), row.shift, row.startTime, row.inTime, String(row.lateMinutes)]), ['', '', '', '', '', 'Total', `${minutes} (${rows.length} days)`]] });
          }
        } else if (id === 'leave-consolidate') {
          const result = await hr('leave_consolidate', { year: String(year), ...companyParams });
          sections.push({ headers: ['Staff', 'Company / code', 'AL eligible', 'AL BF', 'AL credit', 'AL earned', 'AL taken', 'AL balance', 'ML eligible', 'ML taken', 'ML balance'], rows: (result.rows || []).filter(matches).map((row: any) => [row.name, `${row.company} · ${row.code}`, num(row.al?.eligible), num(row.al?.broughtForward), num(row.al?.credit), num(row.al?.earn), num(row.al?.taken), num(row.al?.balance), num(row.ml?.eligible), num(row.ml?.taken), num(row.ml?.balance)]) });
        } else if (id === 'leave-gcr') {
          const result = await hr('leave_gcr', { year: String(year), ...companyParams });
          sections.push({ note: `Eligibility: at least ${result.settings?.minUsedPercent}% used · maximum ${result.settings?.maxDays} days paid`, headers: ['Staff', 'Company / code', 'Eligible', 'Used', '% used', 'Burn', 'Unused', 'Qualifies', 'Can pay', 'Chosen / paid', 'Carry fwd'], rows: (result.rows || []).filter((row: any) => row.gcr && matches(row)).map((row: any) => [row.name, `${row.company} · ${row.code}`, num(row.gcr.eligible), num(row.gcr.eligibleUsed), `${num(row.gcr.percentUsed)}%`, num(row.gcr.burn), num(row.gcr.eligibleUnused), row.gcr.qualifies ? 'Yes' : 'No', num(row.gcr.maxPay), num(row.gcr.paid), num(row.gcr.carry)]) });
        } else if (id === 'leave-credit') {
          const result = await hr('leave_credit_report', { from, to, ...companyParams });
          sections.push({ headers: ['Staff', 'Company / code', 'Date', 'Remarks', 'Days'], rows: (result.people || []).filter(matches).flatMap((row: any) => row.credits.map((credit: any) => [row.name, `${row.company} · ${row.code}`, dateLabel(credit.date), credit.remarks, num(credit.days)])) });
        } else if (id === 'credit-hours') {
          const result = await hr('attendance_credit_hours_report', { from, to });
          const list = (result.rows || []).filter(matches);
          sections.push({ title: 'Balance', note: `Credit hours earned and used from ${dateLabel(from)} to ${dateLabel(to)}; the balance is as of today`, headers: ['No.', 'Code', 'Staff', 'Company', 'Position', 'Earned (h)', 'Used (h)', 'Balance (h)'], rows: list.map((row: any, index: number) => [index + 1, row.code, row.name, row.company, row.designation, hoursOf(row.earned), hoursOf(row.used), hoursOf(row.balance)]) });
          sections.push({ title: 'Entries', headers: ['Staff', 'Company / code', 'Date', 'Type', 'Hours', 'Note', 'Entered by'], rows: list.flatMap((row: any) => row.entries.map((entry: any) => [row.name, `${row.company} · ${row.code}`, dateLabel(entry.date), entry.kind === 'earn' ? 'Earned' : entry.kind === 'adjust' ? 'Adjusted' : entry.kind, hoursOf(entry.minutes), entry.note, entry.by])) });
        } else if (id === 'leave-history') {
          const result = await hr('leave_history_report', { from, to, ...companyParams });
          for (const row of (result.people || []).filter(matches)) sections.push({ title: `${row.name} · ${row.company} · ${row.code}`, note: `Annual Leave balance: ${num(row.al?.balance)} · Medical Leave balance: ${num(row.ml?.balance)}`, headers: ['Leave type', 'From', 'To', 'Days', 'Remarks'], rows: row.requests.map((request: any) => [request.type, dateLabel(request.start), dateLabel(request.end), num(request.days), request.reason || '—']) });
        }
        if (!sections.some((section) => section.rows.length)) {
          // For the credit reports say where the records are, so HR can choose that payroll period or month.
          if (id === 'leave-credit') {
            const wide = await hr('leave_credit_report', { from: '2024-01-01', to: '2027-12-31', ...companyParams });
            const counts = new Map<string, number>();
            for (const row of (wide.people || []).filter(matches)) for (const credit of row.credits) { const key = String(credit.date).slice(0, 7); counts.set(key, (counts.get(key) || 0) + 1); }
            const where = [...counts.entries()].sort((x, y) => y[0].localeCompare(x[0])).map(([key, count]) => `${new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} (${count})`);
            throw new Error(where.length ? `No credits in this period. Credits were given in: ${where.join(', ')}. Choose one of those months or payroll periods above.` : 'No leave credits have been given yet.');
          }
          throw new Error('No records match these options.');
        }
        next = { kind: 'table', sections, subtitle };
      }
      if (mine !== runId.current) return;
      setPrepared(next); setPreviewKey(selectionKey);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to prepare this report.'); }
    finally { if (mine === runId.current) setBusy(false); }
  };
  // The report is built as soon as the options are complete and again whenever one changes, so it is always on the page (no Preview button).
  const complete = id === 'staff-profile' ? Boolean(employeeId) : true;
  useEffect(() => {
    if (loading) return;
    if (!complete) { runId.current += 1; setPrepared(null); setError(''); return; }
    const timer = window.setTimeout(() => void run(), 250);
    return () => window.clearTimeout(timer);
  }, [selectionKey, loading, complete]);
  const rowsPerPage = id === 'staff-summary' ? 24 : 10;
  const pages = prepared?.kind === 'table' ? prepared.sections.flatMap((section) => Array.from({ length: Math.max(1, Math.ceil(section.rows.length / rowsPerPage)) }, (_, index) => ({ ...section, rows: section.rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage) }))) : [];

  const download = async (format: 'csv' | 'excel') => {
    if (!ready || !prepared) return;
    setExporting(true); setError(''); setNotice('');
    try {
      const sections = reportExportSections(prepared, reveal).map((section) => ({ ...section, note: [title, prepared.kind === 'table' || prepared.kind === 'incentives' || prepared.kind === 'forecast' || prepared.kind === 'otclaims' ? prepared.subtitle : '', section.note].filter(Boolean).join(' · ') }));
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
    <section className="report-page space-y-4">
      <button type="button" disabled={printing || exporting} onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b] hover:underline print:hidden">← Back to Reports</button>
      <form onSubmit={(event) => { event.preventDefault(); }} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5 print:hidden"><div className="min-w-[180px] flex-1"><h2 className="text-lg font-semibold">{title}</h2></div>
        <fieldset disabled={printing || exporting} className="contents">
        {needsMonth && <div className="sm:col-span-2"><PeriodPicker monthOnly={id === 'roster'} onChange={(period) => { setMonth(period.to.slice(0, 7)); setOtBasis(period.label.startsWith('Payroll') ? 'payroll' : 'month'); }} /></div>}
        {id === 'ot-claims' && <div className="flex gap-3"><label className="block text-sm font-semibold">Status<select value={otStatus} onChange={(event) => setOtStatus(event.target.value)} className={field}><option value="">All statuses</option><option value="Approved">Approved</option><option value="Pending">Pending</option><option value="Rejected">Rejected</option><option value="Cancelled">Cancelled</option></select></label></div>}
        {id === 'attendance-daily' && <label className="block text-sm font-semibold">Date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={field} /></label>}
        {needsYear && <label className="block text-sm font-semibold">Year<input type="number" required min="2000" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} className={field} /></label>}
        {needsRange && <div className="sm:col-span-2"><PeriodPicker onChange={(period) => { setFrom(period.from); setTo(period.to); }} allowYear defaultMode="year" /></div>}
        {id === 'forecast' && <><label className="block text-sm font-semibold">From month<input aria-label="Forecast report from month" type="month" required value={forecastFrom} onChange={(e) => { const value = e.target.value; setForecastFrom(value); if (value && (forecastTo < value || forecastTo > shiftProjectionMonth(value, 11))) setForecastTo(shiftProjectionMonth(value, 11)); }} className={field} /></label><label className="block text-sm font-semibold">To month<input aria-label="Forecast report to month" type="month" required min={forecastFrom} max={forecastFrom ? shiftProjectionMonth(forecastFrom, 11) : undefined} value={forecastTo} onChange={(e) => setForecastTo(e.target.value)} className={field} /></label></>}
        {id === 'staff-summary' && <label className="block text-sm font-semibold">Staff status<select aria-label="Summary staff status" value={staffStatus} onChange={(e) => setStaffStatus(e.target.value)} className={field}><option value="Active">Active staff (including upcoming starters)</option><option value="">All staff, including inactive</option><option value="Inactive">Inactive staff</option></select></label>}
        {!['incentives'].includes(id) && <label className="block text-sm font-semibold">Company<select value={company} onChange={(event) => { setCompany(event.target.value); setEmployeeId(''); }} className={field}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>}
        {!['staff-summary', 'forecast'].includes(id) && <label className="block text-sm font-semibold">Staff member<select required={id === 'staff-profile'} disabled={loading} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className={field}><option value="">{loading ? 'Loading staff…' : id === 'staff-profile' ? 'Choose staff…' : 'All staff'}</option>{peopleShown.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.company} · {item.employeeCode}</option>)}</select></label>}
        {id === 'roster' && <div className="flex gap-3">{<label className="block text-sm font-semibold">Version<select aria-label="Roster version" value={rosterVersion} onChange={(event) => setRosterVersion(event.target.value as 'current' | 'original')} className={field}><option value="current">Current (with changes)</option><option value="original">Original (start of month)</option></select></label>}{group !== 'doctors' && <label className="block text-sm font-semibold">Design<select aria-label="Roster design" value={design} onChange={(event) => setDesign(event.target.value as 'usual' | 'araoffice')} className={field}><option value="araoffice">AraOffice style (one page)</option><option value="usual">Usual roster (duty roster sheet)</option></select></label>}</div>}
        {id === 'incentives' && <label className="block text-sm font-semibold">Branch (optional)<input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="All branches" className={field} /></label>}
        {id === 'performance' && <label className="block text-sm font-semibold">Show form<select disabled={loading} value={inScope.some((item) => item.id === reviewId) ? reviewId : ''} onChange={(event) => setReviewId(event.target.value)} className={field}><option value="">All reviews (summary table)</option>{inScope.map((item) => <option key={item.id} value={item.id}>{item.staffName} · {item.periodLabel}</option>)}</select></label>}
        {id === 'staff-profile' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reveal} onChange={(event) => setReveal(event.target.checked)} />Include private details in this print</label>}
        <p className="order-last basis-full text-xs text-slate-500">{id === 'forecast' ? 'Uses saved HR forecast edits. One PDF page per branch, each with the ARA logo. Edit the forecast under Staff Profiles → Forecast.' : id === 'staff-summary' ? 'All roles are included. Choose a branch and staff status.' : 'Individual selections show active staff only. The report appears below. Print it, or choose Download for PDF, Excel or CSV.'}</p>
        </fieldset>
        <PrintMenu onPrint={() => setPrinting(true)} onCsv={() => void download('csv')} onExcel={() => void download('excel')} pdf={{ scope: '[aria-label="Report preview"]', filename: `${id}-report`, landscape: !(['profile', 'review'].includes(String(prepared?.kind))) }} disabled={!ready || busy || printing || exporting} onError={setError} />
        {busy && !error && <p role="status" className="order-last basis-full text-sm text-slate-500">Building the report…</p>}
        {error && <p role="alert" className="order-last basis-full rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="order-last basis-full text-sm text-emerald-700">{notice}</p>}
      </form>
      {ready && prepared && <section aria-label="Report preview" className="report-preview mt-5 overflow-auto rounded-xl border border-slate-200 bg-slate-200 p-4">
        {prepared.kind === 'table' && pages.map((page, index) => <div key={index}><ReportPreviewFrame><div className="report-preview-landscape">{tableContent(page, index)}</div></ReportPreviewFrame></div>)}
        {prepared.kind === 'otclaims' && (() => { const sheets = buildOtClaimPages(prepared.staff, prepared.company); const stamp = generatedAt(); return sheets.map((sheet, index) => <div key={index}><ReportPreviewFrame><div className="report-preview-landscape"><div className="cv-fit"><OtClaimPage sheet={sheet} index={index} count={sheets.length} from={prepared.from} to={prepared.to} filterText={prepared.filterText} generated={stamp} /></div></div></ReportPreviewFrame></div>); })()}
        {prepared.kind === 'profile' && <ReportPreviewFrame portrait><StaffProfileDocument employee={prepared.employee} career={prepared.career} reveal={reveal} /></ReportPreviewFrame>}
        {prepared.kind === 'review' && <ReportPreviewFrame portrait><ReviewDocument review={prepared.review} /></ReportPreviewFrame>}
        {prepared.kind === 'incentives' && <><ReportPreviewFrame>{Array.from({ length: Math.ceil(prepared.claims.length / 12) }, (_, index) => <div key={index} className="report-preview-landscape"><MonthSummary claims={prepared.claims.slice(index * 12, (index + 1) * 12)} title={prepared.subtitle} /></div>)}{prepared.claims.map((claim) => <ClaimPages key={claim.id} claim={claim} />)}</ReportPreviewFrame></>}
        {prepared.kind === 'duty' && prepared.pages.map((page: DutyData) => <div key={page.company}><ReportPreviewFrame><RosterDutyDocument data={page} /></ReportPreviewFrame></div>)}
        {prepared.kind === 'forecast' && prepared.branches.map((branch) => <div key={branch}><ReportPreviewFrame><div className="report-preview-landscape"><div className="cv-fit"><HRProjectionDocument {...prepared} branches={[branch]} compact /></div></div></ReportPreviewFrame></div>)}
      </section>}
    </section>
    {printing && prepared?.kind === 'profile' && <StaffProfilePrint employee={prepared.employee} career={prepared.career} reveal={reveal} />}
    {printing && prepared?.kind === 'review' && <ReviewSheet review={prepared.review} />}
    {printing && prepared?.kind === 'table' && <PrintPortal margin={10}>{pages.map((page, index) => <PrintPage key={index}>{tableContent(page, index)}</PrintPage>)}</PrintPortal>}
    {printing && prepared?.kind === 'otclaims' && (() => { const sheets = buildOtClaimPages(prepared.staff, prepared.company); const stamp = generatedAt(); return <PrintPortal margin={6}>{sheets.map((sheet, index) => <PrintPage key={index}><div className="cv-fit"><OtClaimPage sheet={sheet} index={index} count={sheets.length} from={prepared.from} to={prepared.to} filterText={prepared.filterText} generated={stamp} /></div></PrintPage>)}</PrintPortal>; })()}
    {printing && prepared?.kind === 'incentives' && <PrintPortal>{Array.from({ length: Math.ceil(prepared.claims.length / 12) }, (_, index) => <PrintPage key={index}><MonthSummary claims={prepared.claims.slice(index * 12, (index + 1) * 12)} title={`${prepared.subtitle} · ${index + 1}`} /></PrintPage>)}{prepared.claims.map((claim) => <ClaimPages key={claim.id} claim={claim} />)}</PrintPortal>}
    {printing && prepared?.kind === 'duty' && <PrintPortal margin={0}>{prepared.pages.map((page: DutyData) => <PrintPage key={page.company}><div className="cv-fit"><RosterDutyDocument data={page} /></div></PrintPage>)}</PrintPortal>}
    {printing && prepared?.kind === 'forecast' && <PrintPortal margin={8}>{prepared.branches.map((branch) => <PrintPage key={branch}><div className="cv-fit"><HRProjectionDocument {...prepared} branches={[branch]} compact /></div></PrintPage>)}</PrintPortal>}
  </>;
}
