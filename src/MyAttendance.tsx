import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, LogIn, LogOut, MapPin } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';

// My attendance inside Individual Sign In: one button to clock in or out (checked against the clinic location and
// this person's own phone), today's shift, the month so far, and a request to correct a forgotten clock. A supervisor
// sees the requests waiting for them here.
type Day = { date: string; code: string; startTime: string; endTime: string; inTime: string; outTime: string; status: string; late: number; lateCounted: number; worked: number; otCounted: number; otStatus: string; leave: string };
type State = { today: string; name: string; mode: 'places' | 'anywhere'; places: { name: string }[]; nextKind: 'in' | 'out'; recent: { kind: 'in' | 'out'; at: string }[]; shift: Day; yesterday: Day; deviceRegistered: boolean; required: 'full' | 'in_only' | 'none' };
type Req = { id: string; name: string; date: string; inTime: string; outTime: string; reason: string; status: 'pending' | 'approved' | 'rejected'; note: string };

const DEVICE_KEY = 'ara_clock_device';
// One random id per phone (browser); HR resets it if the person changes phones.
const deviceId = () => { try { let id = localStorage.getItem(DEVICE_KEY); if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); } return id; } catch { return 'no-storage-' + Math.random().toString(36).slice(2) + Date.now(); } };
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });
const monthOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (month: string, by: number) => { const [year, number] = month.split('-').map(Number); return monthOf(new Date(year, number - 1 + by, 1)); };
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const addDay = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
const STATUS: Record<string, [string, string]> = { present: ['Present', 'bg-emerald-50 text-emerald-700'], working: ['Working', 'bg-sky-50 text-sky-700'], absent: ['Absent', 'bg-rose-50 text-rose-700'], 'not-in': ['Not in yet', 'bg-amber-50 text-amber-700'], leave: ['Leave', 'bg-violet-50 text-violet-700'], 'missing-out': ['No clock out', 'bg-amber-50 text-amber-700'], extra: ['Clocked on a day off', 'bg-slate-100 text-slate-500'], off: ['Off', 'bg-slate-100 text-slate-400'], upcoming: ['Upcoming', 'bg-slate-100 text-slate-500'], 'no-times': ['Shift not set', 'bg-slate-100 text-slate-400'], exempt: ['No clock needed', 'bg-slate-100 text-slate-500'] };
const badge = (status: string) => { const [label, tone] = STATUS[status] || [status, 'bg-slate-100 text-slate-500']; return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{label}</span>; };
const card = 'rounded-[22px] border border-black/[0.045] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.025)] sm:p-6';
const field = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';
const reqStatus = (request: Req) => request.status === 'pending' ? 'bg-amber-50 text-amber-700' : request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500';

