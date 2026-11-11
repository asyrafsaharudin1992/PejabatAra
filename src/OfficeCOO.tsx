import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, ClipboardList, GraduationCap, HeartPulse, Home, LogOut, Menu, UsersRound, X } from 'lucide-react';
import { CareReviewPage } from './CareReviewUI';
import { officeFetch } from './lib/officeApi';
import { signOutSupabase } from './lib/supabase';
import { card } from './AssessmentStaff';

// Office COO: the COO leads Clinical Admin and the Clinical Assistants. Read only: how the team looks today (who is in, late, on leave) and
// the team's leave. HR still decides leave, OT and pay.
type View = 'home' | 'leave' | 'care';
type Row = { id: string; company: string; code: string; name: string; designation: string; group: string; branch: string; shift: string; startTime: string; endTime: string; inTime: string; outTime: string; late: number; lateCounted: number; status: string; creditHours?: number };
type Leave = { id: string; name: string; code: string; group: string; type: string; start: string; end: string; halfDay: boolean; days: number; status: string; reason: string };
const API = '/api/status?resource=coo';
const NAV: { id: View; label: string; note: string; icon: typeof Home }[] = [{ id: 'home', label: 'Team today', note: 'Who is in, late or on leave', icon: UsersRound }, { id: 'leave', label: 'Team leave', note: 'Waiting and coming up', icon: CalendarCheck }, { id: 'care', label: 'AraCare reviews', note: 'Check the KPIs of the allowance', icon: HeartPulse }];
// The two offices the COO leads. Each opens with its own menu, exactly as Clinical Admin and the Clinical Assistants see it.
const OFFICES: { href: string; label: string; note: string; icon: typeof Home }[] = [{ href: '#office/clinical', label: 'Clinical Admin office', note: 'Daily checklist, orders, vaccine bookings', icon: ClipboardList }, { href: '#office/ca', label: 'CA office', note: 'Training, panel guides, references', icon: GraduationCap }];
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

