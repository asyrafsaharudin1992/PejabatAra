import { lazy, Suspense, useState } from 'react';
import { SubTabs } from './SubTabs';
import { Banknote, GitCompare, FileText, Landmark, ListPlus, Network, ArrowRight, CalendarCheck, ClipboardCheck, Clock3, Search, Wallet, CalendarDays, IdCard } from 'lucide-react';
import { card } from './AssessmentStaff';
import { HRReportDialog } from './HRReportDialog';
import { LeaveHistory } from './HRLeaveReport';
import { HRLeaveStatusReport } from './HRLeaveStatusReport';
import { HRAttendanceIndividual } from './HRAttendanceIndividual';
import { HRDownloadAll } from './HRDownloadAll';

// These reports open inside Reports (with a back button), so they can be previewed, printed and saved from here.
const EmbedPayroll = lazy(() => import('./HRPayroll').then((module) => ({ default: module.HRPayroll })));
const EmbedIncentives = lazy(() => import('./HRIncentives').then((module) => ({ default: module.HRIncentives })));
const EmbedMisc = lazy(() => import('./HRMisc').then((module) => ({ default: module.HRMisc })));
const EmbedOrgChart = lazy(() => import('./OrgChart').then((module) => ({ default: module.OrgChartPage })));
const EmbedSummary = lazy(() => import('./HRPayrollSummaryReport').then((module) => ({ default: module.HRPayrollSummaryReport })));
const EmbedPayslips = lazy(() => import('./HRPayslipsReport').then((module) => ({ default: module.HRPayslipsReport })));
const EmbedFiles = lazy(() => import('./HRPayrollFilesReport').then((module) => ({ default: module.HRPayrollFilesReport })));
const EmbedIncentiveSummary = lazy(() => import('./HRIncentiveSummaryReport').then((module) => ({ default: module.HRIncentiveSummaryReport })));
const EmbedIncentiveFiles = lazy(() => import('./HRIncentiveFilesReport').then((module) => ({ default: module.HRIncentiveFilesReport })));
const EmbedFlu = lazy(() => import('./HRFluReport').then((module) => ({ default: module.HRFluReport })));
const EmbedTax = lazy(() => import('./HRTax').then((module) => ({ default: module.HRTax })));

