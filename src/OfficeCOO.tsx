import { useOnDemandSummary } from './lib/useOnDemandSummary';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AraLogo } from './AraLogo';
import { StackTables } from './StackTables';
import { SubTabs } from './SubTabs';
import { ArrowUpRight, BarChart3, CalendarCheck, CalendarDays, Users, UserMinus, UserRoundPlus, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Clock3, GraduationCap, ExternalLink, HeartPulse, Home, IdCard, Stethoscope, LogOut, Menu, UsersRound, X } from 'lucide-react';
import { CareReviewPage } from './CareReviewUI';
import { HRRoster, guessName } from './HRRoster';
import COOCalendar from './COOCalendar';
import HRStaffLocation from './HRStaffLocation';
import HRProjection from './HRProjection';
import HRStaffContact from './HRStaffContact';
import { ReviewRoom } from './OfficeReview';
import { Approvals } from './LeaveScreens';
import COOAttendance from './COOAttendance';
import { AttendanceDailyReport, AttendanceMonthlyReport } from './HRAttendance';
// The two offices the COO leads open inside this office, with all their own pages (shown as tabs above the page).
const OfficeClinical = lazy(() => import('./OfficeClinical'));
const AssessmentAdmin = lazy(() => import('./AssessmentAdmin'));
const OfficePortal = lazy(() => import('./PortalApp'));
import { officeFetch } from './lib/officeApi';
import { signOutSupabase } from './lib/supabase';
import { EmbeddedTabs } from './EmbeddedTabs';
import { CeoChartsPage } from './CeoCharts';
import { WaitingForYou } from './WaitingForYou';
import { card } from './AssessmentStaff';