function TeamToday({ onError }: { onError: (message: string) => void }) {
  const [date, setDate] = useState('');
  const [today, setToday] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [group, setGroup] = useState('');
  const [branch, setBranch] = useState('');
  const [showOff, setShowOff] = useState(false);
  useEffect(() => {
    let live = true; setRows(null);
    call(`action=team${date ? `&date=${date}` : ''}`).then((result) => { if (!live) return; setRows(result.rows); setToday(result.today); if (!date) setDate(result.date); }).catch((cause: Error) => { if (live) { setRows([]); onError(cause.message); } });
    return () => { live = false; };
  }, [date]);
  const branches = useMemo(() => [...new Set((rows || []).map((row) => row.branch).filter(Boolean))].sort(), [rows]);
  const shown = (rows || []).filter((row) => (!group || row.group === group) && (!branch || row.branch === branch) && row.status !== 'no-record');
  const expected = shown.filter((row) => !['off', 'extra', 'no-times', 'post-call'].includes(row.status));
  const count = (...statuses: string[]) => expected.filter((row) => statuses.includes(row.status)).length;
  const chips: [string, number, string][] = [['Team', shown.length, 'text-slate-700'], ['Expected', expected.length, 'text-slate-700'], ['In', count('present', 'working', 'missing-out'), 'text-emerald-700'], ['Not in yet', count('not-in', 'upcoming'), 'text-amber-700'], ['Absent', count('absent'), 'text-rose-700'], ['Leave', count('leave'), 'text-violet-700'], ['Late', expected.filter((row) => row.lateCounted > 0).length, 'text-amber-700']];
  const list = shown.filter((row) => showOff || row.status !== 'off');
  return <div className="space-y-4">
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <button onClick={() => date && setDate(addDay(date, -1))} aria-label="Previous day" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white"><ChevronLeft className="h-4 w-4" /></button>
      <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label="Date" className={field} />
      <button onClick={() => date && setDate(addDay(date, 1))} aria-label="Next day" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white"><ChevronRight className="h-4 w-4" /></button>
      {today && date !== today && <button onClick={() => setDate(today)} className="text-sm font-semibold text-[#0b587b]">Today</button>}
      <select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Group" className={`${field} ml-auto`}><option value="">Clinical Admin and Assistants</option><option value="Clinical Admin">Clinical Admin</option><option value="Clinical Assistant">Clinical Assistants</option></select>
      <select value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="Branch" className={field}><option value="">All branches</option>{branches.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showOff} onChange={(event) => setShowOff(event.target.checked)} />Show off days</label>
    </section>
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">{chips.map(([label, value, tone]) => <div key={label} className={`${card} !p-4 text-center`}><p className={`text-2xl font-semibold ${tone}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>)}</div>
    <section className={`${card} overflow-x-auto`}>
      {!rows ? <p className="text-sm text-slate-500">Loading…</p> : !list.length ? <p className="text-sm text-slate-500">Nobody to show for this day.</p> : <table className="w-full min-w-[720px] text-sm">
        <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Shift</th><th className="pr-3">In</th><th className="pr-3">Out</th><th className="pr-3">Late</th><th>Status</th></tr></thead>
        <tbody>{list.map((row) => <tr key={row.id} className="border-t border-slate-100">
          <td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.group} · {row.branch || row.company} · {row.code}</p></td>
          <td className="pr-3"><span className="font-mono text-xs font-bold text-[#0b587b]">{row.shift || '—'}</span> <span className="text-xs text-slate-500">{row.startTime && `${row.startTime}–${row.endTime}`}</span></td>
          <td className="pr-3 font-medium">{row.inTime || '—'}</td><td className="pr-3 font-medium">{row.outTime || '—'}</td>
          <td className="pr-3">{row.lateCounted > 0 ? <span className="font-semibold text-amber-700">{row.lateCounted} min</span> : '—'}</td>
          <td>{badge(row.status)}</td>
        </tr>)}</tbody>
      </table>}
    </section>
  </div>;
}

function TeamLeave({ onError }: { onError: (message: string) => void }) {
  const [rows, setRows] = useState<Leave[] | null>(null);
  const [today, setToday] = useState('');
  useEffect(() => { call('action=leave').then((result) => { setRows(result.leave); setToday(result.today); }).catch((cause: Error) => { setRows([]); onError(cause.message); }); }, []);
  const waiting = (rows || []).filter((row) => row.status === 'pending' || row.status === 'supervisor_approved');
  const coming = (rows || []).filter((row) => row.status === 'approved');
  const table = (list: Leave[], empty: string) => !list.length ? <p className="text-sm text-slate-500">{empty}</p> : <table className="w-full min-w-[640px] text-sm">
    <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Leave</th><th className="pr-3">From</th><th className="pr-3">To</th><th className="pr-3 text-right">Days</th><th>Status</th></tr></thead>
    <tbody>{list.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.group} · {row.code}</p></td><td className="pr-3">{row.type}{row.halfDay && <span className="ml-1 text-xs text-slate-400">(half day)</span>}</td><td className="pr-3 whitespace-nowrap">{dayName(row.start)}</td><td className="pr-3 whitespace-nowrap">{dayName(row.end)}</td><td className="pr-3 text-right tabular-nums">{row.days}</td><td>{row.status === 'approved' ? (row.start <= today && row.end >= today ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">On leave now</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Approved</span>) : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">{row.status === 'pending' ? 'Waiting for supervisor' : 'Waiting for HR'}</span>}</td></tr>)}</tbody>
  </table>;
  return <div className="space-y-4">
    <section className={`${card} overflow-x-auto`}><h3 className="mb-3 font-semibold">Waiting for approval {rows && <span className="ml-1 text-sm font-normal text-slate-400">({waiting.length})</span>}</h3>{!rows ? <p className="text-sm text-slate-500">Loading…</p> : table(waiting, 'Nothing is waiting.')}</section>
    <section className={`${card} overflow-x-auto`}><h3 className="mb-3 font-semibold">Approved, on leave now or coming up {rows && <span className="ml-1 text-sm font-normal text-slate-400">({coming.length})</span>}</h3>{!rows ? null : table(coming, 'No approved leave coming up.')}</section>
  </div>;
}

