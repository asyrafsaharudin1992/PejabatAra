import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarCheck, ClipboardCheck, Clock3, Search, Wallet } from 'lucide-react';
import { card } from './AssessmentStaff';
import { HRLeaveConsolidate } from './HRLeaveConsolidate';
import { HRLeaveCredit } from './HRLeaveCredit';
import { HRLeaveGcr } from './HRLeaveGcr';
import { LeaveHistory } from './HRLeaveReport';
import { AttendanceDailyReport, AttendanceMonthlyReport, AttendanceLateReport } from './HRAttendance';
import { HRReviews } from './HRReviews';
import { HRIncentives } from './HRIncentives';

const REPORTS = [
  { id: 'leave-consolidate', category: 'Leave', title: 'Leave Consolidate', description: 'Annual and medical leave entitlement, taken days and balances per staff member.', format: 'Excel · Print / PDF', icon: CalendarCheck },
  { id: 'leave-credit', category: 'Leave', title: 'Credit Annual Leave', description: 'Additional annual leave credits by staff member, reason and period.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'leave-gcr', category: 'Leave', title: 'GCR', description: 'Leave eligible for payment, forfeited days and balances to carry forward.', format: 'Excel · Print / PDF', icon: CalendarCheck },
  { id: 'leave-history', category: 'Leave', title: 'Leave History', description: 'Individual approved leave history with annual and medical leave balances.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'attendance-daily', category: 'Attendance', title: 'Daily Attendance', description: 'Daily shifts, clock times, late minutes and attendance status.', format: 'View on screen', icon: Clock3 },
  { id: 'attendance-monthly', category: 'Attendance', title: 'Monthly Attendance', description: 'Monthly presence, absences, leave, working hours and overtime totals.', format: 'CSV', icon: Clock3 },
  { id: 'attendance-late', category: 'Attendance', title: 'Late Attendance', description: 'Late arrivals over the last six months, with monthly counts and minutes.', format: 'View on screen', icon: Clock3 },
  { id: 'performance', category: 'Performance Reviews', title: 'Performance Review Reports', description: 'Supervisor reviews, scores, improvement plans and HR receipt details.', format: 'Print form', icon: ClipboardCheck },
  { id: 'incentives', category: 'Incentive', title: 'Incentive Claims', description: 'Claims sent to HR, approved amounts, monthly summaries and individual forms.', format: 'Print / PDF', icon: Wallet },
] as const;
type ReportId = typeof REPORTS[number]['id'];
const CATEGORIES = ['All', 'Leave', 'Attendance', 'Performance Reviews', 'Incentive'] as const;

export function HRReports({ onError }: { onError: (message: string) => void }) {
  const [selected, setSelected] = useState<ReportId | null>(null);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('All');
  const [query, setQuery] = useState('');
  const report = REPORTS.find((item) => item.id === selected);
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const shown = REPORTS.filter((item) => (category === 'All' || category === item.category) && words.every((word) => `${item.title} ${item.category} ${item.description} ${item.format}`.toLowerCase().includes(word)));
  const open = (id: ReportId | null) => { setSelected(id); window.scrollTo({ top: 0 }); };

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9 print:hidden">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight">Reports</h2>
      <p className="mt-2 max-w-2xl leading-7 text-[#b9cfdd]">Leave, attendance, performance reviews and incentive reports, together in one place. Choose a report to view, print or download.</p>
    </section>
    {report ? <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button type="button" onClick={() => open(null)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b587b] shadow-sm hover:bg-[#edf9fe]"><ArrowLeft className="h-4 w-4" />All reports</button>
        <div className="text-right"><h3 className="font-semibold">{report.title}</h3><p className="text-xs text-slate-500">{report.category} · {report.format}</p></div>
      </div>
      {selected === 'leave-consolidate' && <HRLeaveConsolidate onError={onError} />}
      {selected === 'leave-credit' && <HRLeaveCredit onError={onError} />}
      {selected === 'leave-gcr' && <HRLeaveGcr onError={onError} />}
      {selected === 'leave-history' && <LeaveHistory onError={onError} />}
      {selected === 'attendance-daily' && <AttendanceDailyReport onError={onError} />}
      {selected === 'attendance-monthly' && <AttendanceMonthlyReport onError={onError} />}
      {selected === 'attendance-late' && <AttendanceLateReport onError={onError} />}
      {selected === 'performance' && <HRReviews onError={onError} reportOnly />}
      {selected === 'incentives' && <HRIncentives onError={onError} embedded />}
    </> : <>
      <section className={`${card} space-y-4`}>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400" /><input aria-label="Search reports" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <div role="group" aria-label="Report category" className="flex flex-wrap gap-2">{CATEGORIES.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${category === item ? 'bg-[#0b587b] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{item}</button>)}</div>
      </section>
      <p role="status" className="text-sm text-slate-500">{shown.length} {shown.length === 1 ? 'report' : 'reports'}</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map((item) => <button key={item.id} type="button" onClick={() => open(item.id)} className={`${card} flex flex-col text-left transition hover:ring-2 hover:ring-[#0b587b]/30 focus-visible:outline-2 focus-visible:outline-[#0b587b]`}>
        <span className="flex w-full items-center justify-between gap-3"><item.icon className="h-6 w-6 text-[#0b9aca]" /><span className="text-xs font-semibold text-slate-400">{item.category}</span></span>
        <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
        <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{item.description}</p>
        <span className="mt-5 flex w-full items-center justify-between gap-3 text-xs font-semibold text-[#0b587b]">{item.format}<ArrowRight className="h-4 w-4" /></span>
      </button>)}</div>
      {!shown.length && <p className={`${card} text-sm text-slate-500`}>No reports match. Try another search or category.</p>}
    </>}
  </div>;
}