// Office COO: the COO leads Clinical Admin and the Clinical Assistants. Read only: how the team looks today (who is in, late, on leave) and
// the team's leave. HR still decides leave, OT and pay.
type View = 'home' | 'charts' | 'assessment' | 'attendance' | 'review' | 'leave' | 'care' | 'roster' | 'staff' | 'clinical' | 'ca';
type Row = { id: string; company: string; code: string; name: string; designation: string; group: string; branch: string; shift: string; startTime: string; endTime: string; inTime: string; outTime: string; late: number; lateCounted: number; status: string; creditHours?: number };
type Leave = { id: string; name: string; code: string; group: string; type: string; start: string; end: string; halfDay: boolean; days: number; status: string; reason: string; createdAt?: string };
const API = '/api/status?resource=coo';
// Office staff who are not on the COO's duty roster (HR admin, finance admin, quality control and the admin assistant).
const ROSTER_HIDDEN = ['ARASK0058', 'ARA0061', 'ARA0035', 'ARASK0036'];
const LOCUM_URL = 'https://aralocum.hsohealthcare.com/';
const TONE: Record<string, string> = { home: 'text-sky-400', charts: 'text-violet-400', roster: 'text-violet-400', staff: 'text-emerald-400', leave: 'text-amber-400', care: 'text-rose-400', review: 'text-orange-400', attendance: 'text-teal-400', assessment: 'text-lime-400',  clinical: 'text-cyan-300', ca: 'text-fuchsia-400' };
const NAV: { id: View; label: string; note: string; icon: typeof Home }[] = [{ id: 'home', label: 'Home', note: 'My calendar and reminders', icon: Home }, { id: 'charts', label: 'Charts', note: 'People, attendance and incentives', icon: BarChart3 }, { id: 'roster', label: 'Roster', note: 'Duty roster by month (view only)', icon: CalendarDays }, { id: 'staff', label: 'Staff', note: 'Who is where, by group and clinic', icon: Users }, { id: 'leave', label: 'Leave', note: 'Who is on leave, and what is waiting', icon: CalendarCheck }, { id: 'care', label: 'AraCare reviews', note: 'Check the KPIs of the allowance', icon: HeartPulse }, { id: 'assessment', label: 'Assessment Room', note: 'Quizzes and results', icon: GraduationCap }, { id: 'attendance', label: 'Attendance', note: 'Team attendance and OT for your approval', icon: Clock3 }, { id: 'review', label: 'Performance Review', note: 'Reviews HR has given to you', icon: ClipboardCheck }];
// The two offices the COO leads: they open inside this office, with all their own pages.
const OFFICES: { id: View; label: string; note: string; icon: typeof Home }[] = [{ id: 'clinical', label: 'Clinical Admin', note: 'Daily checklist, orders, vaccine bookings', icon: ClipboardList }, { id: 'ca', label: 'Clinical Assistants (CA)', note: 'Training, panel guides, references', icon: GraduationCap }];
const STATUS: Record<string, [string, string]> = { present: ['Present', 'bg-emerald-50 text-emerald-700'], working: ['Working', 'bg-sky-50 text-sky-700'], absent: ['Absent', 'bg-rose-50 text-rose-700'], 'not-in': ['Not in yet', 'bg-amber-50 text-amber-700'], leave: ['Leave', 'bg-violet-50 text-violet-700'], 'missing-out': ['No clock out', 'bg-amber-50 text-amber-700'], extra: ['Clocked on a day off', 'bg-slate-100 text-slate-500'], off: ['Off', 'bg-slate-100 text-slate-400'], upcoming: ['Upcoming', 'bg-slate-100 text-slate-500'], 'no-times': ['Shift not set', 'bg-slate-100 text-slate-500'], exempt: ['No clock needed', 'bg-slate-100 text-slate-500'], 'post-call': ['Post night', 'bg-indigo-50 text-indigo-700'], 'no-record': ['No record', 'bg-slate-50 text-slate-400'] };
const badge = (status: string) => { const [text, tone] = STATUS[status] || [status, 'bg-slate-100 text-slate-500']; return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{text}</span>; };
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = (date: string) => { const d = new Date(`${date}T00:00:00Z`); return `${WEEKDAY[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const addDay = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
async function call(query: string, body?: unknown) {
  const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

type ScheduleItem = { id: string; name: string; short?: string; code: string; company: string; group: string; team: boolean; type: string; start: string; end: string; half: string | null; days: number; status: 'approved' | 'waiting' };
const shiftDay = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
// Who is on leave: one row for each staff member with leave in the month, one column for each day. Violet is approved leave, amber is leave still waiting.
function LeaveSchedule({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(() => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7));
  const [items, setItems] = useState<ScheduleItem[] | null>(null);
  const [today, setToday] = useState('');
  const [company, setCompany] = useState('');
  const [teamOnly, setTeamOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'calendar' | 'table'>('calendar');
  const [holidays, setHolidays] = useState<{ group: string; date: string; name: string }[]>([]);
  const [showHolidays, setShowHolidays] = useState(false);
  const [picked, setPicked] = useState(() => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10));
  useEffect(() => { let live = true; setItems(null); call(`action=leave_schedule&month=${month}`).then((result) => { if (live) { setItems(result.items); setToday(result.today); } }).catch((cause: Error) => { if (live) { setItems([]); onError(cause.message); } }); return () => { live = false; }; }, [month]);
  useEffect(() => { let live = true; call(`action=holidays&month=${month}`).then((result) => { if (live) setHolidays(result.holidays || []); }).catch(() => { if (live) setHolidays([]); }); return () => { live = false; }; }, [month]);
  const holidayOn = (date: string) => holidays.filter((holiday) => holiday.date === date);
  const monthShift = (by: number) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + by); const next = date.toISOString().slice(0, 7); setMonth(next); setPicked(`${next}-01`); };
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const days = Array.from({ length: last }, (_item, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (items || []).filter((item) => (!company || item.company === company) && (!teamOnly || item.team) && words.every((word) => `${item.name} ${item.code}`.toLowerCase().includes(word)));
  const people: ScheduleItem[] = [...new Map<string, ScheduleItem>(shown.map((item): [string, ScheduleItem] => [item.id, item])).values()].sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
  const cell = (id: string, date: string) => shown.filter((item) => item.id === id && item.start <= date && item.end >= date).sort((a, b) => Number(a.status === 'waiting') - Number(b.status === 'waiting'))[0];
  const shortOf = (item: ScheduleItem) => item.short || guessName(item.name);
  const onDay = (date: string) => shown.filter((item) => item.start <= date && item.end >= date).sort((a, b) => Number(a.status === 'waiting') - Number(b.status === 'waiting') || a.name.localeCompare(b.name));
  const pickedItems = onDay(picked);
  const onLeaveToday = new Set(shown.filter((item) => item.status === 'approved' && item.start <= today && item.end >= today).map((item) => item.name));
  return <section className={`text-compact ${card} space-y-3`}>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-label="Previous month" onClick={() => monthShift(-1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white"><ChevronLeft className="h-4 w-4" /></button>
      <h3 className="min-w-[160px] text-center text-lg font-semibold">{new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3>
      <button type="button" aria-label="Next month" onClick={() => monthShift(1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white"><ChevronRight className="h-4 w-4" /></button>
      <div className="flex w-full items-center gap-1.5 sm:contents">
      <button type="button" aria-expanded={showHolidays} onClick={() => setShowHolidays(!showHolidays)} aria-label="See Public Holidays" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 sm:h-10 sm:gap-1.5 sm:rounded-xl sm:px-3 sm:text-sm"><CalendarDays className="h-4 w-4" /><span className="max-sm:sr-only">See Public Holidays</span>{holidays.length > 0 && <span className="rounded-full bg-white px-1.5 text-xs">{new Set(holidays.map((holiday) => `${holiday.date}|${holiday.name}`)).size}</span>}</button>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or code" aria-label="Search staff" className={`${field} min-w-0 flex-1 sm:ml-auto sm:min-w-[180px] sm:flex-none`} />
      <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Clinic" className={field}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={teamOnly} onChange={(event) => setTeamOnly(event.target.checked)} />My team only</label>
      <SubTabs active={mode} onSelect={setMode} tabs={[{ id: 'calendar', label: 'Calendar' }, { id: 'table', label: 'Table' }]} /></div>
    {today.slice(0, 7) === month && <p className="text-sm text-slate-600"><strong>On leave today:</strong> {onLeaveToday.size ? [...onLeaveToday].join(', ') : 'nobody'}</p>}
    {showHolidays && <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-sm"><p className="font-semibold text-rose-800">Public holidays in {new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>{!holidays.length ? <p className="mt-1 text-slate-500">No public holiday this month.</p> : <ul className="mt-2 space-y-1">{[...new Map<string, { group: string; date: string; name: string }>(holidays.map((holiday) => [`${holiday.date}|${holiday.name}`, holiday])).values()].map((holiday) => <li key={holiday.date + holiday.name} className="flex flex-wrap items-baseline gap-x-3"><span className="w-32 shrink-0 font-semibold text-slate-700">{dayName(holiday.date)}</span><span className="text-slate-600">{holiday.name}</span><span className="text-[11px] text-slate-400">{holidays.filter((other) => other.date === holiday.date && other.name === holiday.name).map((other) => other.group).join(', ')}</span></li>)}</ul>}</div>}
    {!items ? <p className="text-sm text-slate-500">Loading…</p> : mode === 'calendar' ? <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,1fr)]"><div className="min-w-0 overflow-x-auto"><div className="sm:min-w-[480px]">
      {/* Phone: square day tiles with coloured dots on a dark card, like AraLocum; the people on leave that day show below. */}
      <div className="rounded-[24px] bg-gradient-to-br from-[#082f49] via-[#0a3b5d] to-[#0d5078] p-3 text-white shadow-[0_12px_30px_rgba(8,47,73,0.14)] sm:hidden">
        <div className="mb-1 grid grid-cols-7 gap-1 text-center">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name, index) => <span key={name} className={`py-1 text-[10px] font-bold uppercase tracking-wider ${index > 4 ? 'text-rose-200' : 'text-slate-300'}`}>{name}</span>)}</div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7 }, (_blank, index) => <div key={`pb${index}`} className="aspect-square rounded-xl bg-white/5" />)}
          {days.map((date) => {
            const here = onDay(date); const chosen = date === picked; const approved = here.filter((item) => item.status === 'approved').length; const waiting = here.length - approved;
            return <button key={date} type="button" onClick={() => setPicked(date)} aria-pressed={chosen} aria-label={`${date}, ${here.length} on leave`} className={`relative flex aspect-square flex-col items-center justify-between rounded-2xl border p-1.5 text-xs transition active:scale-95 ${chosen ? 'border-[#001F3F] bg-[#001F3F] font-bold text-white shadow-md ring-2 ring-sky-300' : date === today ? 'border-sky-300 bg-white text-slate-800' : 'border-slate-100 bg-white text-slate-800'}`}>
              <span className="self-start text-[11px] font-medium leading-none">{Number(date.slice(8))}</span>
              {(holidayOn(date).length > 0 || here.length > 0) && <span className="flex items-center justify-center gap-0.5">{holidayOn(date).length > 0 && <i className="h-1.5 w-1.5 rounded-full bg-rose-400" />}{approved > 0 && <i className="h-1.5 w-1.5 rounded-full bg-violet-500" />}{waiting > 0 && <i className="h-1.5 w-1.5 rounded-full bg-amber-400" />}{here.length > 0 && <b className="ml-0.5 text-[8px] font-mono opacity-70">{here.length}</b>}</span>}
            </button>;
          })}
        </div>
      </div>
      <div className="hidden grid-cols-7 text-center text-xs font-semibold text-slate-500 sm:grid">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => <p key={name} className="py-1">{name}</p>)}</div>
      <div className="hidden grid-cols-7 overflow-hidden rounded-xl border-l border-t border-slate-200 sm:grid">
        {Array.from({ length: (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7 }, (_blank, index) => <div key={`b${index}`} className="min-h-[88px] border-b border-r border-slate-200 bg-slate-50" />)}
        {days.map((date) => {
          const here = onDay(date);
          const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
          return <button key={date} type="button" onClick={() => setPicked(date)} aria-pressed={date === picked} aria-label={`${date}, ${here.length} on leave`} className={`flex min-h-[88px] flex-col items-stretch justify-start border-b border-r border-slate-200 p-1 text-left align-top ${date === picked ? 'bg-sky-50 ring-2 ring-inset ring-[#0b587b]' : weekend ? 'bg-slate-50 hover:bg-slate-100' : 'bg-white hover:bg-slate-50'}`}>
            <span className={`mb-0.5 inline-grid h-5 w-5 place-items-center rounded-full text-xs font-semibold ${date === today ? 'bg-[#0b587b] text-white' : 'text-slate-600'}`}>{Number(date.slice(8))}</span>
            {holidayOn(date).length > 0 && <span title={holidayOn(date).map((holiday) => `${holiday.name} (${holiday.group})`).join(', ')} className="mb-0.5 block truncate rounded bg-rose-100 px-1 py-0.5 text-[10px] font-semibold leading-tight text-rose-800">{holidayOn(date)[0].name}</span>}
            <span className="block space-y-0.5">{here.slice(0, 3).map((item) => <span key={item.id + item.start} title={`${item.name}: ${item.type}`} className={`block truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight ${item.status === 'waiting' ? 'bg-amber-100 text-amber-800' : 'bg-violet-100 text-violet-800'}`}>{shortOf(item)} · {item.type}{item.half ? ' ½' : ''}</span>)}{here.length > 3 && <span className="block text-[10px] font-semibold text-[#0b587b]">+{here.length - 3} more</span>}</span>
          </button>;
        })}
      </div></div></div>
      <aside className="min-w-0 rounded-xl bg-slate-50 p-3"><h4 className="text-sm font-semibold">{dayName(picked)}</h4>
        {holidayOn(picked).length > 0 && <p className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700">Public holiday: {[...new Set(holidayOn(picked).map((holiday) => holiday.name))].join(', ')}</p>}
        {!pickedItems.length ? <p className="mt-2 text-sm text-slate-500">Nobody is on leave.</p> : <ul className="mt-2 space-y-2">{pickedItems.map((item) => <li key={item.id + item.start} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm sm:p-2.5"><div className="flex items-center justify-between gap-2"><p className="min-w-0 truncate font-semibold text-slate-800">{item.name}<span className="font-normal text-slate-500 sm:hidden"> · {item.type}{item.half ? ` (${item.half})` : ''}</span></p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.status === 'waiting' ? 'bg-amber-100 text-amber-800' : 'bg-violet-100 text-violet-800'}`}>{item.status === 'waiting' ? 'Waiting' : 'Approved'}</span></div><p className="hidden text-xs text-slate-500 sm:block">{item.company} · {item.code} · {item.group}</p><p className="mt-1 hidden text-xs text-slate-600 sm:block">{item.type}{item.half ? ` (${item.half})` : ''} · {item.start === item.end ? dayName(item.start) : `${dayName(item.start)} to ${dayName(item.end)}`}</p></li>)}</ul>}
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5"><h4 className="text-sm font-semibold">For your approval</h4><p className="mb-2 text-[11px] text-slate-500">Leave waiting for your decision, same as in your Individual Sign In.</p><div className="max-h-[420px] overflow-y-auto pr-1"><Approvals fetcher={(query, options) => call(query, options?.body ? JSON.parse(String(options.body)) : undefined)} /></div></div>
      </aside></div> : !people.length ? <p className="text-sm text-slate-500">Nobody has leave in this month.</p> : <div className="overflow-x-auto"><table className="border-separate border-spacing-0 text-xs">
      <thead><tr><th className="sticky left-0 z-10 min-w-[200px] bg-white px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Staff</th>{days.map((date) => { const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()); return <th key={date} className={`w-8 min-w-8 px-0 py-1 text-center font-semibold ${date === today ? 'text-[#0b587b]' : weekend ? 'text-slate-300' : 'text-slate-500'}`}>{Number(date.slice(8))}<br /><span className="text-[9px] font-normal">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${date}T00:00:00Z`).getUTCDay()]}</span></th>; })}</tr></thead>
      <tbody>{people.map((person) => <tr key={person.id}>
        <td className="sticky left-0 z-10 border-t border-slate-100 bg-white px-2 py-1.5"><p className="font-semibold text-slate-800">{person.name}</p><p className="text-[10px] text-slate-400">{person.company} · {person.code} · {person.group}</p></td>
        {days.map((date) => { const here = cell(person.id, date); const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()); return <td key={date} title={here ? `${person.name}: ${here.type}${here.half ? ` (${here.half})` : ''}, ${here.start} to ${here.end}${here.status === 'waiting' ? ' · waiting for approval' : ''}` : undefined} className={`border-t border-slate-100 p-0 text-center ${date === today ? 'bg-sky-50' : weekend ? 'bg-slate-50' : ''}`}>{here && <span className={`mx-auto my-0.5 grid h-6 w-7 place-items-center rounded text-[10px] font-bold ${here.status === 'approved' ? 'bg-violet-600 text-white' : 'bg-amber-200 text-amber-900'}`}>{here.type}{here.half ? '½' : ''}</span>}</td>; })}
      </tr>)}</tbody></table></div>}
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><span className="h-3 w-5 rounded bg-violet-600" />Approved</span><span className="inline-flex items-center gap-1"><span className="h-3 w-5 rounded bg-amber-200" />Waiting for approval</span><span>The letters are the leave type (AL annual, ML medical, UL unpaid, EL emergency). ½ is a half day.</span></p>
  </section>;
}

