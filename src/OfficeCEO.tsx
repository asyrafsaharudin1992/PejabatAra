import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AraLogo } from './AraLogo';
import { SubTabs } from './SubTabs';
import { ClipboardList, Crown, ExternalLink, GraduationCap, HeartPulse, Home, IdCard, BarChart3, CalendarCheck, ClipboardCheck, LogOut, Menu, Pencil, Plus, Stethoscope, Trash2, Users, UserRound, UsersRound as TeamIcon, UsersRound, HandCoins, ShieldCheck, X } from 'lucide-react';
import COOCalendar from './COOCalendar';
import { officeFetch } from './lib/officeApi';
import { Approvals } from './LeaveScreens';
import { ReviewRoom } from './OfficeReview';
import { CeoChartsPage } from './CeoCharts';
import { useMalaysiaToday } from './lib/useMalaysiaToday';
import { CEO_TASKS, FREQUENCIES, FREQUENCY_TITLE, periodKey, type CeoFrequency, type CeoTask } from './lib/ceoTasks';
import { signOutSupabase } from './lib/supabase';

// Office CEO: built like the COO office (same look, same home), but the left side lists every room the CEO can enter, directly.
// Every room opens inside this office, on the right, with its own menu shown as tabs above the page.
const OfficeClinical = lazy(() => import('./OfficeClinical'));
const OfficePortal = lazy(() => import('./PortalApp'));
const OfficeCOO = lazy(() => import('./OfficeCOO'));
const OfficeHR = lazy(() => import('./OfficeHR'));
const OfficeQuality = lazy(() => import('./App'));

type View = 'home' | 'charts' | 'leave' | 'review' | 'coo' | 'hr' | 'quality' | 'clinical' | 'ca';
type Waiting = { leave: number | null; reviews: number | null };
// What waits for the CEO, read from the same lists as the CEO's Individual Sign In.
async function ceoCall(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=coo&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
const DESK: { id: 'leave' | 'review'; label: string; note: string; icon: typeof Home; tone: string; key: keyof Waiting }[] = [
  { id: 'leave', label: 'Leave approvals', note: 'Leave waiting for your decision', icon: CalendarCheck, tone: 'text-amber-400', key: 'leave' },
  { id: 'review', label: 'Performance Review', note: 'Reviews HR has given to you', icon: ClipboardCheck, tone: 'text-orange-400', key: 'reviews' },
];
const LOCUM_URL = 'https://aralocum.hsohealthcare.com/';
const CARE_URL = 'https://aracare.hsohealthcare.com/';
const INSIDE: { id: Exclude<View, 'home'>; label: string; icon: typeof Home; tone: string }[] = [
  { id: 'coo', label: 'COO office', icon: UsersRound, tone: 'text-sky-400' },
  { id: 'hr', label: 'HR office', icon: ShieldCheck, tone: 'text-emerald-400' },
  { id: 'quality', label: 'Quality & Corporate', icon: HandCoins, tone: 'text-amber-400' },
  { id: 'clinical', label: 'Clinical Admin', icon: ClipboardList, tone: 'text-cyan-300' },
  { id: 'ca', label: 'Clinical Assistants (CA)', icon: GraduationCap, tone: 'text-fuchsia-400' },
];
const SYSTEMS: { href: string; label: string; icon: typeof Home; tone: string }[] = [
  { href: LOCUM_URL, label: 'AraLocum', icon: Stethoscope, tone: 'text-cyan-300' },
  { href: CARE_URL, label: 'AraCare', icon: HeartPulse, tone: 'text-rose-400' },
];
const side = 'flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold transition';
const heading = 'px-3.5 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f9bb0]';

function WaitingForYou({ waiting, onOpen }: { waiting: Waiting | null; onOpen: (view: 'leave' | 'review') => void }) {
  const total = waiting ? DESK.reduce((sum, item) => sum + (waiting[item.key] || 0), 0) : null;
  return <section aria-label="Waiting for you" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_5px_20px_rgba(20,35,59,0.03)] sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-semibold tracking-tight">Waiting for you</h3><span className={`rounded-full px-3 py-1 text-xs font-semibold ${total ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{total === null ? 'Loading…' : total ? `${total} waiting` : 'Nothing waiting'}</span></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">{DESK.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:bg-slate-50">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500"><item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#14233b]">{item.label}</span><span className="block text-[11px] leading-4 text-slate-500 sm:text-xs">{item.note}</span></span>
      <span className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-sm font-semibold ${waiting?.[item.key] ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{waiting ? waiting[item.key] ?? '—' : '…'}</span>
    </button>)}</div>
  </section>;
}

