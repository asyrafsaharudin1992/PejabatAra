import { useState } from 'react';
import { SubTabs } from './SubTabs';
import { ArrowRight, CalendarCheck, ClipboardCheck, Clock3, Search, Wallet, CalendarDays, IdCard } from 'lucide-react';
import { card } from './AssessmentStaff';
import { HRReportDialog } from './HRReportDialog';

const REPORTS = [
  { id: 'roster', category: 'Roster', title: 'Monthly Roster', description: 'Monthly duty roster by clinic for staff or doctors, with shift codes.', format: 'Print / PDF', icon: CalendarDays },
  { id: 'staff-profile', category: 'Staff Profiles', title: 'Staff Profile', description: 'Individual personal, employment, pay, family and education details.', format: 'Print / PDF', icon: IdCard },
  { id: 'staff-summary', category: 'Staff Profiles', title: 'Staff Profile Summary', description: 'All staff in one summary: staff codes, positions, branches, joining and confirmation dates.', format: 'CSV / Excel / PDF', icon: IdCard },
  { id: 'forecast', category: 'Staff Profiles', title: 'Forecast', description: 'Monthly CA staffing forecast with saved HR edits. Kajang and Seri Kembangan each on their own branded page.', format: 'CSV / Excel / PDF', icon: CalendarDays },
  { id: 'leave-consolidate', category: 'Leave', title: 'Leave Consolidate', description: 'Annual and medical leave entitlement, taken days and balances per staff member.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'leave-credit', category: 'Leave', title: 'Credit Annual Leave', description: 'Additional annual leave credits by staff member, reason and period.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'leave-gcr', category: 'Leave', title: 'GCR', description: 'Leave eligible for payment, forfeited days and balances to carry forward.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'leave-history', category: 'Leave', title: 'Leave History', description: 'Individual approved leave history with annual and medical leave balances.', format: 'Print / PDF', icon: CalendarCheck },
  { id: 'attendance-daily', category: 'Attendance', title: 'Daily Attendance', description: 'Daily shifts, clock times, late minutes and attendance status.', format: 'Print / PDF', icon: Clock3 },
  { id: 'attendance-monthly', category: 'Attendance', title: 'Monthly Attendance', description: 'Monthly presence, absences, leave, working hours and overtime totals.', format: 'Print / PDF', icon: Clock3 },
  { id: 'attendance-late', category: 'Attendance', title: 'Late Attendance', description: 'Late arrivals over the last six months, with monthly counts and minutes.', format: 'Print / PDF', icon: Clock3 },
  { id: 'performance', category: 'Performance Reviews', title: 'Performance Review Reports', description: 'Supervisor reviews, scores, improvement plans and HR receipt details.', format: 'Print form', icon: ClipboardCheck },
  { id: 'incentives', category: 'Incentive', title: 'Incentive Claims', description: 'Claims sent to HR, approved amounts, monthly summaries and individual forms.', format: 'Print / PDF', icon: Wallet },
] as const;
type ReportId = typeof REPORTS[number]['id'];
const CATEGORIES = ['All', 'Leave', 'Attendance', 'Performance Reviews', 'Incentive', 'Roster', 'Staff Profiles'] as const;

export function HRReports(_props: { onError: (message: string) => void }) {
  const [selected, setSelected] = useState<ReportId | null>(null);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('All');
  const [query, setQuery] = useState('');
  const report = REPORTS.find((item) => item.id === selected);
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const shown = REPORTS.filter((item) => (category === 'All' || category === item.category) && words.every((word) => `${item.title} ${item.category} ${item.description} ${item.format}`.toLowerCase().includes(word)));
  const open = (id: ReportId | null) => { setSelected(id); window.scrollTo({ top: 0 }); };

  return <div className="text-compact mx-auto max-w-[1500px] space-y-3 sm:space-y-5">
    <section className="ara-hero rounded-[16px] px-3.5 py-3 text-white sm:rounded-[30px] sm:p-9 print:hidden">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#70d8fa] sm:text-xs sm:tracking-[0.22em]">Office HR · Klinik ARA 24 Jam</p>
      <h2 className="mt-0.5 text-lg font-semibold tracking-tight sm:mt-3 sm:text-3xl">Reports</h2>
      <p className="mt-2 hidden max-w-2xl leading-7 text-[#b9cfdd] sm:block">Staff profiles, rosters, leave, attendance, performance reviews and incentive reports, together in one place. Choose a report, select your options and print or save as PDF.</p>
    </section>

      <section className={`${card} space-y-4`}>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400" /><input aria-label="Search reports" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <SubTabs label="Report category" active={category} onSelect={setCategory} tabs={CATEGORIES.map((item) => ({ id: item, label: item, short: item === 'Performance Reviews' ? 'Reviews' : item === 'Staff Profiles' ? 'Profiles' : undefined }))} />
      </section>
      <p role="status" className="text-sm text-slate-500">{shown.length} {shown.length === 1 ? 'report' : 'reports'}</p>
      <div className="grid gap-1.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map((item) => <button key={item.id} type="button" onClick={() => open(item.id)} className={`${card} flex flex-col text-left max-sm:flex-row max-sm:items-center max-sm:gap-2.5 max-sm:!rounded-xl max-sm:!p-2.5 transition hover:ring-2 hover:ring-[#0b587b]/30 focus-visible:outline-2 focus-visible:outline-[#0b587b]`}>
        <span className="flex items-center justify-between gap-3 sm:w-full"><item.icon className="h-5 w-5 text-[#0b9aca] sm:h-6 sm:w-6" /><span className="text-xs font-semibold text-slate-400 max-sm:hidden">{item.category}</span></span>
        <h3 className="mt-5 text-lg font-semibold max-sm:mt-0 max-sm:min-w-0 max-sm:flex-1 max-sm:truncate max-sm:text-[13px]">{item.title}</h3>
        <p className="mt-2 flex-1 text-sm leading-6 text-slate-500 max-sm:hidden">{item.description}</p>
        <span className="mt-5 flex w-full items-center justify-between gap-3 text-xs font-semibold text-[#0b587b] max-sm:mt-0 max-sm:w-auto"><span className="max-sm:hidden">{item.format}</span><ArrowRight className="h-4 w-4" /></span>
      </button>)}</div>
      {!shown.length && <p className={`${card} text-sm text-slate-500`}>No reports match. Try another search or category.</p>}
    {report && <div key={report.id}><HRReportDialog id={report.id} title={report.title} onClose={() => open(null)} /></div>}
  </div>;
}