function TeamLeave({ onError }: { onError: (message: string) => void }) {
  const [rows, setRows] = useState<Leave[] | null>(null);
  const [today, setToday] = useState('');
  useEffect(() => { call('action=leave').then((result) => { setRows(result.leave); setToday(result.today); }).catch((cause: Error) => { setRows([]); onError(cause.message); }); }, []);
  const [page, setPage] = useState(0);
  const waitingAll = (rows || []).filter((row) => row.status === 'pending' || row.status === 'supervisor_approved').sort((a, b) => String(b.createdAt || '').slice(0, 10).localeCompare(String(a.createdAt || '').slice(0, 10)) || b.start.localeCompare(a.start));
  const waiting = waitingAll.slice(page * 10, page * 10 + 10);
  const table = (list: Leave[], empty: string) => !list.length ? <p className="text-sm text-slate-500">{empty}</p> : <table className="w-full min-w-[640px] text-sm">
    <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Leave</th><th className="pr-3">From</th><th className="pr-3">To</th><th className="pr-3 text-right">Days</th><th>Status</th></tr></thead>
    <tbody>{list.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.group} · {row.code}</p></td><td className="pr-3">{row.type}{row.halfDay && <span className="ml-1 text-xs text-slate-400">(half day)</span>}</td><td className="pr-3 whitespace-nowrap">{dayName(row.start)}</td><td className="pr-3 whitespace-nowrap">{dayName(row.end)}</td><td className="pr-3 text-right tabular-nums">{row.days}</td><td>{row.status === 'approved' ? (row.start <= today && row.end >= today ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">On leave now</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Approved</span>) : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">{row.status === 'pending' ? 'Waiting for supervisor' : 'Waiting for HR'}</span>}</td></tr>)}</tbody>
  </table>;
  return <div className="space-y-4">
    <LeaveSchedule onError={onError} />
    <section className={`${card} overflow-x-auto`}><h3 className="mb-3 font-semibold">Waiting for approval {rows && <span className="ml-1 text-sm font-normal text-slate-400">({waitingAll.length})</span>}</h3>{!rows ? <p className="text-sm text-slate-500">Loading…</p> : table(waiting, 'Nothing is waiting.')}{waitingAll.length > 10 && <nav className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500" aria-label="Pages"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Newer</button><span>{page * 10 + 1}–{Math.min(waitingAll.length, page * 10 + 10)} of {waitingAll.length}</span><button type="button" disabled={(page + 1) * 10 >= waitingAll.length} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Older</button></nav>}</section>
  </div>;
}