function position(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((result) => resolve({ lat: result.coords.latitude, lng: result.coords.longitude, accuracy: result.coords.accuracy }), (failure) => failure.code === 1 ? reject(new Error('Location is turned off for this page. Allow location in your phone settings, then try again.')) : resolve(null), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

export default function MyAttendance() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [days, setDays] = useState<Day[] | null>(null);
  const [mine, setMine] = useState<Req[]>([]);
  const [waiting, setWaiting] = useState<Req[]>([]);
  const [form, setForm] = useState<{ date: string; inTime: string; outTime: string; reason: string } | null>(null);
  const loadState = () => assessmentFetch('action=attendance_today').then((result: State) => setState(result)).catch((cause: Error) => setError(cause.message));
  const loadDays = () => { setDays(null); assessmentFetch(`action=attendance_history&month=${month}`).then((result: { days: Day[] }) => setDays(result.days)).catch(() => setDays([])); };
  const loadRequests = () => { assessmentFetch('action=attendance_requests').then((result: { requests: Req[] }) => setMine(result.requests)).catch(() => setMine([])); assessmentFetch('action=attendance_request_approvals').then((result: { requests: Req[] }) => setWaiting(result.requests)).catch(() => setWaiting([])); };
  useEffect(() => { void loadState(); loadRequests(); }, []);
  useEffect(loadDays, [month]);

  const clock = async () => {
    if (!state) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const place = await position();
      const result = await assessmentFetch('action=attendance_clock', { method: 'POST', body: JSON.stringify({ deviceId: deviceId(), lat: place?.lat ?? null, lng: place?.lng ?? null, accuracy: place?.accuracy ?? null }) });
      setState(result);
      setMessage(`Clocked ${result.kind === 'in' ? 'in' : 'out'} at ${timeOf(new Date().toISOString())}.`);
      loadDays();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to clock.'); } finally { setBusy(false); }
  };
  const send = async () => {
    if (!form) return;
    setBusy(true); setError(''); setMessage('');
    try { await assessmentFetch('action=attendance_request_create', { method: 'POST', body: JSON.stringify({ date: form.date, inTime: form.inTime, outTime: form.outTime, reason: form.reason }) }); setForm(null); setMessage('Your request was sent. Your supervisor or HR will approve it.'); loadRequests(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send the request.'); } finally { setBusy(false); }
  };
  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setBusy(true); setError('');
    try { await assessmentFetch('action=attendance_request_decide', { method: 'POST', body: JSON.stringify({ id, decision }) }); loadRequests(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); }
  };

  if (!state) return error ? <p className="rounded-2xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">{error}</p> : <p className="text-sm text-slate-500">Loading…</p>;
  const shift = state.shift; const hasShift = !!shift.startTime;
  const next = state.nextKind;
  const dates = Array.from({ length: 15 }, (_, index) => addDay(state.today, -index));
  return <div className="space-y-4">
    <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-b from-[#0f5478] via-[#0b3d59] to-[#082c42] p-5 text-white shadow-[0_18px_40px_rgba(11,48,70,0.25)] sm:p-7">
      <i className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10" />
      <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Today · {dayName(state.today)}</p>
      <p className="relative mt-2 text-xl font-semibold tracking-tight">{hasShift ? `${shift.code} · ${shift.startTime} – ${shift.endTime}` : shift.leave ? `On leave (${shift.leave})` : 'No shift today'}</p>
      {state.recent.length > 0 && <p className="relative mt-1 text-sm text-white/75">Last clock: {state.recent[0].kind === 'in' ? 'in' : 'out'} at {timeOf(state.recent[0].at)}</p>}
      {state.required === 'none' ? <p className="relative mt-5 rounded-2xl bg-white/10 p-4 text-sm leading-6 text-white/85">You do not need to clock. Your working days count automatically.</p> : <button onClick={() => void clock()} disabled={busy} className={`relative mt-5 flex h-16 w-full items-center justify-center gap-3 rounded-2xl text-lg font-semibold shadow-lg transition disabled:opacity-60 ${next === 'in' ? 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300' : 'bg-amber-300 text-amber-950 hover:bg-amber-200'}`}>{next === 'in' ? <LogIn className="h-6 w-6" /> : <LogOut className="h-6 w-6" />}{busy ? 'Please wait…' : next === 'in' ? 'Clock in' : 'Clock out'}</button>}
      <p className="relative mt-3 flex items-start gap-2 text-xs leading-5 text-white/70"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{state.mode === 'anywhere' ? 'You can clock from anywhere. Your location is still recorded.' : state.places.length ? `You can clock at: ${state.places.map((place) => place.name).join(', ')}.` : 'No clock place is set for you yet. Ask HR.'}</p>
    </section>
    {message && <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{message}</p>}
    {error && <p className="rounded-2xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">{error}</p>}
    {state.yesterday.status === 'missing-out' && <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">You did not clock out on {dayName(state.yesterday.date)}. Send a request below so it can be corrected.</p>}

    {waiting.length > 0 && <section className={`${card} space-y-3`}>
      <h3 className="font-semibold">Waiting for your approval</h3>
      <ul className="divide-y divide-slate-100">{waiting.map((request) => <li key={request.id} className="py-3 text-sm">
        <p className="font-semibold">{request.name}</p><p className="text-xs text-slate-500">{dayName(request.date)} · {request.inTime && `in ${request.inTime}`}{request.inTime && request.outTime && ' · '}{request.outTime && `out ${request.outTime}`}</p><p className="mt-0.5 text-xs text-slate-400">{request.reason}</p>
        <div className="mt-2 flex gap-2"><button onClick={() => void decide(request.id, 'approved')} disabled={busy} className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white disabled:opacity-60">Approve</button><button onClick={() => void decide(request.id, 'rejected')} disabled={busy} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 disabled:opacity-60">Reject</button></div>
      </li>)}</ul>
    </section>}

    <section className={`${card} space-y-3`}>
      <div className="flex items-center gap-3"><h3 className="flex-1 font-semibold">Forgot to clock?</h3>{!form && <button onClick={() => setForm({ date: addDay(state.today, -1), inTime: '', outTime: '', reason: 'Forgot to clock out' })} className="text-sm font-semibold text-[#0b587b]">Send a request</button>}</div>
      {form && <div className="space-y-3">
        <label className="block text-sm"><span className="mb-1 block text-slate-500">Date</span><select value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={field}>{dates.map((date) => <option key={date} value={date}>{dayName(date)}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label className="block text-sm"><span className="mb-1 block text-slate-500">Time in</span><input type="time" value={form.inTime} onChange={(event) => setForm({ ...form, inTime: event.target.value })} className={field} /></label><label className="block text-sm"><span className="mb-1 block text-slate-500">Time out</span><input type="time" value={form.outTime} onChange={(event) => setForm({ ...form, outTime: event.target.value })} className={field} /></label></div>
        <label className="block text-sm"><span className="mb-1 block text-slate-500">Reason</span><input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} maxLength={300} className={field} /></label>
        <p className="text-xs text-slate-400">Fill only the time you missed. Your supervisor or HR must approve it.</p>
        <div className="flex gap-2"><button onClick={() => void send()} disabled={busy} className="h-11 rounded-xl bg-[#0b587b] px-5 text-sm font-semibold text-white disabled:opacity-60">Send request</button><button onClick={() => setForm(null)} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600">Cancel</button></div>
      </div>}
      {mine.length > 0 && <ul className="divide-y divide-slate-100">{mine.slice(0, 5).map((request) => <li key={request.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm"><span className="flex-1 text-slate-600">{dayName(request.date)} · {request.inTime && `in ${request.inTime}`}{request.inTime && request.outTime && ' · '}{request.outTime && `out ${request.outTime}`}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${reqStatus(request)}`}>{request.status === 'pending' ? 'Waiting' : request.status === 'approved' ? 'Approved' : 'Rejected'}</span></li>)}</ul>}
    </section>

    <section className={card}>
      <div className="flex items-center gap-3">
        <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"><ChevronLeft className="h-4 w-4" /></button>
        <h3 className="min-w-[150px] text-center font-semibold">{monthName(month)}</h3>
        <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"><ChevronRight className="h-4 w-4" /></button>
      </div>
      {!days ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : <ul className="mt-3 divide-y divide-slate-100">
        {days.filter((day) => !['off', 'upcoming'].includes(day.status) || day.date === state.today).map((day) => <li key={day.date} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
          <span className="w-24 shrink-0 font-medium">{dayName(day.date)}</span>
          <span className="w-14 shrink-0 font-mono text-xs font-bold text-[#0b587b]">{day.code || '—'}</span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-slate-600"><Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-300" />{day.inTime || '—'} → {day.outTime || '—'}{day.worked > 0 && <span className="text-slate-400"> · {hours(day.worked)}</span>}</span>
          {day.lateCounted > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Late {day.lateCounted} min</span>}
          {badge(day.status)}
        </li>)}
        {!days.some((day) => !['off', 'upcoming'].includes(day.status)) && <li className="py-3 text-sm text-slate-500">Nothing recorded for {monthName(month)} yet.</li>}
      </ul>}
    </section>
    <p className="px-1 text-xs leading-5 text-slate-400">Clock in and out on your own phone, at your clinic. If you change phones, ask HR to reset it. Arriving within the grace period is not late. If you forget to clock, send a request above.</p>
  </div>;
}