export default function OfficeCOO() {
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const navigate = (next: View) => { setView(next); setMenuOpen(false); setError(''); window.scrollTo({ top: 0 }); };
  const logout = async () => { await signOutSupabase(); localStorage.removeItem('ara_portal_session'); localStorage.removeItem('araoffice_user'); localStorage.removeItem('ara_view_mode'); window.location.hash = ''; };
  const title = NAV.find((item) => item.id === view)?.label || '';
  return <div className="min-h-screen bg-[#f7f8fb] text-[#14233b]">
    {menuOpen && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col overflow-y-auto border-r border-white/5 bg-[#1b3150] p-6 text-white transition-transform duration-300 lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2 py-3"><div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/20 bg-white/10 text-[#70d8fa]"><UsersRound className="h-6 w-6" /></div><div><p className="text-[15px] font-bold tracking-wide">ARAOFFICE</p><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Chief Operating</p></div></div><button onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button></div>
      <div className="mx-1 mt-5 h-px bg-white/10" />
      <nav className="mt-6 flex-1 space-y-1">
        <p className="px-3.5 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f9bb0]">My team</p>
        {NAV.map((item) => <button key={item.id} onClick={() => navigate(item.id)} className={`flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold transition ${view === item.id ? 'bg-white text-[#14233b]' : 'text-[#c5d6e3] hover:bg-white/10'}`}><item.icon className="h-[18px] w-[18px] shrink-0 text-[#20c7f4]" strokeWidth={1.8} /><span className="min-w-0 text-left">{item.label}</span></button>)}
        <p className="px-3.5 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f9bb0]">Offices I lead</p>
        {OFFICES.map((item) => <a key={item.href} href={item.href} className="flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-semibold text-[#c5d6e3] transition hover:bg-white/10"><item.icon className="h-[18px] w-[18px] shrink-0 text-[#ffd166]" strokeWidth={1.8} /><span className="min-w-0 flex-1 text-left">{item.label}</span><ChevronRight className="h-4 w-4 opacity-45" /></a>)}
      </nav>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-sm font-semibold">COO</div><div className="min-w-0"><p className="truncate text-sm font-semibold">Operations</p><p className="truncate text-xs text-[#9bb5c7]">AraOffice portal</p></div></div><button onClick={() => void logout()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/15"><LogOut className="h-4 w-4" />Sign out</button></div>
    </aside>
    <div className="min-h-screen lg:pl-[300px]">
      <header className="sticky top-0 z-30 border-b border-[#dce4ed] bg-[#f7f8fb]/90 backdrop-blur-2xl lg:hidden"><div className="flex h-[76px] items-center gap-4 px-4 sm:px-6"><button className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce4ed] bg-white" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#18bff2]">Office COO</p><h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1></div></div></header>
      <main className="p-4 sm:p-6 lg:p-[38px]">
        <div className="mx-auto max-w-[1500px] space-y-5">
          <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office COO · Klinik ARA 24 Jam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">{view === 'home' ? 'Your team: Clinical Admin and the Clinical Assistants of both branches. Who is in, late or on leave, day by day.' : view === 'leave' ? 'Leave of your team: what is waiting for approval and what is coming up. HR keeps the final decision.' : 'The AraCare Care Coordination Allowance claims: check the KPIs and say if the allowance is payable.'}</p></section>
          {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          {view === 'home' && <TeamToday onError={setError} />}
          {view === 'leave' && <TeamLeave onError={setError} />}
          {view === 'care' && <CareReviewPage load={() => call('action=care')} review={(payload) => call('action=care_review', payload)} onError={setError} />}
        </div>
      </main>
    </div>
  </div>;
}