type GlancePerson = { id: string; name: string; company: string; group: string; joinDate: string | null; confirmDate: string | null; resignDate: string | null; probation: boolean };
// The team at a glance, like the HR Home: how many in the team, the Clinical Assistants at each clinic, who is on probation, new starters and those leaving.
export function TeamGlance({ onError, onStaff }: { onError: (message: string) => void; onStaff: () => void }) {
  const [data, setData] = useState<{ today: string; people: GlancePerson[] } | null>(null);
  useEffect(() => { call('action=glance').then(setData).catch((cause: Error) => onError(cause.message)); }, []);
  const people = data?.people;
  const today = data?.today || '';
  const first = (name: string) => name.split(/\s+/).filter((word) => !/^(NUR|NURUL|SITI|MOHAMAD|MUHAMAD|MUHAMMAD|MOHD|AHMAD)$/i.test(word))[0] || name;
  const label = (date: string) => new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' });
  const back7 = today ? new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10) : '';
  const count = (list: GlancePerson[], company: string) => list.filter((person) => person.company === company).length;
  const assistants = (people || []).filter((person) => person.group === 'Clinical Assistant');
  const probation = (people || []).filter((person) => person.probation && (!person.joinDate || person.joinDate <= today) && (!person.confirmDate || person.confirmDate > today));
  const starters = (people || []).filter((person) => person.joinDate && person.joinDate >= back7).sort((a, b) => a.joinDate!.localeCompare(b.joinDate!));
  const leaving = (people || []).filter((person) => person.resignDate && person.resignDate >= today).sort((a, b) => a.resignDate!.localeCompare(b.resignDate!));
  const cards = [
    { title: 'My team', count: people?.length, icon: Users, tone: 'bg-sky-50 text-sky-700', detail: people ? `KJ ${count(people, 'KJ')} · SK ${count(people, 'SK')}` : '', note: people ? `${assistants.length} CA · ${people.filter((person) => person.group === 'Clinical Admin').length} Clinical Admin · ${people.filter((person) => person.group === 'Doctor').length} doctors` : '' },
    { title: 'Clinical Assistants', count: people ? assistants.length : undefined, icon: Users, tone: 'bg-teal-50 text-teal-700', detail: people ? `SK ${count(assistants, 'SK')} · KJ ${count(assistants, 'KJ')}` : '', note: 'Active CA at each clinic' },
    { title: 'On probation', count: people ? probation.length : undefined, icon: ClipboardCheck, tone: 'bg-violet-50 text-violet-700', detail: probation.length ? probation.map((person) => `${first(person.name)} · ${person.company}`).join(' · ') : 'No staff currently on probation', note: 'HR-verified · already started' },
    { title: 'New starters', count: people ? starters.length : undefined, icon: UserRoundPlus, tone: 'bg-emerald-50 text-emerald-700', detail: starters.length ? starters.map((person) => `${first(person.name)} · ${person.company}`).join(' · ') : 'No new starters', note: starters.length ? starters.map((person) => `${person.joinDate! > today ? 'Starts' : 'Started'} ${label(person.joinDate!)}`).join(' · ') : 'Kept for 7 days after they start' },
    { title: 'Leaving', count: people ? leaving.length : undefined, icon: UserMinus, tone: 'bg-rose-50 text-rose-700', detail: leaving.length ? leaving.map((person) => `${first(person.name)} · ${label(person.resignDate!)}`).join(' · ') : 'No resignations planned', note: 'Last working day, from the staff profile' },
  ];
  return <section aria-label="Team overview" className="space-y-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-semibold tracking-tight">At a glance</h3><p className="text-xs text-slate-500">Your team today</p></div>
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-2 sm:gap-2 xl:grid-cols-5">{cards.map((item) => <button key={item.title} type="button" onClick={onStaff} disabled={!people} className="group min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-[0_5px_20px_rgba(20,35,59,0.03)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md disabled:pointer-events-none sm:w-auto sm:rounded-2xl sm:p-3.5">
      <div className="flex items-center justify-between"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-8 sm:w-8 ${item.tone}`}><item.icon size={15} /></span><p className="text-xl font-semibold leading-none tracking-tight text-[#17364c] sm:hidden">{item.count ?? '—'}</p><ArrowUpRight size={14} className="hidden text-slate-300 transition group-hover:text-sky-600 sm:block" /></div>
      <p className="mt-2 truncate text-[11px] font-medium text-slate-500 sm:mt-3 sm:text-xs">{item.title}</p><p className="hidden text-2xl font-semibold tracking-tight text-[#17364c] sm:block">{item.count ?? '—'}</p>
      <p className="mt-1 truncate text-[11px] font-semibold leading-4 text-slate-700 sm:mt-1.5 sm:whitespace-normal sm:text-xs">{people ? item.detail : 'Loading…'}</p><p className="mt-0.5 hidden text-[11px] leading-4 text-slate-500 sm:block">{people ? item.note : ' '}</p>
    </button>)}</div>
  </section>;
}

function AttendanceHub({ onError }: { onError: (message: string) => void }) {
  const [part, setPart] = useState<'today' | 'month' | 'ot'>('today');
  // The attendance of the COO's own team, read only; the OT tab is where the COO approves.
  const source = (query: string) => call(query);
  return <div className="text-compact space-y-3 sm:space-y-4">
    <SubTabs active={part} onSelect={setPart} tabs={[{ id: 'today', label: 'Today' }, { id: 'month', label: 'Month' }, { id: 'ot', label: 'OT' }]} />
    {part === 'today' ? <AttendanceDailyReport onError={onError} source={source} /> : part === 'month' ? <AttendanceMonthlyReport onError={onError} source={source} /> : <COOAttendance call={call} onError={onError} />}
  </div>;
}

function StaffDirectory({ onError }: { onError: (message: string) => void }) {
  const [people, setPeople] = useState<Parameters<typeof HRStaffLocation>[0]['people']>(null);
  useEffect(() => { call('action=directory').then((result) => setPeople(result.people)).catch((cause: Error) => { setPeople([]); onError(cause.message); }); }, []);
  const [part, setPart] = useState<'staff' | 'contact' | 'forecast'>('staff');
  const [contacts, setContacts] = useState<Parameters<typeof HRStaffContact>[0]['people']>(null);
  useEffect(() => { if (part === 'contact' && !contacts) call('action=contact_people').then((result) => setContacts(result.people)).catch((cause: Error) => { setContacts([]); onError(cause.message); }); }, [part]);
  return <div className="space-y-4">
    <SubTabs active={part} onSelect={setPart} tabs={[{ id: 'staff', label: 'Staff' }, { id: 'contact', label: 'Contact' }, { id: 'forecast', label: 'Forecast' }]} />
    {part === 'staff' ? <HRStaffLocation people={people} /> : part === 'contact' ? <HRStaffContact people={contacts} scope="coo" /> : <HRProjection readOnly />}
  </div>;
}

// `embedded`: shown inside the CEO office. The office keeps its own menu, as a row of tabs above the page instead of a sidebar.
export default function OfficeCOO({ embedded = false }: { embedded?: boolean } = {}) {
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const navigate = (next: View) => { setView(next); setMenuOpen(false); setError(''); window.scrollTo({ top: 0 }); };
  // Read once per office visit, then only when the user presses Refresh.
  const { data: waiting, busy: waitingBusy, refresh: refreshWaiting } = useOnDemandSummary<{ leave: number | null; requests: number | null; reviews: number | null; care: number | null }>('coo', () => call('action=coo_waiting').catch(() => ({ leave: null, requests: null, reviews: null, care: null })));
  const logout = async () => { await signOutSupabase(); localStorage.removeItem('ara_portal_session'); localStorage.removeItem('araoffice_user'); localStorage.removeItem('ara_view_mode'); window.location.hash = ''; };
  const title = NAV.find((item) => item.id === view)?.label || OFFICES.find((item) => item.id === view)?.label || '';
  return <div className={embedded ? 'coo-compact text-[#14233b]' : 'coo-compact min-h-screen bg-[#f7f8fb] text-[#14233b]'}>
    {menuOpen && !embedded && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)} />}
    <aside className={`${embedded ? 'hidden ' : ''}fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col overflow-y-auto border-r border-white/5 bg-[#1b3150] p-6 text-white transition-transform duration-300 lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2 py-3"><div className="flex items-center gap-3"><AraLogo className="h-11 w-11 rounded-[14px]" /><div><p className="text-[15px] font-bold tracking-wide">ARAOFFICE</p><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Chief Operating</p></div></div><button onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button></div>
      <div className="mx-1 mt-5 h-px bg-white/10" />
      <nav className="mt-6 flex-1 space-y-1">
        <p className="px-3.5 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f9bb0]">My team</p>
        {NAV.map((item) => <button key={item.id} onClick={() => navigate(item.id)} className={`flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold transition ${view === item.id ? 'bg-white text-[#14233b]' : 'text-[#c5d6e3] hover:bg-white/10'}`}><item.icon className={`h-[18px] w-[18px] shrink-0 ${TONE[item.id]}`} strokeWidth={1.8} /><span className="min-w-0 text-left">{item.label}</span></button>)}
        <a href={LOCUM_URL} target="_blank" rel="noreferrer" className="flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold text-[#c5d6e3] transition hover:bg-white/10"><Stethoscope className="h-[18px] w-[18px] shrink-0 text-cyan-300" strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">AraLocum</span><ExternalLink className="h-3.5 w-3.5 text-[#7f9bb0]" /></a>
        <p className="px-3.5 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f9bb0]">Offices I lead</p>
        {OFFICES.map((item) => <button key={item.id} onClick={() => navigate(item.id)} className={`flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold transition ${view === item.id ? 'bg-white text-[#14233b]' : 'text-[#c5d6e3] hover:bg-white/10'}`}><item.icon className={`h-[18px] w-[18px] shrink-0 ${TONE[item.id]}`} strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">{item.label}</span></button>)}
        <p className="px-3.5 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f9bb0]">Me</p>
        <a href="#office/individual" className="flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold text-[#c5d6e3] transition hover:bg-white/10"><IdCard className="h-[18px] w-[18px] shrink-0 text-teal-400" strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">Individual Sign In</span></a>
      </nav>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-sm font-semibold">COO</div><div className="min-w-0"><p className="truncate text-sm font-semibold">Operations</p><p className="truncate text-xs text-[#9bb5c7]">AraOffice portal</p></div></div><button onClick={() => void logout()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/15"><LogOut className="h-4 w-4" />Sign out</button></div>
    </aside>
    <div className={embedded ? '' : 'min-h-screen lg:pl-[300px]'}>
      {/* Phone and tablet: a slim header and a floating tab bar at the bottom (like AraLocum); the full menu opens from "More". */}
      <header className={`sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md lg:hidden${embedded ? ' !hidden' : ''}`}><div className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex min-w-0 items-center gap-2.5"><AraLogo className="h-8 w-8 rounded-lg" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-[#18bff2]">Office COO</p><h1 className="mt-0.5 truncate text-[15px] font-semibold leading-tight tracking-tight">{title}</h1></div></div><button className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu className="h-[18px] w-[18px]" /></button></div></header>
      <main className={embedded ? 'pt-1' : 'p-3 pb-28 sm:p-6 sm:pb-28 lg:p-[38px]'}>
<StackTables>
        {embedded && <EmbeddedTabs tabs={NAV.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))} active={view} onSelect={navigate} />}
        {view === 'clinical' || view === 'ca' ? <Suspense fallback={<p role="status" className="p-4 text-sm text-slate-500">Opening the office…</p>}><div className="max-sm:[zoom:0.84]">{view === 'clinical' ? <OfficeClinical key="clinical" embedded /> : <OfficePortal key="ca" embedded />}</div></Suspense> :
        <div className="mx-auto max-w-[1500px] space-y-5">
          {view === 'home' && <section className="ara-hero rounded-[18px] px-4 py-3.5 text-white sm:rounded-[30px] sm:px-10 sm:py-9 lg:px-12">
            <div className="flex flex-col gap-4 sm:gap-7 md:flex-row md:items-start md:justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Klinik ARA 24 Jam · Chief Operating</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] sm:mt-3 sm:text-[2.45rem]">Welcome, Dr Luqman</h2><p className="mt-2 hidden text-sm text-[#bed2df] sm:mt-3 sm:block sm:text-base">Your team, your calendar and the approvals that wait for you.</p></div>
              <div className="text-left md:text-right"><span className="inline-flex rounded-full bg-white/12 px-4 py-2 text-xs font-semibold text-[#d9e7ef] sm:px-5 sm:py-2.5 sm:text-sm">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })}</span><p className="mt-2 text-[11px] italic leading-4 text-[#a9c1d0] sm:mt-4 sm:text-sm sm:leading-6 md:ml-auto md:max-w-[360px]">“Success isn’t about massive breakthroughs or one-time actions; it’s about the small, consistent steps you take every day.”</p></div>
            </div>
          </section>}
          {view !== 'review' && view !== 'home' && <section className="ara-hero rounded-[18px] px-4 py-3 text-white sm:rounded-[30px] sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office COO · Klinik ARA 24 Jam</p><h2 className="mt-1 text-xl font-semibold tracking-tight sm:mt-3 sm:text-3xl">{title}</h2><p className="mt-2 hidden max-w-2xl text-sm leading-6 text-[#b9cfdd] sm:mt-3 sm:block sm:text-base sm:leading-7">{view === 'home' ? 'Your own calendar and reminders. Add a reminder for a date, repeat it, and tick it Done.' : view === 'leave' ? 'Who is on leave, day by day, and the leave of your team that is still waiting for approval. HR keeps the final decision.' : view === 'assessment' ? 'The assessments for the Clinical Assistants: add or edit the questions, and see everyone’s results.' : view === 'attendance' ? 'Your team’s attendance today and for the month (view only), and the OT requests that wait for your approval. After you approve, HR confirms the OT rate.' : view === 'review' ? 'The monthly reviews HR has given to you. Fill in the form and sign; the result goes back to HR.' : view === 'charts' ? 'The people of the company, leave and attendance, incentives and performance reviews.' : view === 'roster' ? 'The duty roster, as HR keeps it. You can look at it but not change it.' : view === 'staff' ? 'All active staff by group and clinic, and the CA staffing forecast. You can look at them but not change them.' : 'The AraCare Care Coordination Allowance claims: check the KPIs and say if the allowance is payable.'}</p>
          </section>}
          {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          {view === 'home' && <div className="space-y-6"><WaitingForYou loading={!waiting || waitingBusy} onRefresh={refreshWaiting} items={[{ key: 'leave', label: 'Leave approvals', note: 'Leave waiting for your decision', icon: CalendarCheck, count: waiting?.leave, onOpen: () => navigate('leave') }, { key: 'ot', label: 'OT & clock requests', note: 'Overtime and forgotten clocks', icon: Clock3, count: waiting?.requests, onOpen: () => navigate('attendance') }, { key: 'review', label: 'Performance Review', note: 'Reviews HR has given to you', icon: ClipboardCheck, count: waiting?.reviews, onOpen: () => navigate('review') }, { key: 'care', label: 'AraCare to check', note: 'Check the KPIs of the allowance', icon: HeartPulse, count: waiting?.care, onOpen: () => navigate('care') }]} /><TeamGlance onError={setError} onStaff={() => navigate('staff')} /><COOCalendar /></div>}
          {view === 'staff' && <StaffDirectory onError={setError} />}
          {view === 'leave' && <TeamLeave onError={setError} />}
          {view === 'roster' && <HRRoster readOnly canDraft hideCodes={ROSTER_HIDDEN} defaultView="calendar" onError={setError} />}
          {view === 'assessment' && <Suspense fallback={<p role="status" className="p-4 text-sm text-slate-500">Opening the Assessment Room…</p>}><AssessmentAdmin embedded /></Suspense>}
          {view === 'attendance' && <AttendanceHub onError={setError} />}
          {view === 'review' && <ReviewRoom embedded onSignedOut={() => undefined} api={(query, body) => call(query.replace('action=', 'action=review_'), body)} />}
          {view === 'charts' && <CeoChartsPage source="coo" onError={setError} />}
          {view === 'care' && <CareReviewPage load={() => call('action=care')} review={(payload) => call('action=care_review', payload)} onError={setError} />}
        </div>}
</StackTables>
      </main>
      <nav aria-label="Main" className={`${embedded ? 'hidden ' : ''}fixed inset-x-4 bottom-4 z-40 flex select-none justify-around rounded-2xl border border-slate-100 bg-white/95 px-2 py-2 shadow-[0_8px_30px_rgba(15,23,42,0.16)] backdrop-blur-md lg:hidden`}>
        {([['home', 'Home', Home], ['clinical', 'Clinical Admin', ClipboardList], ['ca', 'CA office', GraduationCap]] as const).map(([id, label, Icon]) => { const current = view === id; return <button key={id} type="button" onClick={() => navigate(id)} aria-current={current ? 'page' : undefined} className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1 outline-none transition ${current ? 'scale-105 font-bold text-[#007AFF]' : 'text-slate-400'}`}><Icon className="h-[21px] w-[21px]" strokeWidth={current ? 2.2 : 1.8} /><span className="max-w-[72px] truncate text-[9.5px] leading-tight">{label}</span></button>; })}
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open the full menu" className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 outline-none transition ${menuOpen || !['home', 'clinical', 'ca'].includes(view) ? 'scale-105 font-bold text-[#007AFF]' : 'text-slate-400'}`}><Menu className="h-[21px] w-[21px]" strokeWidth={menuOpen || !['home', 'clinical', 'ca'].includes(view) ? 2.2 : 1.8} /><span className="max-w-[72px] truncate text-[9.5px] leading-tight">Others</span></button>
      </nav>
    </div>
  </div>;
}
