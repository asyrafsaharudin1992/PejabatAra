import { isMissedClock, MISSED_REASONS, missedClockDates, OT_REASONS, unclaimedOtDays } from './lib/attendanceRequests';
import { useEffect, useRef, useState } from 'react';
import { OtPolicy } from './OtPolicy';
import { newCode } from './lib/shiftCodes';
import { ChevronLeft, ChevronRight, Clock3, LogIn, LogOut, MapPin } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';
import { ClockLocationError, requestClockLocation } from './lib/clockLocation';

// My attendance inside Individual Sign In: one button to clock in or out at a permitted workplace,
// today's shift, the month so far, and a request to correct a forgotten clock. A supervisor
// sees the requests waiting for them here.
type Day = { date: string; code: string; startTime: string; endTime: string; inTime: string; outTime: string; status: string; late: number; lateCounted: number; worked: number; otCounted: number; otStatus: string; leave: string };
type State = { today: string; name: string; mode: 'places' | 'anywhere'; places: { name: string }[]; nextKind: 'in' | 'out'; recent: { kind: 'in' | 'out'; at: string }[]; creditMinutes?: number; creditBasis?: { kind: 'late' | 'early'; date: string; at: string } | null; shift: Day; yesterday: Day; required: 'full' | 'in_only' | 'none' };
type Req = { id: string; name: string; date: string; inTime: string; outTime: string; otMinutes: number; otText: string; reason: string; remarks: string; otPreview?: string; status: 'draft' | 'pending' | 'supervisor_approved' | 'approved' | 'rejected' | 'cancelled'; note: string; supervisorNote: string; stage?: 'supervisor' | 'hr' };
const REQ_LABEL: Record<string, string> = { draft: 'Draft', pending: 'Waiting for supervisor', supervisor_approved: 'Waiting for HR', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };

const reqDetail = (request: Req) => [request.inTime && `in ${request.inTime}`, request.outTime && `out ${request.outTime}`, request.otMinutes > 0 && `OT ${Math.floor(request.otMinutes / 60)} h ${request.otMinutes % 60} m`].filter(Boolean).join(' · ');