type Count = { all: number; KJ: number; SK: number };
// The people of the company at a glance: everyone, doctors, Clinical Assistants and admins, with the split by clinic.
function Headcount({ onError }: { onError: (message: string) => void }) {
  const [data, setData] = useState<{ team: Count; doctors: Count; assistants: Count; admins: Count } | null>(null);
  useEffect(() => { officeFetch('/api/status?resource=coo&action=headcount').then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => onError(cause.message)); }, []);
  const cards = [
    { title: 'Total team', value: data?.team, icon: TeamIcon, tone: 'bg-sky-50 text-sky-700', note: 'All active staff' },
    { title: 'Doctors', value: data?.doctors, icon: Stethoscope, tone: 'bg-violet-50 text-violet-700', note: 'Directors included' },
    { title: 'Clinical Assistants', value: data?.assistants, icon: Users, tone: 'bg-teal-50 text-teal-700', note: 'Active CA at each clinic' },
    { title: 'Admins', value: data?.admins, icon: UserRound, tone: 'bg-emerald-50 text-emerald-700', note: 'Office admin and Clinical Admin' },
  ];
  return <section aria-label="People overview" className="space-y-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-semibold tracking-tight">At a glance</h3><p className="text-xs text-slate-500">Everyone in the company today</p></div>
    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">{cards.map((item) => <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_5px_20px_rgba(20,35,59,0.03)] sm:p-4">
      <div className="flex items-center justify-between"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.tone}`}><item.icon size={16} /></span><p className="text-2xl font-semibold leading-none tracking-tight text-[#17364c] sm:text-3xl">{item.value?.all ?? '—'}</p></div>
      <p className="mt-2 text-xs font-medium text-slate-500">{item.title}</p>
      <p className="mt-1 text-xs font-semibold text-slate-700">{item.value ? `KJ ${item.value.KJ} · SK ${item.value.SK}` : 'Loading…'}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.note}</p>
    </div>)}</div>
  </section>;
}

// The CEO's recurring tasks (daily, weekly, monthly, quarterly), with a filter by how often. A tick lasts for its own day, week, month or quarter,
// so the list starts fresh each time the period changes. The list and the ticks are kept on the server, so they follow the CEO to any device.
// The CEO can edit the list: change a task, add one, delete one, or go back to the standard list.
function CeoTasks({ onError }: { onError: (message: string) => void }) {
  const today = useMalaysiaToday();
  const [filter, setFilter] = useState<'all' | CeoFrequency>('all');
  const [tasks, setTasks] = useState<CeoTask[]>(CEO_TASKS);
  const [custom, setCustom] = useState(false);
  const [done, setDone] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState('');
  const [version, setVersion] = useState<string | null>(null);
  const [draft, setDraft] = useState<CeoTask[] | null>(null);
  const load = (result: { done?: Record<string, string>; tasks?: CeoTask[]; custom?: boolean; version?: string | null }) => { setVersion(result.version || null); setDone(result.done || {}); if (result.tasks) setTasks(result.tasks); if (result.custom !== undefined) setCustom(result.custom); };
  const send = async (action: string, body: Record<string, unknown>) => {
    const response = await officeFetch(`/api/status?resource=coo&action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, version }) });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Could not save.');
    return result;
  };
  useEffect(() => { officeFetch('/api/status?resource=coo&action=ceo_tasks').then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); load(result); }).catch((cause: Error) => { setDone({}); onError(cause.message); }); }, []);
  const isDone = (task: CeoTask) => done?.[task.id] === periodKey(task.frequency, today);
  const toggle = async (task: CeoTask) => {
    setBusy(task.id);
    try { load(await send('ceo_task_toggle', { id: task.id, period: periodKey(task.frequency, today), done: !isDone(task) })); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not save this tick.'); } finally { setBusy(''); }
  };
  const save = async () => {
    if (!draft) return;
    setBusy('save');
    try { load(await send('ceo_tasks_save', { tasks: draft })); setDraft(null); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not save the tasks.'); } finally { setBusy(''); }
  };
  const reset = async () => {
    if (!window.confirm('Go back to the standard task list? Your own changes to the list will be removed.')) return;
    setBusy('save');
    try { load(await send('ceo_tasks_save', { reset: true })); setDraft(null); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not reset the tasks.'); } finally { setBusy(''); }
  };
  const change = (id: string, patch: Partial<CeoTask>) => setDraft((current) => current && current.map((task) => task.id === id ? { ...task, ...patch } : task));
  const editing = draft !== null;
  const list = draft || tasks;
  const shown = FREQUENCIES.filter((frequency) => filter === 'all' || filter === frequency);
  const doneCount = tasks.filter((task) => (filter === 'all' || task.frequency === filter) && isDone(task)).length;
  const total = tasks.filter((task) => filter === 'all' || task.frequency === filter).length;
  const field = 'block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800';
  return <section aria-label="CEO tasks" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_5px_20px_rgba(20,35,59,0.03)] sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-semibold tracking-tight">CEO tasks</h3>
      <span className="flex items-center gap-3 text-xs font-semibold text-slate-500">{!editing && <span>{done ? `${doneCount} of ${total} done` : 'Loading…'}</span>}{!editing && <button type="button" onClick={() => setDraft(tasks.map((task) => ({ ...task })))} disabled={!done} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Pencil className="h-3 w-3" />Edit</button>}</span></div>
    {!editing && <div className="mt-3"><SubTabs active={filter} onSelect={setFilter} tabs={[{ id: 'all', label: 'All' }, { id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }, { id: 'quarterly', label: 'Quarterly', short: 'Quarter' }]} /></div>}
    {editing && <p className="mt-2 text-xs text-slate-500">Change the wording, how often a task comes round, add a task or delete one. Nothing is saved until you press Save.</p>}
    <div className="mt-4 space-y-5">{(editing ? FREQUENCIES : shown).map((frequency) => <div key={frequency}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b9aca]">{FREQUENCY_TITLE[frequency]}</p>
      <ul className="mt-2 space-y-2">{list.filter((task) => task.frequency === frequency).map((task) => editing
        ? <li key={task.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <input value={task.title} maxLength={120} onChange={(event) => change(task.id, { title: event.target.value })} aria-label="Task" placeholder="Task" className={`${field} font-semibold`} />
            <textarea value={task.note} maxLength={300} rows={2} onChange={(event) => change(task.id, { note: event.target.value })} aria-label="Details" placeholder="Details (optional)" className={`${field} text-xs`} />
            <div className="flex items-center justify-between gap-2"><select value={task.frequency} onChange={(event) => change(task.id, { frequency: event.target.value as CeoFrequency })} aria-label="How often" className={`${field} w-auto`}>{FREQUENCIES.map((item) => <option key={item} value={item}>{FREQUENCY_TITLE[item]}</option>)}</select>
              <button type="button" onClick={() => setDraft((current) => current && current.filter((item) => item.id !== task.id))} aria-label="Delete task" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete</button></div>
          </li>
        : <li key={task.id}><label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${isDone(task) ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100 hover:bg-slate-50'}`}>
            <input type="checkbox" checked={isDone(task)} disabled={!done || Boolean(busy)} onChange={() => void toggle(task)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0b587b]" />
            <span className="min-w-0"><span className={`block text-sm font-semibold ${isDone(task) ? 'text-slate-400 line-through' : 'text-[#14233b]'}`}>{task.title}</span>{task.note && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{task.note}</span>}</span>
          </label></li>)}</ul>
      {editing && <button type="button" onClick={() => setDraft((current) => current && [...current, { id: crypto.randomUUID().replace(/-/g, '').slice(0, 16), frequency, title: '', note: '' }])} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Add a task</button>}
    </div>)}</div>
    {editing && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
      <button type="button" onClick={() => void save()} disabled={busy === 'save'} className="rounded-xl bg-[#0b587b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a4b69] disabled:opacity-40">Save</button>
      <button type="button" onClick={() => setDraft(null)} disabled={busy === 'save'} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
      {custom && <button type="button" onClick={() => void reset()} disabled={busy === 'save'} className="ml-auto rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">Back to the standard list</button>}
    </div>}
  </section>;
}

export default function OfficeCEO() {
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  // Refreshed when the CEO moves between pages, so the numbers stay true after a decision.
  // Read when the office opens, right after the CEO leaves a decision page (Leave, Review), and at most once in five minutes otherwise.
  const lastWaiting = useRef(0), previousView = useRef<View>('home');
  useEffect(() => { const left = previousView.current === 'leave' || previousView.current === 'review'; previousView.current = view; if (!left && Date.now() - lastWaiting.current < 5 * 60 * 1000) return; lastWaiting.current = Date.now(); ceoCall('action=ceo_waiting').then((result) => setWaiting(result)).catch(() => setWaiting({ leave: null, reviews: null })); }, [view]);
  const navigate = (next: View) => { setView(next); setMenuOpen(false); setError(''); window.scrollTo({ top: 0 }); };
  const logout = async () => { await signOutSupabase(); localStorage.removeItem('ara_portal_session'); localStorage.removeItem('araoffice_user'); localStorage.removeItem('ara_view_mode'); window.location.hash = ''; };
  const title = view === 'home' ? 'Home' : view === 'charts' ? 'Charts' : DESK.find((item) => item.id === view)?.label || INSIDE.find((item) => item.id === view)?.label || '';
  return <div className="coo-compact min-h-screen bg-[#f7f8fb] text-[#14233b]">
    {menuOpen && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col overflow-y-auto border-r border-white/5 bg-[#1b3150] p-6 text-white transition-transform duration-300 lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2 py-3"><div className="flex items-center gap-3"><AraLogo className="h-11 w-11 rounded-[14px]" /><div><p className="text-[15px] font-bold tracking-wide">ARAOFFICE</p><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Chief Executive</p></div></div><button onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button></div>
      <div className="mx-1 mt-5 h-px bg-white/10" />
      <nav className="mt-6 flex-1 space-y-1">
        <button onClick={() => navigate('home')} className={`${side} ${view === 'home' ? 'bg-white text-[#14233b]' : 'text-[#c5d6e3] hover:bg-white/10'}`}><Home className="h-[18px] w-[18px] shrink-0 text-sky-400" strokeWidth={1.8} /><span className="min-w-0 text-left">Home</span></button>
        <button onClick={() => navigate('charts')} className={`${side} ${view === 'charts' ? 'bg-white text-[#14233b]' : 'text-[#c5d6e3] hover:bg-white/10'}`}><BarChart3 className="h-[18px] w-[18px] shrink-0 text-violet-400" strokeWidth={1.8} /><span className="min-w-0 text-left">Charts</span></button>
        <p className={heading}>My desk</p>
        {DESK.map((item) => <button key={item.id} onClick={() => navigate(item.id)} className={`${side} ${view === item.id ? 'bg-white text-[#14233b]' : 'text-[#c5d6e3] hover:bg-white/10'}`}><item.icon className={`h-[18px] w-[18px] shrink-0 ${item.tone}`} strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">{item.label}</span>{!!waiting?.[item.key] && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{waiting[item.key]}</span>}</button>)}
        <p className={heading}>Rooms</p>
        {INSIDE.map((item) => <button key={item.id} onClick={() => navigate(item.id)} className={`${side} ${view === item.id ? 'bg-white text-[#14233b]' : 'text-[#c5d6e3] hover:bg-white/10'}`}><item.icon className={`h-[18px] w-[18px] shrink-0 ${item.tone}`} strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">{item.label}</span></button>)}
        <p className={heading}>Systems</p>
        {SYSTEMS.map((item) => <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className={`${side} text-[#c5d6e3] hover:bg-white/10`}><item.icon className={`h-[18px] w-[18px] shrink-0 ${item.tone}`} strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">{item.label}</span><ExternalLink className="h-3.5 w-3.5 text-[#7f9bb0]" /></a>)}
        <p className={heading}>Me</p>
        <a href="#office/individual" className={`${side} text-[#c5d6e3] hover:bg-white/10`}><IdCard className="h-[18px] w-[18px] shrink-0 text-teal-400" strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">Individual Sign In</span></a>
      </nav>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-sm font-semibold">CEO</div><div className="min-w-0"><p className="truncate text-sm font-semibold">Executive</p><p className="truncate text-xs text-[#9bb5c7]">AraOffice portal</p></div></div><button onClick={() => void logout()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/15"><LogOut className="h-4 w-4" />Sign out</button></div>
    </aside>
    <div className="min-h-screen lg:pl-[300px]">
      {/* Phone and tablet: a slim header and a floating tab bar at the bottom; the full menu opens from the menu button. */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md lg:hidden"><div className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex min-w-0 items-center gap-2.5"><AraLogo className="h-8 w-8 rounded-lg" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-[#18bff2]">Office CEO</p><h1 className="mt-0.5 truncate text-[15px] font-semibold leading-tight tracking-tight">{title}</h1></div></div><button className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu className="h-[18px] w-[18px]" /></button></div></header>
      <main className="p-3 pb-28 sm:p-6 sm:pb-28 lg:p-[38px]">
        {view === 'charts' ? <div className="mx-auto max-w-[1500px] space-y-5">
          <section className="ara-hero rounded-[18px] px-4 py-3 text-white sm:rounded-[30px] sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office CEO · Klinik ARA 24 Jam</p><h2 className="mt-1 text-xl font-semibold tracking-tight sm:mt-3 sm:text-3xl">Charts</h2><p className="mt-2 hidden max-w-2xl text-sm leading-6 text-[#b9cfdd] sm:mt-3 sm:block sm:text-base sm:leading-7">The people of the company, leave and attendance, incentives and pay, tax by year, and performance reviews.</p></section>
          {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          <CeoChartsPage source="ceo" onError={setError} />
        </div> : view === 'leave' || view === 'review' ? <div className="mx-auto max-w-[1500px] space-y-5">
          {view !== 'review' && <section className="ara-hero rounded-[18px] px-4 py-3 text-white sm:rounded-[30px] sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office CEO · Klinik ARA 24 Jam</p><h2 className="mt-1 text-xl font-semibold tracking-tight sm:mt-3 sm:text-3xl">{title}</h2><p className="mt-2 hidden max-w-2xl text-sm leading-6 text-[#b9cfdd] sm:mt-3 sm:block sm:text-base sm:leading-7">{DESK.find((item) => item.id === view)?.note}. The same as in your Individual Sign In.</p></section>}
          {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          {view === 'leave' && <Approvals fetcher={(query, options) => ceoCall(query.replace('action=', 'action=ceo_'), options?.body ? JSON.parse(String(options.body)) : undefined)} />}
          {view === 'review' && <ReviewRoom embedded onSignedOut={() => undefined} api={(query, body) => ceoCall(query.replace('action=', 'action=ceo_review_'), body)} />}
        </div> : view !== 'home' ? <Suspense fallback={<p role="status" className="p-4 text-sm text-slate-500">Opening the office…</p>}><div className="max-sm:[zoom:0.84]">{view === 'clinical' ? <OfficeClinical key="clinical" embedded /> : view === 'ca' ? <OfficePortal key="ca" embedded /> : view === 'coo' ? <OfficeCOO key="coo" embedded /> : view === 'hr' ? <OfficeHR key="hr" embedded /> : <OfficeQuality key="quality" embedded />}</div></Suspense> :
        <div className="mx-auto max-w-[1500px] space-y-5">
          <section className="ara-hero rounded-[18px] px-4 py-3.5 text-white sm:rounded-[30px] sm:px-10 sm:py-9 lg:px-12">
            <div className="flex flex-col gap-4 sm:gap-7 md:flex-row md:items-start md:justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Klinik ARA 24 Jam · Chief Executive</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] sm:mt-3 sm:text-[2.45rem]">Welcome, Dr Asyraf</h2><p className="mt-2 hidden text-sm text-[#bed2df] sm:mt-3 sm:block sm:text-base">Every room is on the left. Your calendar and the team at a glance are below.</p></div>
              <div className="text-left md:text-right"><span className="inline-flex rounded-full bg-white/12 px-4 py-2 text-xs font-semibold text-[#d9e7ef] sm:px-5 sm:py-2.5 sm:text-sm">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })}</span><p className="mt-2 text-[11px] italic leading-4 text-[#a9c1d0] sm:mt-4 sm:text-sm sm:leading-6 md:ml-auto md:max-w-[420px]">“Verily, Allah loves that when anyone of you does a job, he does it with professional excellence (itqan / thoroughly, with utmost dedication and quality).” <span className="not-italic">(Narrated by Al-Baihaqi)</span></p></div>
            </div>
          </section>
          {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          <div className="space-y-6"><WaitingForYou waiting={waiting} onOpen={navigate} /><Headcount onError={setError} /><div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]"><COOCalendar scope="ceo" stacked /><CeoTasks onError={setError} /></div></div>
        </div>}
      </main>
      <nav aria-label="Main" className="fixed inset-x-4 bottom-4 z-40 flex select-none justify-around rounded-2xl border border-slate-100 bg-white/95 px-2 py-2 shadow-[0_8px_30px_rgba(15,23,42,0.16)] backdrop-blur-md lg:hidden">
        {([['home', 'Home', Home], ['coo', 'COO', UsersRound], ['hr', 'HR', ShieldCheck], ['clinical', 'Clinical', ClipboardList], ['ca', 'CA', GraduationCap]] as const).map(([id, label, Icon]) => { const current = view === id; return <button key={id} type="button" onClick={() => navigate(id)} aria-current={current ? 'page' : undefined} className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1 outline-none transition ${current ? 'scale-105 font-bold text-[#007AFF]' : 'text-slate-400'}`}><Icon className="h-[21px] w-[21px]" strokeWidth={current ? 2.2 : 1.8} /><span className="max-w-[72px] truncate text-[9.5px] leading-tight">{label}</span></button>; })}
        <a href="#office/individual" className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-slate-400 outline-none"><IdCard className="h-[21px] w-[21px]" strokeWidth={1.8} /><span className="max-w-[72px] truncate text-[9.5px] leading-tight">Individual</span></a>
      </nav>
    </div>
  </div>;
}
