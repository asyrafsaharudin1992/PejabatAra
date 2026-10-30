import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, LogIn, LogOut, MapPin } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';
import { ClockLocationError, requestClockLocation } from './lib/clockLocation';

// My attendance inside Individual Sign In: one button to clock in or out at a permitted workplace,
// today's shift, the month so far, and a request to correct a forgotten clock. A supervisor
// sees the requests waiting for them here.
type Day = { date: string; code: string; startTime: string; endTime: string; inTime: string; outTime: string; status: string; late: number; lateCounted: number; worked: number; otCounted: number; otStatus: string; leave: string };
type State = { today: string; name: string; mode: 'places' | 'anywhere'; places: { name: string }[]; nextKind: 'in' | 'out'; recent: { kind: 'in' | 'out'; at: string }[]; shift: Day; yesterday: Day; required: 'full' | 'in_only' | 'none' };
type Req = { id: string; name: string; date: string; inTime: string; outTime: string; reason: string; status: 'pending' | 'approved' | 'rejected'; note: string };

const DEVICE_KEY = 'ara_clock_device';
// Anonymous browser identifier recorded with each clock for audit only; changing browsers is allowed.
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

// What to do on this person's phone when the page has been refused location (shown as a pop up).
const phoneKind = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'other';
const homeScreenApp = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
export function LocationHelp({ onClose, onRetry, kind = phoneKind(), app = homeScreenApp() }: { onClose: () => void; onRetry: () => void; kind?: 'ios' | 'android' | 'other'; app?: boolean }) {
  const pill = (text: string) => <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{text}</span>;
  const steps = kind === 'ios' ? (app
    ? [<>Open the <strong>Settings</strong> app on your iPhone.</>, <>Go to {pill('Privacy & Security')} &gt; {pill('Location Services')} and make sure it is <strong>on</strong>.</>, <>Scroll down to {pill('Safari Websites')} (or {pill('AraOffice')}) and choose {pill('While Using the App')}.</>, <>If it still does not ask, open the AraOffice link in <strong>Safari</strong> instead of the home screen icon.</>]
    : [<>Tap the {pill('Page Menu / aA')} button on the left of the web address (the address bar at the top or bottom of Safari).</>, <>Tap {pill('Website Settings')}.</>, <>Tap {pill('Location')} and choose {pill('Allow')}.</>, <>If it is still off: {pill('Settings')} &gt; {pill('Privacy & Security')} &gt; {pill('Location Services')} (on) &gt; {pill('Safari Websites')} &gt; {pill('While Using the App')}.</>])
    : kind === 'android' ? (app
    ? [<>Press and hold the <strong>AraOffice</strong> icon, then tap {pill('App info')}.</>, <>Tap {pill('Permissions')} &gt; {pill('Location')} and choose {pill('Allow only while using the app')}.</>, <>Make sure <strong>Location</strong> is on in the phone's quick settings.</>]
    : [<>Tap the {pill('lock')} (or settings) icon beside the web address.</>, <>Tap {pill('Permissions')} &gt; {pill('Location')} and choose {pill('Allow')}.</>, <>Make sure <strong>Location</strong> is on in the phone's quick settings.</>])
    : [<>Click the {pill('lock')} icon on the left of the address bar.</>, <>Open {pill('Site settings')} &gt; {pill('Location')} and choose {pill('Allow')}.</>];
  return <div role="dialog" aria-modal="true" aria-labelledby="location-help-title" className="fixed inset-0 z-50 grid place-items-end bg-slate-950/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-6">
    <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl sm:rounded-[28px]">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600"><MapPin className="h-6 w-6" /></span>
      <h2 id="location-help-title" className="mt-4 text-xl font-semibold tracking-tight text-[#0b2a4a]">Turn on your location</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">To clock in or out, AraOffice needs to confirm you are at your assigned workplace. Your browser or phone is blocking location access. Allow location for the AraOffice website, then tap Try again.</p>
      <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">{steps.map((step, index) => <li key={index} className="flex gap-3"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#e8f1fd] text-xs font-bold text-[#1f6feb]">{index + 1}</span><span>{step}</span></li>)}</ol>
      <div className="mt-6 flex gap-3"><button onClick={onRetry} className="h-12 flex-1 rounded-2xl bg-[#1f6feb] text-sm font-semibold text-white">Try again</button><button onClick={onClose} className="h-12 rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-600">Close</button></div>
    </div>
  </div>;
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
  const [blocked, setBlocked] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tip, setTip] = useState(false);
  const locationCheck = useRef<AbortController | null>(null);
  const [locating, setLocating] = useState(false);
  useEffect(() => () => locationCheck.current?.abort(), []);
  const loadState = () => assessmentFetch('action=attendance_today').then((result: State) => setState(result)).catch((cause: Error) => setError(cause.message));
  const loadDays = () => { setDays(null); assessmentFetch(`action=attendance_history&month=${month}`).then((result: { days: Day[] }) => setDays(result.days)).catch(() => setDays([])); };
  const loadRequests = () => { assessmentFetch('action=attendance_requests').then((result: { requests: Req[] }) => setMine(result.requests)).catch(() => setMine([])); assessmentFetch('action=attendance_request_approvals').then((result: { requests: Req[] }) => setWaiting(result.requests)).catch(() => setWaiting([])); };
  useEffect(() => { void loadState(); loadRequests(); }, []);
  useEffect(loadDays, [month]);

  const clock = async () => {
    if (!state || busy) return;
    setBusy(true); setError(''); setMessage(''); setHelpOpen(false);
    const controller = new AbortController();
    locationCheck.current = controller; setLocating(true);
    try {
      const place = await requestClockLocation(state.mode === 'places', navigator.geolocation, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setLocating(false);
      setBlocked(false);
      const result = await assessmentFetch('action=attendance_clock', { method: 'POST', body: JSON.stringify({ deviceId: deviceId(), lat: place?.lat ?? null, lng: place?.lng ?? null, accuracy: place?.accuracy ?? null }) });
      setState(result);
      setMessage(`Clocked ${result.kind === 'in' ? 'in' : 'out'} at ${timeOf(new Date().toISOString())}.`);
      // On an iPhone the phone asks each time unless the website setting is Allow: say so once.
      try { if (phoneKind() === 'ios' && !homeScreenApp() && !localStorage.getItem('ara_location_tip')) setTip(true); } catch { /* storage not available */ }
      loadDays();
    } catch (cause) {
      if (controller.signal.aborted) return;
      const text = cause instanceof Error ? cause.message : 'Unable to clock.';
      if (cause instanceof ClockLocationError && cause.reason === 'denied') { setBlocked(true); setHelpOpen(true); }
      setError(text);
    } finally { if (locationCheck.current === controller) locationCheck.current = null; setLocating(false); setBusy(false); }
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
      {state.required === 'none' ? <p className="relative mt-5 rounded-2xl bg-white/10 p-4 text-sm leading-6 text-white/85">You do not need to clock. Your working days count automatically.</p> : <button onClick={() => void clock()} disabled={busy} className={`relative mt-5 flex h-16 w-full items-center justify-center gap-3 rounded-2xl text-lg font-semibold shadow-lg transition disabled:opacity-60 ${next === 'in' ? 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300' : 'bg-amber-300 text-amber-950 hover:bg-amber-200'}`}>{next === 'in' ? <LogIn className="h-6 w-6" /> : <LogOut className="h-6 w-6" />}{busy ? locating ? 'Checking GPS…' : 'Saving…' : next === 'in' ? 'Clock in' : 'Clock out'}</button>}
      <p className="relative mt-3 flex items-start gap-2 text-xs leading-5 text-white/70"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{state.mode === 'anywhere' ? 'You can clock from anywhere. Your location is still recorded.' : state.places.length ? `You can clock at: ${state.places.map((place) => place.name).join(', ')}.` : 'No clock place is set for you yet. Ask HR.'}</p>
    </section>
    {helpOpen && blocked && state.mode === 'places' && state.required !== 'none' && <LocationHelp onClose={() => setHelpOpen(false)} onRetry={() => { setHelpOpen(false); void clock(); }} />}
    {message && <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{message}</p>}
    {tip && <section className="rounded-2xl bg-[#eef5ff] p-4 text-sm leading-6 text-[#0b2a4a]"><p className="font-semibold">So your iPhone does not ask every time</p><p className="mt-1">Tap <strong>aA</strong> on the left of the web address, then <strong>Website Settings</strong>, <strong>Location</strong> and choose <strong>Allow</strong>. You only need to do this once.</p><button onClick={() => { try { localStorage.setItem('ara_location_tip', '1'); } catch { /* storage not available */ } setTip(false); }} className="mt-2 text-sm font-semibold text-[#1f6feb]">Got it</button></section>}
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
    <p className="px-1 text-xs leading-5 text-slate-400">Clock in and out using any browser, at your assigned workplace. Keep your sign-in details private. Arriving within the grace period is not late. If you forget to clock, send a request above.</p>
  </div>;
}