const DEVICE_KEY = 'ara_clock_device';
// Anonymous browser identifier recorded with each clock for audit only; changing browsers is allowed.
const deviceId = () => { try { let id = localStorage.getItem(DEVICE_KEY); if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); } return id; } catch { return 'no-storage-' + Math.random().toString(36).slice(2) + Date.now(); } };
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });
const monthOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (month: string, by: number) => { const [year, number] = month.split('-').map(Number); return monthOf(new Date(year, number - 1 + by, 1)); };
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const addDay = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
// "You were supposed to work AM-6 09:00–18:00, but you worked 07:49–18:28": the shift the roster says, and the real clocks of the day.
const workedText = (day: { code: string; startTime: string; endTime: string; inTime: string; outTime: string } | undefined, you = true) => {
  const supposed = day && day.code ? `${you ? 'You were supposed to work' : 'Supposed to work'} ${newCode(day.code)} ${day.startTime}–${day.endTime}` : `${you ? 'You had' : 'Had'} no shift`;
  const real = day && day.inTime ? `${you ? 'you' : ''} worked ${day.inTime}${day.outTime ? `–${day.outTime}` : ''}`.trim() : '';
  return real ? `${supposed}, but ${real}` : supposed;
};
const otHours = (minutes: number) => `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} m` : ''}`;
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
const STATUS: Record<string, [string, string]> = { present: ['Present', 'bg-emerald-50 text-emerald-700'], working: ['Working', 'bg-sky-50 text-sky-700'], absent: ['Absent', 'bg-rose-50 text-rose-700'], 'not-in': ['Not in yet', 'bg-amber-50 text-amber-700'], leave: ['Leave', 'bg-violet-50 text-violet-700'], 'leave-pending': ['Leave · pending approval', 'bg-amber-50 text-amber-700'], 'missing-out': ['No clock out', 'bg-amber-50 text-amber-700'], extra: ['Clocked on a day off', 'bg-slate-100 text-slate-500'], off: ['Off', 'bg-slate-100 text-slate-400'], upcoming: ['Upcoming', 'bg-slate-100 text-slate-500'], 'no-times': ['Shift not set', 'bg-slate-100 text-slate-400'], exempt: ['No clock needed', 'bg-slate-100 text-slate-500'], 'no-record': ['No record', 'bg-slate-50 text-slate-400'] };
// The leave codes as staff know them (unpaid leave is UPL).
const LEAVE_CODE: Record<string, string> = { AL: 'AL', ML: 'ML', EL: 'EL', UL: 'UPL', ULEL: 'UPL', HOSP: 'HOSP', MATN: 'MATN', MARRG: 'MARRG' };
// A day on leave says which leave it is, and whether it is approved or still waiting.
const badge = (status: string, leave = '') => {
  const [label, tone] = STATUS[status] || [status, 'bg-slate-100 text-slate-500'];
  const code = LEAVE_CODE[leave] || leave;
  const shown = status === 'leave' ? `Leave${code ? ` · ${code}` : ''} · Approved` : status === 'leave-pending' ? `Leave${code ? ` · ${code}` : ''} · Pending approval` : label;
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{shown}</span>;
};
const card = 'rounded-[22px] border border-black/[0.045] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.025)] sm:p-6';
const field = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';
const reqStatus = (request: Req) => request.status === 'pending' || request.status === 'supervisor_approved' ? 'bg-amber-50 text-amber-700' : request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500';

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

// Credit hours that can be used for the clock about to be made: the minutes late (clocking in) or early (clocking out), worked out from the shift time
// as time passes. The amount to use is 30 minutes, then whole hours up to 12, and no more than the balance.
const CREDIT_CHOICES = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
function creditNeedNow(state: State, nowMs: number) {
  const basis = state.creditBasis; if (!basis) return null;
  const minutes = Math.round((basis.kind === 'late' ? nowMs - Date.parse(basis.at) : Date.parse(basis.at) - nowMs) / 60000);
  return minutes > 0 ? { kind: basis.kind, minutes } : null;
}
function creditOptions(state: State, nowMs: number) {
  if (!creditNeedNow(state, nowMs)) return [];
  return CREDIT_CHOICES.filter((hours) => hours * 60 <= (state.creditMinutes || 0));
}

export default function MyAttendance({ mode = 'clock', isApprover = false, onApplyOt, startDate }: { key?: string; mode?: 'clock' | 'ot'; isApprover?: boolean; onApplyOt?: (date: string) => void; startDate?: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [remark, setRemark] = useState('');
  const [creditHours, setCreditHours] = useState(0);
  // The question asked when clocking in late or out early with credit hours in hand: use them, or not.
  const [ask, setAsk] = useState<null | { kind: 'late' | 'early'; minutes: number; options: number[]; pick: number; step: 'ask' | 'pick' }>(null);
  const [tickAt, setTickAt] = useState(() => Date.now()); // so the late or early minutes follow the clock while the page stays open
  useEffect(() => { const timer = setInterval(() => setTickAt(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const [confirmId, setConfirmId] = useState('');
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [days, setDays] = useState<Day[] | null>(null);
  const [monthDays, setMonthDays] = useState<Day[] | null>(null);
  const [mine, setMine] = useState<Req[]>([]);
  const [waiting, setWaiting] = useState<Req[]>([]);
  const [form, setForm] = useState<{ id?: string; date: string; inTime: string; outTime: string; otTime: string; reason: string; remarks: string } | null>(null);
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
  const loadMonthDays = () => { assessmentFetch(`action=attendance_history&month=${monthOf(new Date())}`).then((result: { days: Day[] }) => setMonthDays(result.days)).catch(() => setMonthDays(null)); };
  useEffect(loadMonthDays, []);

  // `chosen`: the hours of credit decided in the question (0 = none); without it the dropdown's choice is used.
  const clock = async (chosen?: number) => {
    if (!state || busy) return;
    setBusy(true); setError(''); setMessage(''); setHelpOpen(false);
    const controller = new AbortController();
    locationCheck.current = controller; setLocating(true);
    try {
      const place = await requestClockLocation(state.mode === 'places', navigator.geolocation, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setLocating(false);
      setBlocked(false);
      const result = await assessmentFetch('action=attendance_clock', { method: 'POST', body: JSON.stringify({ deviceId: deviceId(), lat: place?.lat ?? null, lng: place?.lng ?? null, accuracy: place?.accuracy ?? null, remarks: remark.trim(), creditHours: creditOptions(state, Date.now()).includes(chosen ?? creditHours) ? (chosen ?? creditHours) : 0 }) });
      setRemark(''); setCreditHours(0);
      setState(result);
      setMessage(`Clocked ${result.kind === 'in' ? 'in' : 'out'} at ${timeOf(new Date().toISOString())}.${result.creditNote ? ` ${result.creditNote}` : ''}`);
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
  // Clocking in late or out early while having credit hours: ask first whether to use them (unless the dropdown already has an answer).
  const startClock = () => {
    if (!state || busy) return;
    const need = creditNeedNow(state, Date.now()), options = creditOptions(state, Date.now());
    if (need && options.length && !creditHours) {
      // The smallest amount that covers the time late or early, or the most they have.
      const cover = options.find((hours) => hours * 60 >= need.minutes) ?? options[options.length - 1];
      setAsk({ kind: need.kind, minutes: need.minutes, options, pick: cover, step: 'ask' });
      return;
    }
    void clock();
  };
  const send = async (draft = false) => {
    if (!form) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await assessmentFetch(form.id ? 'action=attendance_request_update' : 'action=attendance_request_create', { method: 'POST', body: JSON.stringify({ ...form, draft }) });
      setForm(null); setMessage(draft ? 'Saved as a draft. Send it when you are ready.' : 'Your request was sent. Your supervisor approves first, then HR confirms.'); loadRequests();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send the request.'); } finally { setBusy(false); }
  };
  const cancelRequest = async (id: string) => {
    setBusy(true); setError('');
    try { await assessmentFetch('action=attendance_request_cancel', { method: 'POST', body: JSON.stringify({ id }) }); loadRequests(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to cancel.'); } finally { setBusy(false); }
  };
  // "Not OT": the extra time of that day was not overtime. The reminder goes away; Undo brings it back.
  const [dismissed, setDismissed] = useState('');
  const notOt = async (date: string, undo = false) => {
    setBusy(true); setError('');
    try { await assessmentFetch('action=attendance_ot_dismiss', { method: 'POST', body: JSON.stringify({ date, undo }) }); setDismissed(undo ? '' : date); loadMonthDays(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); }
  };
  // Apply OT: once the date is chosen, the times clocked that day and the OT hours the system counted are filled in. They can still be changed.
  const [noClock, setNoClock] = useState(false);
  const autofill = async (date: string) => {
    setNoClock(false);
    try {
      const list = ((await assessmentFetch(`action=attendance_history&date=${date}`)) as { days: Day[] }).days;
      const day = list.find((item) => item.date === date);
      const ot = day && day.otCounted > 0 ? `${String(Math.floor(day.otCounted / 60)).padStart(2, '0')}:${String(day.otCounted % 60).padStart(2, '0')}` : '';
      setForm((current) => current && current.date === date && !current.id ? { ...current, inTime: day?.inTime || '', outTime: day?.outTime || '', otTime: ot } : current);
      setNoClock(!day?.inTime);
    } catch { /* the person can still type the times */ }
  };
  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setBusy(true); setError('');
    try { await assessmentFetch('action=attendance_request_decide', { method: 'POST', body: JSON.stringify({ id, decision }) }); loadRequests(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (mode !== 'ot' || !startDate || !state) return;
    setForm({ date: startDate, inTime: '', outTime: '', otTime: '', reason: OT_REASONS[0], remarks: '' });
    void autofill(startDate);
  }, [startDate, !!state]);

  if (!state) return error ? <p className="rounded-2xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">{error}</p> : <p className="text-sm text-slate-500">Loading…</p>;
  const shift = state.shift; const hasShift = !!shift.startTime;
  const next = state.nextKind;
  const dates = Array.from({ length: Number(state.today.slice(8, 10)) }, (_, index) => addDay(state.today, -index));
  // Days this month with a clock missing (no clock in, or a clock in without a clock out), and no active request yet.
  const forgotList = monthDays ? missedClockDates(monthDays, mine, state.today).filter((day) => dates.includes(day.date)) : null;
  const forgotKind = (day: Day) => forgotList?.find((item) => item.date === day.date)?.kind || '';
  const otDays = monthDays ? unclaimedOtDays(monthDays, mine, state.today) : [];
  const forgotDates = forgotList ? forgotList.map((day) => day.date).sort().reverse() : null;
  // The request screens: OT (overtime, rest day) and Missed clock (forgot to clock in or out). A request shows under the one its reason belongs to.
  const requestSections = (kind: 'ot' | 'missed') => {
    const missed = kind === 'missed';
    const reasons = missed ? MISSED_REASONS : OT_REASONS;
    const mineHere = mine.filter((request) => isMissedClock(request.reason) === missed);
    const waitingHere = waiting.filter((request) => isMissedClock(request.reason) === missed);
    const approveBox = (waitingHere.length > 0 || isApprover) && <section className={`${card} space-y-3`}>
      <h3 className="flex flex-wrap items-center gap-2 font-semibold">{waitingHere.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white">{waitingHere.length}</span>}{missed ? 'Forgot to clock' : 'Approve OT'} <span className="text-xs font-normal text-slate-400">· {missed ? 'for your approval' : 'waiting for your approval'}</span></h3>
      {!waitingHere.length && <p className="text-sm text-slate-500">Nothing is waiting for your approval.</p>}
      <ul className="divide-y divide-slate-100">{waitingHere.map((request) => <li key={request.id} className="py-3 text-sm">
        <p className="font-semibold">{request.name}</p><p className="text-xs text-slate-500">{dayName(request.date)} · {reqDetail(request)}</p><p className="mt-0.5 text-xs text-slate-400">{request.reason}{request.remarks && ` · ${request.remarks}`}</p>
        {request.stage === 'hr' && <p className="mt-1 inline-block rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">Supervisor approved · waiting for HR</p>}
        {request.otPreview && <p className="mt-1 text-xs font-semibold text-[#0b587b]">Pay: {request.otPreview}</p>}
        {confirmId === request.id ? <div className="mt-2 rounded-xl border border-[#0b587b]/20 bg-sky-50/60 p-3"><p className="text-sm font-semibold text-slate-800">Do you want to confirm this {missed ? 'missed clock' : 'OT'}?</p><p className="mt-0.5 text-xs font-semibold text-rose-700">This is final. Payroll will use it.</p><div className="mt-2 flex gap-2"><button onClick={() => { setConfirmId(''); void decide(request.id, 'approved'); }} disabled={busy} className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white disabled:opacity-60">Yes, confirm</button><button onClick={() => setConfirmId('')} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">Cancel</button></div></div> : <div className="mt-2 flex gap-2"><button onClick={() => request.stage === 'hr' ? setConfirmId(request.id) : void decide(request.id, 'approved')} disabled={busy} className="h-10 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white disabled:opacity-60">{request.stage === 'hr' ? 'Confirm' : 'Approve'}</button><button onClick={() => void decide(request.id, 'rejected')} disabled={busy} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 disabled:opacity-60">Reject</button></div>}
      </li>)}</ul>
    </section>;
    return <>
    {!missed && approveBox}
    {!missed && dismissed && <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600"><span className="min-w-0 flex-1">{dayName(dismissed)} marked as not OT.</span><button onClick={() => void notOt(dismissed, true)} disabled={busy} className="font-semibold text-[#0b587b]">Undo</button></p>}
    {!missed && otDays.length > 0 && <section className={`${card} space-y-2`}>
      <h3 className="font-semibold">Forgot to apply OT? <span className="text-xs font-normal text-slate-400">· extra time worked, no request yet</span></h3>
      <ul className="divide-y divide-slate-100">{otDays.map((day) => <li key={day.date} className="flex items-center gap-2 py-2.5 text-sm"><span className="min-w-0 flex-1 text-slate-600"><span className="block font-medium text-slate-800">{dayName(day.date)}</span><span className="block text-xs leading-5">{workedText(monthDays?.find((item) => item.date === day.date))}.</span><b className="block text-xs text-[#b57a00]">OT {otHours(day.minutes)}</b></span><button onClick={() => { setForm({ date: day.date, inTime: '', outTime: '', otTime: '', reason: OT_REASONS[0], remarks: '' }); void autofill(day.date); setTimeout(() => document.getElementById('apply-ot-box')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0b587b]">Apply OT</button><button onClick={() => void notOt(day.date)} disabled={busy} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 disabled:opacity-60">Not OT</button></li>)}</ul>
    </section>}

    <section id={missed ? 'missed-clock-box' : 'apply-ot-box'} className={`${card} space-y-3`}>
      <div className="flex items-center gap-3"><h3 className="flex-1 font-semibold">{missed ? 'Forgot to clock?' : 'Apply OT'}</h3>{!form && missed && forgotDates && !forgotDates.length && <span className="text-xs text-slate-400">No missed clock this month</span>}{!form && !missed && !otDays.length && <span className="text-xs text-slate-400">No extra time to apply for</span>}{!form && !(missed && forgotDates && !forgotDates.length) && !(!missed && !otDays.length) && <button onClick={() => { setForm({ date: missed && forgotDates ? forgotDates[0] : otDays[0]?.date || state.today, inTime: '', outTime: '', otTime: '', reason: missed ? reasons[1] : reasons[0], remarks: '' }); if (!missed && otDays[0]) void autofill(otDays[0].date); }} className="text-sm font-semibold text-[#0b587b]">{missed ? 'Send a request' : 'New request'}</button>}</div>
      {form && <div className="space-y-3">
        <div className="block text-sm"><span className="mb-1 block text-slate-500">{missed ? 'Which day?' : 'Which day did you work OT?'}</span>
          {(() => {
            // Only the days that fit are offered (a missed clock, or extra time worked), each with the shift and the real clocks, so no date has to be typed or guessed.
            const choices = (missed ? (forgotList || []).map((item) => ({ date: item.date, tail: `forgot to clock ${item.kind}` })) : otDays.map((item) => ({ date: item.date, tail: `OT ${otHours(item.minutes)}` })));
            const list = [...(choices.some((choice) => choice.date === form.date) ? [] : [{ date: form.date, tail: '' }]), ...choices].sort((a, b) => b.date.localeCompare(a.date));
            if (!list.length) return <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{missed ? 'No missed clock this month.' : 'No extra time to apply OT for.'}</p>;
            return <div className="space-y-1.5">{list.map((choice) => { const info = monthDays?.find((item) => item.date === choice.date); const on = form.date === choice.date;
              return <button type="button" key={choice.date} disabled={Boolean(form.id) && !on} onClick={() => { setForm({ ...form, date: choice.date, ...(missed ? { inTime: info?.inTime || '', outTime: info?.outTime || '' } : {}) }); if (!missed && !form.id) void autofill(choice.date); }} className={`w-full rounded-xl border px-3 py-2 text-left text-xs leading-5 ${on ? 'border-[#0b587b] bg-sky-50 ring-1 ring-[#0b587b]/30' : 'border-slate-200 bg-white'} disabled:opacity-60`}>
                <span className="block font-semibold text-slate-800">{dayName(choice.date)}{choice.tail && <span className="font-medium text-[#b45309]"> · {choice.tail}</span>}</span>
                {info && <span className="block text-slate-500">{workedText(info)}.</span>}
              </button>; })}</div>;
          })()}
        </div>
        <div className={`grid gap-3 ${missed ? 'grid-cols-2' : 'grid-cols-3'}`}><label className="block text-sm"><span className="mb-1 block text-slate-500">Time in</span><input type="time" value={form.inTime} onChange={(event) => setForm({ ...form, inTime: event.target.value })} className={field} /></label><label className="block text-sm"><span className="mb-1 block text-slate-500">Time out</span><input type="time" value={form.outTime} onChange={(event) => setForm({ ...form, outTime: event.target.value })} className={field} /></label>{!missed && <div className="block text-sm"><span className="mb-1 block text-slate-500">OT hours</span><select aria-label="OT hours" value={form.otTime ? String(Math.floor((Number(form.otTime.slice(0, 2)) * 60 + Number(form.otTime.slice(3, 5))) / 60)) : ''} onChange={(event) => setForm({ ...form, otTime: event.target.value === '' || event.target.value === '0' ? '' : `${event.target.value.padStart(2, '0')}:00` })} className={field}><option value="">Select</option>{Array.from({ length: 24 }, (_, index) => index + 1).map((hour) => <option key={hour} value={hour}>{hour} h</option>)}</select></div>}</div>
        <label className="block text-sm"><span className="mb-1 block text-slate-500">Reason</span><select value={reasons.includes(form.reason) ? form.reason : reasons[0]} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={field}>{reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
        <label className="block text-sm"><span className="mb-1 block text-slate-500">Remarks (optional)</span><input value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} maxLength={500} className={field} /></label>
        {!missed && noClock && <p className="text-xs text-amber-700">No clock record for this day, so type the times or the OT hours yourself.</p>}
        {missed && <p className="text-xs text-slate-400">Enter the clock time you missed. Your supervisor approves first, then HR confirms.</p>}
        <div className="flex flex-wrap gap-2"><button onClick={() => void send(false)} disabled={busy} className="h-11 rounded-xl bg-[#0b587b] px-5 text-sm font-semibold text-white disabled:opacity-60">Send request</button><button onClick={() => void send(true)} disabled={busy} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[#0b587b] disabled:opacity-60">Save draft</button><button onClick={() => setForm(null)} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600">Close</button></div>
      </div>}
      {mineHere.length > 0 && <ul className="divide-y divide-slate-100">{mineHere.slice(0, 8).map((request) => <li key={request.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm"><span className="min-w-0 flex-1 text-slate-600">{dayName(request.date)} · {reqDetail(request)}{request.status === 'rejected' && (request.note || request.supervisorNote) && <span className="block text-xs text-slate-400">{request.note || request.supervisorNote}</span>}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${reqStatus(request)}`}>{REQ_LABEL[request.status] || request.status}</span>{request.status === 'draft' && <button onClick={() => setForm({ id: request.id, date: request.date, inTime: request.inTime, outTime: request.outTime, otTime: request.otMinutes > 0 ? request.otText : '', reason: request.reason, remarks: request.remarks })} className="text-xs font-semibold text-[#0b587b]">Edit</button>}{['draft', 'pending', 'supervisor_approved'].includes(request.status) && <button onClick={() => void cancelRequest(request.id)} disabled={busy} className="text-xs font-semibold text-rose-700">Cancel</button>}</li>)}</ul>}
    </section>
    {missed && approveBox}
  </>;
  };
  if (mode === 'ot') return <div className="space-y-4">{requestSections('ot')}<OtPolicy className={card} /></div>;
  return <div className="space-y-4">
    <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-b from-[#0f5478] via-[#0b3d59] to-[#082c42] p-5 text-white shadow-[0_18px_40px_rgba(11,48,70,0.25)] sm:p-7">
      <i className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10" />
      <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Today · {dayName(state.today)}</p>
      <p className="relative mt-2 text-xl font-semibold tracking-tight">{hasShift ? `${newCode(shift.code)} · ${shift.startTime} – ${shift.endTime}` : shift.leave ? `On leave (${LEAVE_CODE[shift.leave] || shift.leave})${shift.status === 'leave-pending' ? ' · pending approval' : ''}` : 'No shift today'}</p>
      {(state.creditMinutes || 0) > 0 && <p className="relative mt-1 text-sm text-white/75">Credit hours: {Math.floor((state.creditMinutes || 0) / 60)} h{(state.creditMinutes || 0) % 60 ? ` ${(state.creditMinutes || 0) % 60} min` : ''}</p>}
      {state.recent.length > 0 && <p className="relative mt-1 text-sm text-white/75">Last clock: {state.recent[0].kind === 'in' ? 'in' : 'out'} at {timeOf(state.recent[0].at)}</p>}
      {state.required === 'none' && <p className="relative mt-4 rounded-2xl bg-white/10 p-3 text-sm leading-6 text-white/85">Clocking is optional for you. Your working days count even if you do not clock.</p>}{(() => {
        const need = creditNeedNow(state, tickAt), options = creditOptions(state, tickAt);
        if (!need || !options.length) return null;
        const text = (hours: number) => hours < 1 ? `${hours * 60} minutes` : hours === 1 ? '1 hour' : `${hours} hours`;
        return <label className="relative mt-4 block rounded-2xl bg-white/10 p-3 text-sm leading-6 text-white/90"><span className="block"><strong>Use credit hours?</strong> You are {need.minutes} min {need.kind === 'late' ? 'late' : 'leaving early'}. You have {Math.floor((state.creditMinutes || 0) / 60)} h{(state.creditMinutes || 0) % 60 ? ` ${(state.creditMinutes || 0) % 60} min` : ''}. Please make sure your supervisor has been informed.</span>
          <select aria-label="Credit hours to use" value={options.includes(creditHours) ? creditHours : 0} onChange={(event) => setCreditHours(Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white"><option value={0} className="text-slate-800">Do not use credit hours</option>{options.map((hours) => <option key={hours} value={hours} className="text-slate-800">{`Use ${text(hours)}`}</option>)}</select></label>;
      })()}<input value={remark} onChange={(event) => setRemark(event.target.value)} maxLength={200} aria-label="Remark for this clock" placeholder="Remark (optional), for example working at the bank" className="relative mt-4 h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white placeholder:text-white/50 outline-none focus:border-white/50" />{/(use|guna|gunakan|kredit|credit|kreadit)\b.{0,20}(hour|hours|hr|hrs|jam)|\b(kredit|credit)\s*(hours?|jam)\b/i.test(remark) && creditHours === 0 && <p role="alert" className="relative mt-2 rounded-xl bg-amber-300/20 p-3 text-xs leading-5 text-amber-100"><strong>To use credit hours, choose "Use credit hours?" above, not the Remark.</strong> The Remark is only a note; your credit hours will not be deducted. If you do not see the choice, you are not late or leaving early, or you have no balance. <span className="mt-1 block"><strong>Untuk guna kredit jam, pilih "Use credit hours?" di atas, bukan dalam Remark.</strong> Remark hanya catatan; baki kredit jam tidak ditolak.</span></p>}<button onClick={startClock} disabled={busy} className={`relative mt-3 flex h-16 w-full items-center justify-center gap-3 rounded-2xl text-lg font-semibold shadow-lg transition disabled:opacity-60 ${next === 'in' ? 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300' : 'bg-amber-300 text-amber-950 hover:bg-amber-200'}`}>{next === 'in' ? <LogIn className="h-6 w-6" /> : <LogOut className="h-6 w-6" />}{busy ? locating ? 'Checking GPS…' : 'Saving…' : next === 'in' ? 'Clock in' : 'Clock out'}</button>
      <p className="relative mt-3 flex items-start gap-2 text-xs leading-5 text-white/70"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{state.mode === 'anywhere' ? 'You can clock from anywhere. Your location is still recorded.' : state.places.length ? `You can clock at: ${state.places.map((place) => place.name).join(', ')}.` : 'No clock place is set for you yet. Ask HR.'}</p>
    </section>
    {helpOpen && blocked && state.mode === 'places' && <LocationHelp onClose={() => setHelpOpen(false)} onRetry={() => { setHelpOpen(false); void clock(); }} />}
    {ask && state && <div role="dialog" aria-modal="true" aria-labelledby="credit-ask-title" className="fixed inset-0 z-50 grid place-items-end bg-slate-950/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-6">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl sm:rounded-[28px]">
        <h2 id="credit-ask-title" className="text-xl font-semibold tracking-tight text-[#0b2a4a]">{ask.kind === 'early' ? 'You are clocking out early' : 'You are clocking in late'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{ask.kind === 'early' ? `You are leaving ${ask.minutes} minutes before your shift ends.` : `You are ${ask.minutes} minutes late for your shift.`} You have {Math.floor((state.creditMinutes || 0) / 60)} h{(state.creditMinutes || 0) % 60 ? ` ${(state.creditMinutes || 0) % 60} min` : ''} of credit hours.</p>
        <p className="mt-3 text-base font-semibold text-[#14233b]">Do you want to use your credit hours?</p>
        {ask.step === 'pick' && <label className="mt-3 block text-sm font-semibold text-slate-700">How much credit to use<select value={ask.pick} onChange={(event) => setAsk({ ...ask, pick: Number(event.target.value) })} className="mt-1 h-12 w-full rounded-2xl border border-slate-200 px-3 text-base">{ask.options.map((hours) => <option key={hours} value={hours}>{hours < 1 ? `${hours * 60} minutes` : hours === 1 ? '1 hour' : `${hours} hours`}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Please make sure your supervisor has been informed.</span></label>}
        <div className="mt-5 grid gap-2">
          {ask.step === 'ask'
            ? <><button type="button" onClick={() => setAsk({ ...ask, step: 'pick' })} className="h-12 rounded-2xl bg-[#1f6feb] text-sm font-semibold text-white">Yes, use my credit hours</button>
              <button type="button" onClick={() => { setAsk(null); setCreditHours(0); void clock(0); }} className="h-12 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700">No, clock without credit hours</button></>
            : <><button type="button" onClick={() => { const hours = ask.pick; setAsk(null); setCreditHours(hours); void clock(hours); }} className="h-12 rounded-2xl bg-[#1f6feb] text-sm font-semibold text-white">Use credit hours and clock {ask.kind === 'early' ? 'out' : 'in'}</button>
              <button type="button" onClick={() => setAsk({ ...ask, step: 'ask' })} className="h-12 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700">Back</button></>}
          <button type="button" onClick={() => setAsk(null)} className="h-10 text-sm font-semibold text-slate-500">Cancel, do not clock yet</button>
        </div>
      </div>
    </div>}
    {message && <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{message}</p>}
    {tip && <section className="rounded-2xl bg-[#eef5ff] p-4 text-sm leading-6 text-[#0b2a4a]"><p className="font-semibold">So your iPhone does not ask every time</p><p className="mt-1">Tap <strong>aA</strong> on the left of the web address, then <strong>Website Settings</strong>, <strong>Location</strong> and choose <strong>Allow</strong>. You only need to do this once.</p><button onClick={() => { try { localStorage.setItem('ara_location_tip', '1'); } catch { /* storage not available */ } setTip(false); }} className="mt-2 text-sm font-semibold text-[#1f6feb]">Got it</button></section>}
    {error && <p className="rounded-2xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">{error}</p>}
    {state.yesterday.status === 'missing-out' && <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">You did not clock out on {dayName(state.yesterday.date)}. Send it from <strong>Forgot to clock?</strong> below so it can be corrected.</p>}

    {mode === 'clock' && requestSections('missed')}


    <section className={card}>
      <div className="flex items-center gap-3">
        <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"><ChevronLeft className="h-4 w-4" /></button>
        <h3 className="min-w-[150px] text-center font-semibold">{monthName(month)}</h3>
        <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"><ChevronRight className="h-4 w-4" /></button>
      </div>
      {!days ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : <ul className="mt-3 divide-y divide-slate-100">
        {days.filter((day) => (!['off', 'upcoming', 'no-record'].includes(day.status) || day.date === state.today) && day.status !== 'no-record').map((day) => <li key={day.date} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
          <span className="w-24 shrink-0 font-medium">{dayName(day.date)}</span>
          <span className="w-14 shrink-0 font-mono text-xs font-bold text-[#0b587b]">{day.code ? newCode(day.code) : '—'}</span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-slate-600"><Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-300" />{day.inTime || '—'} → {day.outTime || '—'}{day.worked > 0 && <span className="text-slate-400"> · {hours(day.worked)}</span>}</span>
          {day.lateCounted > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Late {day.lateCounted} min</span>}
          {badge(day.status, day.leave)}
          {mode === 'clock' && onApplyOt && otDays.some((item) => item.date === day.date) && <button onClick={() => onApplyOt(day.date)} className="basis-full text-left text-xs font-semibold text-[#b57a00] underline">{workedText(day, false)} · OT {otHours(otDays.find((item) => item.date === day.date)?.minutes || 0)}. Forgot to apply OT? Tap to apply for {dayName(day.date)}</button>}
          {(() => {
            const kind = forgotKind(day);
            if (!kind || !dates.includes(day.date)) return null;
            return <><span className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white">Forgot to clock {kind}</span><button onClick={() => { setForm({ date: day.date, inTime: day.inTime || '', outTime: day.outTime || '', otTime: '', reason: MISSED_REASONS[1], remarks: '' }); setTimeout(() => document.getElementById('missed-clock-box')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} className="basis-full text-left text-xs font-semibold text-[#0b587b] underline">Did you forget to clock {kind}? Tap to send a request for {dayName(day.date)}</button></>;
          })()}
        </li>)}
        {!days.some((day) => !['off', 'upcoming', 'no-record'].includes(day.status)) && <li className="py-3 text-sm text-slate-500">{days.length > 0 && days.every((day) => day.status === 'no-record') ? `No record for ${monthName(month)}.` : `Nothing recorded for ${monthName(month)} yet.`}</li>}
      </ul>}
    </section>
    <p className="px-1 text-xs leading-5 text-slate-400">Clock in and out using any browser, at your assigned workplace. Keep your sign-in details private. Arriving within the grace period is not late. If you forget to clock, send a request above.</p>
  </div>;
}
