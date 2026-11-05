import { lazy, ReactNode, Suspense, useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Banknote, ClipboardCheck, IdCard, CalendarCheck, CalendarDays, ChevronRight, Clock3, FileBarChart, Home, Link2, LogOut, Menu, Search, Tags, UserRoundSearch, Users, Wallet, X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { useMalaysiaToday } from './lib/useMalaysiaToday';
import { signOutSupabase } from './lib/supabase';
import { card } from './AssessmentStaff';
import { LEAVE_GROUPS, LEAVE_TYPES } from './lib/leaveTypes';
import { HRProfiles } from './HRProfiles';
import { HRMisc } from './HRMisc';
import { HRReviews } from './HRReviews';
import { HRAttendance } from './HRAttendance';
import { HRRoster } from './HRRoster';
import { HRLeave } from './HRLeave';
import { HRIncentives } from './HRIncentives';
import { HRReports } from './HRReports';
import { HRPayroll } from './HRPayroll';
const HRMemoGuide = lazy(() => import('./HRMemoGuide'));
const HRHomeCalendar = lazy(() => import('./HRHomeCalendar'));
const PayrollCharts = lazy(() => import('./PayrollCharts').then((module) => ({ default: module.PayrollCharts })));

// Office HR, laid out like the CA and Clinical Admin offices. Built a piece at a time: the
// staff directory and the leave types (the same codes as Infotech) come first; leave
// requests, attendance and the roster follow.
const API = '/api/status?resource=hr';

type View = 'home' | 'profiles' | 'reviews' | 'leaveTypes' | 'leave' | 'attendance' | 'roster' | 'incentives' | 'payroll' | 'reports' | 'memos' | 'misc';

const TABS: { id: Exclude<View, 'home'>; label: string; note: string; icon: typeof Home; tone: string; soon?: boolean }[] = [
  { id: 'profiles', label: 'Staff Profiles', note: 'Personal, job & pay details', icon: IdCard, tone: 'text-[#20c7f4]' },
  { id: 'reviews', label: 'Performance Reviews', note: 'Reviews from supervisors', icon: ClipboardCheck, tone: 'text-[#4ade80]' },
  { id: 'leave', label: 'Leave', note: 'Requests & leave types', icon: CalendarCheck, tone: 'text-emerald-400' },
  { id: 'incentives', label: 'Incentive', note: 'Sent by Clinical Admin', icon: Wallet, tone: 'text-[#ffb000]' },
  { id: 'attendance', label: 'Attendance', note: 'Clock in / out & OT', icon: Clock3, tone: 'text-[#ff7ab6]' },
  { id: 'roster', label: 'Roster', note: 'Duty roster by month', icon: CalendarDays, tone: 'text-[#9b8cff]' },
  { id: 'payroll', label: 'Payroll', note: 'Monthly pay & payslips', icon: Banknote, tone: 'text-[#f59e0b]' },
  { id: 'memos', label: 'Memo/Guide', note: 'Memos and guides from HR', icon: BookOpen, tone: 'text-[#70d8fa]' },
  { id: 'misc', label: 'Miscellaneous', note: 'Links, posters and notes', icon: Link2, tone: 'text-[#70d8fa]' },
  { id: 'reports', label: 'Reports', note: 'All HR reports in one place', icon: FileBarChart, tone: 'text-[#4ade80]' },
];
const TITLES: Record<View, string> = { misc: 'Miscellaneous', home: 'Home', profiles: 'Staff Profiles', reviews: 'Performance Reviews', leaveTypes: 'Leave Types', leave: 'Leave', attendance: 'Attendance', roster: 'Roster', incentives: 'Incentive', payroll: 'Payroll', reports: 'Reports', memos: 'Memo/Guide' };
// What each upcoming tab will do, shown until it is built.
const PLANNED: Partial<Record<View, string[]>> = {
  leave: ['Staff apply for leave from their phones (same sign-in as Incentive Claims)', 'Clinical Admin or HR approve or reject, with a note', 'Leave balance worked out for each staff member', 'Calendar of who is on leave, by branch'],
  attendance: ['Clock in / out on the phone, checked against the clinic location', 'Late, early out and working hours each day', 'Ask to correct a time or claim OT (1.0 / 1.5 / 2.0 / 3.0), with approval'],
  roster: ['Weekly shifts by branch', 'Staff see their own shifts', 'Linked to the Clinical Admin daily checklist "Today\'s shifts"'],
};

function Hero({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9">
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">{text}</p></div>
      {action}
    </div>
  </section>;
}

function Sidebar({ view, open, onClose, onNavigate, onLogout, badges = {} }: { badges?: Partial<Record<View, number>>; view: View; open: boolean; onClose: () => void; onNavigate: (view: View) => void; onLogout: () => void }) {
  const items = [{ id: 'home' as View, label: 'Home', icon: Home, tone: 'text-[#818cf8]', soon: false }, ...TABS];
  return <>
    {open && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col overflow-y-auto overscroll-contain border-r border-white/5 bg-[#1b3150] p-6 text-white transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2 py-3">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/20 bg-white/10 text-[#70d8fa]"><UserRoundSearch className="h-6 w-6" /></div><div><p className="text-[15px] font-bold tracking-tight">ARAOFFICE</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#70d8fa]">Human Resources</p></div></div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      <div className="mx-1 mt-5 h-px bg-white/10" />
      <nav className="mt-6 flex-1 space-y-1">{items.map((item) => <button key={item.id} onClick={() => onNavigate(item.id)} className={`flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold transition ${view === item.id || (item.id === 'leave' && view === 'leaveTypes') ? 'bg-white text-[#162a43] shadow-[0_10px_28px_rgba(0,0,0,0.18)]' : 'text-[#e3ecf5] hover:bg-white/[0.07] hover:text-white'}`}>
        <item.icon className={`h-[18px] w-[18px] shrink-0 ${item.tone}`} strokeWidth={1.8} />{item.label}
        {!!badges[item.id] && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{badges[item.id]}</span>}
        {item.soon ? <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${view === item.id ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-[#9bb5c7]'}`}>Soon</span> : <ChevronRight className="ml-auto h-4 w-4 opacity-45" />}
      </button>)}</nav>
      <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-sm font-semibold">HR</div><div className="min-w-0"><p className="truncate text-sm font-semibold">Human Resources</p><p className="truncate text-xs text-[#9bb5c7]">AraOffice portal</p></div></div>
        <button onClick={onLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[#b5cad8] transition hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </aside>
  </>;
}

function HomeView({ onNavigate, onForecast }: { onNavigate: (view: View) => void; onForecast: () => void }) {
  const today = useMalaysiaToday();
  const date = new Date(`${today}T12:00:00+08:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
  return <div className="mx-auto max-w-[1500px] space-y-8">
    <section className="ara-hero rounded-[30px] px-7 py-9 text-white sm:px-10 lg:px-12">
      <div className="flex flex-col gap-7 md:flex-row md:items-start md:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Klinik ARA 24 Jam · Human Resources</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-[2.45rem]">Welcome to Office HR</h2><p className="mt-3 text-base text-[#bed2df]">Your people, upcoming milestones and monthly priorities.</p></div>
        <div className="text-left md:text-right"><span className="inline-flex rounded-full bg-white/12 px-5 py-2.5 text-sm font-semibold text-[#d9e7ef]">{date}</span><p className="mt-4 text-sm italic leading-6 text-[#a9c1d0] md:ml-auto md:max-w-[360px]">“Train people well enough so they can leave, treat them well enough so they don’t want to.”</p></div>
      </div>
    </section>
    <Suspense fallback={<p className="p-4 text-sm text-slate-500">Loading HR overview…</p>}><HRHomeCalendar onReviews={() => onNavigate('reviews')} onPayroll={() => onNavigate('payroll')} onProfiles={() => onNavigate('profiles')} onForecast={onForecast} /></Suspense>
    <Suspense fallback={<p className="p-4 text-sm text-slate-500">Loading charts…</p>}><PayrollCharts compact /></Suspense>
  </div>;
}

function LeaveTypes({ onBack }: { onBack: () => void }) {
  const groups = [...new Set(LEAVE_TYPES.map((type) => type.group))];
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <Hero title="Leave types" text={`The ${LEAVE_TYPES.length} leave types and ${LEAVE_GROUPS.length} leave groups set up for HSO in Infotech, with the same codes so AraOffice leave lines up with Infotech payroll. Days each type allows are set next, from INFO-LEAVE.`}  action={<button onClick={onBack} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-white/12 px-5 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/20">← Back to leave requests</button>} />
    <div className="grid gap-4 lg:grid-cols-2">{groups.map((group) => <section key={group} className={card}>
      <h3 className="font-semibold">{group}</h3>
      <ul className="mt-3 divide-y divide-slate-100">{LEAVE_TYPES.filter((type) => type.group === group).map((type) => <li key={type.code} className="flex items-center gap-3 py-2.5 text-sm">
        <span className="w-16 shrink-0 font-mono text-xs font-bold text-[#0b587b]">{type.code}</span>
        <span className="min-w-0 flex-1">{type.name}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${type.pay.toLowerCase().includes('unpaid') ? 'bg-rose-50 text-rose-700' : type.isLeave ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{type.pay}</span>
      </li>)}</ul>
    </section>)}</div>
  </div>;
}

function ComingSoon({ view }: { view: View }) {
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <Hero title={TITLES[view]} text="Being built. Here is what it will do." />
    <section className={card}><ul className="space-y-3">{(PLANNED[view] || []).map((line) => <li key={line} className="flex gap-3 text-sm leading-6"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0b9aca]" />{line}</li>)}</ul></section>
  </div>;
}

export default function OfficeHR() {
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [profileTab, setProfileTab] = useState<'list' | 'projection'>('list');
  const [pendingRequests, setPendingRequests] = useState(0);
  // Everything waiting for HR (red numbers on the menu), refreshed when the menu changes and every few minutes.
  const [waiting, setWaiting] = useState<{ leave: number; reviews: number; incentive: number; attendanceOt: number; attendanceMissed: number }>({ leave: 0, reviews: 0, incentive: 0, attendanceOt: 0, attendanceMissed: 0 });
  const loadWaiting = () => officeFetch('/api/status?resource=hr&action=hr_badges').then((response) => response.json()).then((result) => { if (!result.error) setWaiting(result); }).catch(() => undefined);
  useEffect(() => { void loadWaiting(); const timer = window.setInterval(() => void loadWaiting(), 180000); return () => window.clearInterval(timer); }, [view]);
  // The number on Staff Profiles: staff change requests waiting for HR.
  useEffect(() => { officeFetch(`${API}&action=profile_requests`).then((response) => response.json()).then((result) => setPendingRequests(result.pending || 0)).catch(() => undefined); }, []);

  const navigate = (next: View) => { setProfileTab('list'); setView(next); setMenuOpen(false); window.scrollTo({ top: 0 }); };
  const logout = async () => {
    await signOutSupabase();
    localStorage.removeItem('ara_portal_session');
    localStorage.removeItem('araoffice_user');
    localStorage.removeItem('ara_view_mode');
    window.location.hash = '';
  };

  return <div className="min-h-screen bg-[#f7f8fb] text-[#14233b]">
    <Sidebar badges={{ profiles: pendingRequests, leave: waiting.leave, reviews: waiting.reviews, incentives: waiting.incentive, attendance: waiting.attendanceOt + waiting.attendanceMissed }} view={view} open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={navigate} onLogout={() => void logout()} />
    <div className="min-h-screen lg:pl-[300px]">
      <header className="sticky top-0 z-30 border-b border-[#dce4ed] bg-[#f7f8fb]/90 backdrop-blur-2xl lg:hidden">
        <div className="flex h-[76px] items-center gap-4 px-4 sm:px-6">
          <button className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce4ed] bg-white" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#18bff2]">Office HR</p><h1 className="truncate text-xl font-semibold tracking-tight">{TITLES[view]}</h1></div>
        </div>
      </header>
      <main className="p-4 sm:p-6 lg:p-[38px]">
        {error && <p className="mx-auto mb-4 max-w-[1500px] rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        {view === 'home' && <HomeView onNavigate={navigate} onForecast={() => { navigate('profiles'); setProfileTab('projection'); }} />}
        {view === 'profiles' && <HRProfiles initialTab={profileTab} onError={setError} pendingRequests={pendingRequests} onPendingChange={setPendingRequests} />}
        {view === 'reviews' && <HRReviews onError={setError} />}
        {view === 'roster' && <HRRoster onError={setError} />}
        {view === 'incentives' && <HRIncentives onError={setError} />}
        {view === 'leave' && <HRLeave onError={setError} onTypes={() => navigate('leaveTypes')} />}
        {view === 'leaveTypes' && <LeaveTypes onBack={() => navigate('leave')} />}
        {view === 'attendance' && <HRAttendance onError={setError} badges={{ ot: waiting.attendanceOt, missed: waiting.attendanceMissed }} />}
        {view === 'payroll' && <HRPayroll onError={setError} />}
        {view === 'memos' && <Suspense fallback={<p role="status" className="p-4 text-sm text-slate-500">Loading HR memos…</p>}><HRMemoGuide /></Suspense>}
        {view === 'misc' && <HRMisc onError={setError} />}
        {view === 'reports' && <HRReports onError={setError} />}
      </main>
    </div>
  </div>;
}
