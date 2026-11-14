import { ArrowUpRight, CalendarCheck, ClipboardCheck, UserMinus, UserRoundPlus, Users } from 'lucide-react';
import { calendarEventOverdue, shiftCalendarDays, type CalendarConfig, type CalendarEvent, type CalendarPerson } from './lib/hrCalendar';

type Props = {
  people: CalendarPerson[] | null;
  config: CalendarConfig | null;
  events: CalendarEvent[];
  today: string;
  month: string;
  onProfiles: () => void;
  onProbation: () => void;
  onTasks: () => void;
};
const shortName = (person: CalendarPerson) => person.name.split(/\s+/).filter((word) => !/^(NUR|NURUL|SITI)$/i.test(word)).slice(0, 1).join(' ');
const dateLabel = (date: string) => new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' });

export default function HRHomeSummary({ people, config, events, today, month, onProfiles, onProbation, onTasks }: Props) {
  const upcoming = (people || []).filter((p) => p.joinDate && p.joinDate > today).sort((a, b) => a.joinDate!.localeCompare(b.joinDate!));
  const leaving = (people || []).filter((p) => p.resignDate && p.resignDate >= today).sort((a, b) => a.resignDate!.localeCompare(b.resignDate!));
  // A new starter stays on the card for 7 days after the joining date.
  const starters = (people || []).filter((p) => p.joinDate && p.joinDate >= shiftCalendarDays(today, -7)).sort((a, b) => a.joinDate!.localeCompare(b.joinDate!));
  const started = (people || []).filter((p) => p.joinDate && p.joinDate <= today);
  const probation = started.filter((p) => config?.probation[p.id] === 'probation' && (!p.confirmDate || p.confirmDate > today));
  const pending = events.filter((e) => !['done', 'skipped'].includes(e.state));
  const overdue = pending.filter((e) => calendarEventOverdue(e, today));
  const monthLabel = new Date(`${month}-01T12:00:00+08:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
  const branches = [...new Set((people || []).map((p) => p.company))].sort().map((company) => `${company} ${people!.filter((p) => p.company === company).length}`).join(' · ');
  const missingJoin = (people?.length || 0) - started.length - upcoming.length;
  const cards = [
    { title: 'Staff profiles', count: people?.length, icon: Users, tone: 'bg-sky-50 text-sky-700', detail: branches || 'KJ and SK', note: `${started.length} started${upcoming.length ? ` · ${upcoming.length} upcoming` : ''}${missingJoin ? ` · ${missingJoin} joining date missing` : ''}`, action: onProfiles },
    { title: 'On probation', count: people ? probation.length : undefined, icon: ClipboardCheck, tone: 'bg-violet-50 text-violet-700', detail: probation.length ? probation.map(shortName).join(' · ') : 'No staff currently on probation', note: 'HR-verified · already started', action: onProbation },
    { title: 'Upcoming starters', count: people ? starters.length : undefined, icon: UserRoundPlus, tone: 'bg-emerald-50 text-emerald-700', detail: starters.length ? starters.map((p) => `${shortName(p)} · ${p.company}`).join(' · ') : 'No upcoming joining dates', note: starters.length ? starters.map((p) => `${p.joinDate! > today ? 'Starts' : 'Started'} ${dateLabel(p.joinDate!)}`).join(' · ') : 'Based on Staff Profile joining dates, kept for 7 days after they start', action: onProfiles },
    { title: 'Leaving', count: people ? leaving.length : undefined, icon: UserMinus, tone: 'bg-rose-50 text-rose-700', detail: leaving.length ? leaving.map((p) => `${shortName(p)} · ${dateLabel(p.resignDate!)}`).join(' · ') : 'No resignations planned', note: 'Last working day, from Staff Profile', action: onProfiles },
    { title: 'HR to-do', count: people ? pending.length : undefined, icon: CalendarCheck, tone: overdue.length ? 'bg-amber-50 text-amber-700' : 'bg-cyan-50 text-cyan-700', detail: monthLabel, note: overdue.length ? `${overdue.length} overdue · ${pending.length - overdue.length} upcoming / due today` : 'All reminders on track', action: onTasks },
  ];
  return <section aria-label="HR overview" className="space-y-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-semibold tracking-tight">At a glance</h3><p className="text-xs text-slate-500">Staff overview today · to-do for the selected month</p></div>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 xl:grid-cols-5">{cards.map((item) => <button key={item.title} type="button" disabled={!people} onClick={item.action} className="group min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-left sm:rounded-2xl sm:p-3.5 shadow-[0_5px_20px_rgba(20,35,59,0.03)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 disabled:pointer-events-none">
      <div className="flex items-center justify-between"><span className={`grid h-6 w-6 place-items-center rounded-md sm:h-8 sm:w-8 sm:rounded-lg ${item.tone}`}><item.icon size={13} /></span><ArrowUpRight size={14} className="hidden text-slate-300 transition group-hover:text-sky-600 sm:block" /><p className="text-lg font-semibold leading-none tracking-tight text-[#17364c] sm:hidden">{item.count ?? '—'}</p></div>
      <p className="mt-1.5 truncate text-[10px] font-medium text-slate-500 sm:mt-3 sm:text-xs">{item.title}</p><p className="hidden text-2xl font-semibold tracking-tight text-[#17364c] sm:block">{item.count ?? '—'}</p>
      <p className="mt-1 hidden text-xs font-semibold leading-4 text-slate-700 sm:mt-1.5 sm:block">{people ? item.detail : 'Loading overview…'}</p><p className="mt-0.5 hidden text-[11px] leading-4 text-slate-500 sm:block">{people ? item.note : ' '}</p>
    </button>)}</div>
  </section>;
}