const REPORTS = [
  { id: 'roster-ca', category: 'Roster', title: 'Monthly Roster · Clinic Assistants', description: 'The monthly duty roster of the clinic assistants for Kajang and Seri Kembangan, in the usual duty roster sheet or the AraOffice table.', format: 'Print / PDF', icon: CalendarDays },
  { id: 'roster-doctors', category: 'Roster', title: 'Monthly Roster · Doctors', description: 'The monthly roster of the resident doctors and locums, with the doctors as letters under OH, AM, PM and OFF.', format: 'Print / PDF', icon: CalendarDays },
  { id: 'staff-profile', category: 'Staff Profiles', title: 'Staff Profile', description: 'Individual personal, employment, pay, family and education details.', format: 'Print / PDF', icon: IdCard },
  { id: 'staff-summary', category: 'Staff Profiles', title: 'Staff Profile Summary', description: 'All staff in one summary: staff codes, positions, branches, joining and confirmation dates.', format: 'CSV / Excel / PDF', icon: IdCard },
  { id: 'forecast', category: 'Staff Profiles', title: 'Forecast', description: 'Monthly CA staffing forecast with saved HR edits. Kajang and Seri Kembangan each on their own branded page.', format: 'CSV / Excel / PDF', icon: CalendarDays },
  { id: 'leave-consolidate', category: 'Leave', title: 'Leave Consolidate', description: 'Annual and medical leave entitlement, taken days and balances per staff member.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'leave-credit', category: 'Leave', title: 'Credit Annual Leave', description: 'Additional annual leave credits by staff member, reason and period.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'leave-gcr', category: 'Leave', title: 'GCR', description: 'Leave eligible for payment, forfeited days and balances to carry forward.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'leave-history', category: 'Leave', title: 'Leave History', description: 'Individual approved leave history with annual and medical leave balances, in the Infotech layout. Choose a payroll period or a month.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'leave-status', category: 'Leave', title: 'Leave Status', description: 'Every leave request of a payroll period or month: status, who it waits for or who approved it, comments, and the dates applied and approved.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'attendance-individual', category: 'Attendance', title: 'Individual Attendance', description: 'Every day of each person in the Infotech layout (clocks, shift, late, early out, OT), with the odd days marked. Choose a payroll period or a month.', format: 'Print / PDF', icon: Clock3 },
  { id: 'attendance-daily', category: 'Attendance', title: 'Daily Attendance', description: 'Daily shifts, clock times, late minutes and attendance status.', format: 'Print / PDF', icon: Clock3 },
  { id: 'attendance-monthly', category: 'Attendance', title: 'Monthly Attendance', description: 'Monthly presence, absences, leave, working hours and overtime totals.', format: 'Print / PDF', icon: Clock3 },
  { id: 'attendance-late', category: 'Attendance', title: 'Late Attendance', description: 'Every late arrival in a payroll period, month or year: the date, shift, clock-in time and minutes late, with a summary for each person.', format: 'Print / PDF', icon: Clock3 },
  { id: 'ot-claims', category: 'Attendance', title: 'OT Claim Status', description: 'Every OT claim of a payroll period or month in the Infotech layout: a summary of everyone first, then one page for each staff member.', format: 'Print / PDF', icon: Clock3 },
  { id: 'credit-hours', category: 'Attendance', title: 'Credit Hours', description: 'Credit hours balance of each staff member, what was earned and used in a period, and every entry.', format: 'Print / PDF', icon: Clock3 },
  { id: 'performance', category: 'Performance Reviews', title: 'Performance Review Reports', description: 'Supervisor reviews, scores, improvement plans and HR receipt details.', format: 'Print form', icon: ClipboardCheck },
  { id: 'incentives', category: 'Incentive', title: 'Incentive Claims', description: 'Claims sent to HR, approved amounts, monthly summaries and individual forms.', format: 'Print / PDF', icon: Wallet },
] as const;
// Reports that live on another page of the office (mainly Payroll): these cards open that page. The payroll and chart reports are listed here too, so every report can be found in one place.
const LINKS = [
  { id: 'payroll-summary', category: 'Payroll', title: 'Payroll Summary', description: 'The month\'s pay for every staff member in the Infotech layout (Monthly Payroll Summary Detailed), KJ and SK on their own pages. Preview and save as PDF.', format: 'Preview / PDF', icon: Banknote, view: 'summary', tab: '' },
  { id: 'payslips', category: 'Payroll', title: 'Payslips', description: 'Every staff member\'s payslip for a payroll month in the Infotech layout. Preview, print or save as PDF.', format: 'Preview / PDF', icon: FileText, view: 'payslips', tab: '' },
  { id: 'file-bank', category: 'Payroll', title: 'Maybank Salary File', description: 'The bank file for the month and company, shown as a table, ready to download for Maybank.', format: 'Table / file', icon: Landmark, view: 'file-bank', tab: '' },
  { id: 'file-epf', category: 'Payroll', title: 'KWSP File', description: 'The KWSP (EPF) contribution file for the month and company, shown as a table, ready to download.', format: 'Table / file', icon: Landmark, view: 'file-epf', tab: '' },
  { id: 'file-socso', category: 'Payroll', title: 'PERKESO / EIS File', description: 'The PERKESO and EIS contribution file for the month and company, shown as a table, ready to download.', format: 'Table / file', icon: Landmark, view: 'file-socso', tab: '' },
  { id: 'file-epcb', category: 'Payroll', title: 'ePCB File', description: 'The monthly tax deduction (PCB) file for the month and company, shown as a table, ready to download.', format: 'Table / file', icon: Landmark, view: 'file-epcb', tab: '' },
  { id: 'incentive-summary', category: 'Incentive', title: 'Incentive Summary Sheet', description: 'The month\'s incentive summary: each person\'s approved claims, SOTM and nett payment. Preview, save as PDF or CSV.', format: 'Preview / PDF / CSV', icon: Wallet, view: 'incentive-summary', tab: '' },
  { id: 'org-chart', category: 'Staff Profiles', title: 'Organization Chart', description: 'The company chart with photos and positions. Download as PDF or PNG, or share on WhatsApp.', format: 'PDF / PNG', icon: Network, view: 'charts', tab: 'org' },
  { id: 'incentive-files', category: 'Incentive', title: 'Incentive Maybank Files', description: 'The allowance bank file for KJ and SK, with the incentive summary, the SOTM and the paid status.', format: 'Preview / file', icon: Landmark, view: 'incentive-files', tab: '' },
  { id: 'flu-form', category: 'Staff Communication', title: 'Influenza Vaccine Card', description: 'The staff influenza vaccine card: view, preview, print or save as PDF. Under Miscellaneous.', format: 'Print / PDF', icon: FileText, view: 'flu', tab: '' },
  { id: 'tax-ea', category: 'Tax', title: 'Borang EA', description: 'The yearly Borang EA of each staff member for a finished year, with the tax figures below. Print it, or download the tax summary as CSV.', format: 'Print / CSV', icon: FileText, view: 'tax-ea', tab: '' },
  { id: 'tax-cp8d', category: 'Tax', title: 'CP8D', description: 'The yearly CP8D list for LHDN, with the sheet for e-Data Praisi. Print it, or download the sheet as CSV.', format: 'Print / CSV', icon: FileText, view: 'tax-cp8d', tab: '' },
] as const;
export type ViewLink = 'tax-ea' | 'tax-cp8d' | 'payroll' | 'summary' | 'payslips' | 'flu' | 'incentive-files' | 'file-bank' | 'file-epf' | 'file-socso' | 'file-epcb' | 'incentive-summary' | 'charts' | 'tax' | 'incentives' | 'misc';
type ReportId = typeof REPORTS[number]['id'];
const CATEGORIES = ['All', 'Leave', 'Attendance', 'Payroll', 'Performance Reviews', 'Incentive', 'Roster', 'Staff Profiles', 'Tax', 'Staff Communication'] as const;

export function HRReports(_props: { onError: (message: string) => void; onOpen?: (view: ViewLink, tab: string) => void }) {
  const [selected, setSelected] = useState<ReportId | null>(null);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('All');
  const [query, setQuery] = useState('');
  const report = REPORTS.find((item) => item.id === selected);
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const [embed, setEmbed] = useState<{ view: ViewLink; tab: string; title: string } | null>(null);
  const ALL: readonly { id: string; category: string; title: string; description: string; format: string; icon: typeof Wallet; view?: ViewLink; tab?: string }[] = [...REPORTS, ...LINKS];
  const shown = ALL.filter((item) => (category === 'All' || category === item.category) && words.every((word) => `${item.title} ${item.category} ${item.description} ${item.format}`.toLowerCase().includes(word)));
  const open = (id: ReportId | null) => { setSelected(id); window.scrollTo({ top: 0 }); };
  // These three are whole report pages (their own filters, Preview, Print and CSV), not the small options box.
  const PAGE_REPORTS: ReportId[] = ['leave-history', 'leave-status', 'attendance-individual'];
  const onError = _props.onError;

  return <div className="text-compact mx-auto max-w-[1500px] space-y-3 sm:space-y-5">
    {!embed && <section className="ara-hero rounded-[16px] px-3.5 py-3 text-white sm:rounded-[30px] sm:p-9 print:hidden">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#70d8fa] sm:text-xs sm:tracking-[0.22em]">Office HR · Klinik ARA 24 Jam</p>
      <h2 className="mt-0.5 text-lg font-semibold tracking-tight sm:mt-3 sm:text-3xl">Reports</h2>
      <p className="mt-2 hidden max-w-2xl leading-7 text-[#b9cfdd] sm:block">Staff profiles, rosters, leave, attendance, performance reviews and incentive reports, together in one place. Choose a report, select your options and print or save as PDF.</p>
    </section>}

    {embed && <div className="space-y-4"><button type="button" onClick={() => setEmbed(null)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b] hover:underline print:hidden">← Back to Reports</button>
      <Suspense fallback={<p role="status" className="text-sm text-slate-500">Opening {embed.title}…</p>}>
        {embed.view === 'payroll' && <EmbedPayroll start={embed.tab as 'run'} onError={onError} />}
        {embed.view === 'payslips' && <EmbedPayslips onError={onError} />}
        {embed.view.startsWith('file-') && <EmbedFiles kind={embed.view.slice(5) as 'bank' | 'epf' | 'socso' | 'epcb'} onError={onError} />}
        {embed.view === 'incentive-summary' && <EmbedIncentiveSummary onError={onError} />}
        {embed.view === 'incentive-files' && <EmbedIncentiveFiles onError={onError} />}
        {embed.view === 'summary' && <EmbedSummary onError={onError} />}
        {embed.view === 'tax' && <EmbedTax onError={onError} />}
        {embed.view === 'tax-ea' && <EmbedTax onError={onError} report="ea" />}
        {embed.view === 'tax-cp8d' && <EmbedTax onError={onError} report="cp8d" />}
        {embed.view === 'incentives' && <EmbedIncentives onError={onError} />}
        {embed.view === 'flu' && <EmbedFlu onError={onError} />}
        {embed.view === 'misc' && <EmbedMisc onError={onError} />}
        {embed.view === 'charts' && <EmbedOrgChart onError={onError} source="hr" report />}
      </Suspense></div>}
    {!embed && !report && <>
      <div className="flex flex-col items-end gap-3 [&>section]:w-full"><HRDownloadAll /></div>
      <section className={`${card} space-y-4`}>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400" /><input aria-label="Search reports" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <SubTabs label="Report category" active={category} onSelect={setCategory} tabs={CATEGORIES.map((item) => ({ id: item, label: item, short: item === 'Performance Reviews' ? 'Reviews' : item === 'Staff Profiles' ? 'Profiles' : undefined }))} />
      </section>
      <p role="status" className="text-sm text-slate-500">{shown.length} {shown.length === 1 ? 'report' : 'reports'}</p>
      <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{shown.map((item) => <button key={item.id} type="button" onClick={() => { if (item.view) { setEmbed({ view: item.view, tab: item.tab || '', title: item.title }); window.scrollTo({ top: 0 }); } else open(item.id as ReportId); }} className={`${card} flex flex-col text-left sm:!rounded-2xl sm:!p-4 max-sm:flex-row max-sm:items-center max-sm:gap-2.5 max-sm:!rounded-xl max-sm:!p-2.5 transition hover:ring-2 hover:ring-[#0b587b]/30 focus-visible:outline-2 focus-visible:outline-[#0b587b]`}>
        <span className="flex items-center justify-between gap-3 sm:w-full"><item.icon className="h-5 w-5 text-[#0b9aca]" /><span className="text-xs font-semibold text-slate-400 max-sm:hidden">{item.category}</span></span>
        <h3 className="mt-3 text-[15px] font-semibold leading-snug max-sm:mt-0 max-sm:min-w-0 max-sm:flex-1 max-sm:truncate max-sm:text-[13px]">{item.title}</h3>
        <p className="mt-1.5 line-clamp-3 flex-1 text-xs leading-5 text-slate-500 max-sm:hidden">{item.description}</p>
        <span className="mt-3 flex w-full items-center justify-between gap-3 text-[11px] font-semibold text-[#0b587b] max-sm:mt-0 max-sm:w-auto"><span className="max-sm:hidden">{item.format}</span><ArrowRight className="h-4 w-4" /></span>
      </button>)}</div>
      {!shown.length && <p className={`${card} text-sm text-slate-500`}>No reports match. Try another search or category.</p>}
      <div className="flex flex-col items-start gap-3 border-t border-slate-100 pt-5 [&>section]:w-full"><HRDownloadAll /></div>
    </>}
    {!embed && report && PAGE_REPORTS.includes(report.id) && <div className="space-y-4"><button type="button" onClick={() => open(null)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b] hover:underline print:hidden">← Reports</button>{report.id === 'leave-history' ? <LeaveHistory onError={onError} /> : report.id === 'leave-status' ? <HRLeaveStatusReport onError={onError} /> : <HRAttendanceIndividual onError={onError} />}</div>}
    {!embed && report && !PAGE_REPORTS.includes(report.id) && <div key={report.id}><HRReportDialog id={report.id.startsWith('roster-') ? 'roster' : report.id} rosterGroup={report.id === 'roster-doctors' ? 'doctors' : report.id === 'roster-ca' ? 'staff' : undefined} title={report.title} onClose={() => open(null)} /></div>}
  </div>;
}
