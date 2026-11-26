import { useMemo, useState } from 'react';
import MyAttendance from './MyAttendance';

// Local preview only (npm run dev, never in the live build): the staff Attendance screen with made-up data, to see how Forgot to clock and OT requests look.
// It answers the page's own requests here in the browser, so nothing is read from or written to AraOffice, and nobody needs to sign in.
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const addDay = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const blankDay = (date: string, extra: Record<string, unknown> = {}) => ({ date, code: 'AM-9', startTime: '09:00', endTime: '21:00', inTime: '', outTime: '', status: '', late: 0, lateCounted: 0, worked: 0, otCounted: 0, otStatus: '', leave: '', ...extra });
const requests = [
  { id: 'r1', name: 'Demo Staff', date: addDay(today, -2), inTime: '', outTime: '21:05', otMinutes: 0, otText: '', reason: 'Forgot to clock out', remarks: '', status: 'pending', note: '', supervisorNote: '' },
  { id: 'r2', name: 'Demo Staff', date: addDay(today, -5), inTime: '08:55', outTime: '', otMinutes: 0, otText: '', reason: 'Forgot to clock in', remarks: '', status: 'supervisor_approved', note: '', supervisorNote: '' },
  { id: 'r3', name: 'Demo Staff', date: addDay(today, -9), inTime: '', outTime: '', otMinutes: 180, otText: '03:00', reason: 'Overtime', remarks: 'Covered a colleague', status: 'approved', note: '', supervisorNote: '' },
];
// ?attendanceDemo=long shows the question for a clock in that is still open after more than 14 hours ("Clock in new day" is 30 minutes late, with credit hours).
let openSince = new URLSearchParams(window.location.search).get('attendanceDemo') === 'long' ? `${addDay(today, -1)}T12:00:00+08:00` : '';
// What the demo buttons did, so the history below changes the way the real page would (kept until the page is refreshed).
const long = Boolean(openSince);
let outNow = '', inNow = '';
const clockText = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kuala_Lumpur' });
function answer(action: string, body: unknown) {
  if (long && action === 'attendance_history') return { days: [0, 1, 2, 3, 4].map((back) => blankDay(addDay(today, -back), back === 1 ? { startTime: '12:00', code: 'AM-12', inTime: '12:00', outTime: outNow, outNextDay: Boolean(outNow), worked: outNow ? 720 + Number(outNow.slice(0, 2)) * 60 + Number(outNow.slice(3)) : 0, status: outNow ? 'present' : 'missing-out' } : back === 0 ? { inTime: inNow, status: inNow ? 'working' : '' } : { inTime: '08:58', outTime: '21:01', status: 'present', worked: 720 })) };
  if (openSince && (action === 'attendance_today' || action === 'attendance_clock')) {
    const choice = action === 'attendance_clock' ? (JSON.parse(String(body)) as { choice?: 'in' | 'out' }).choice : undefined;
    const base = { today, name: 'Demo Staff', mode: 'anywhere', places: [], creditMinutes: 90, creditBasisIn: { kind: 'late', date: today, at: new Date(Date.now() - 30 * 60000).toISOString() }, shift: blankDay(today), yesterday: blankDay(addDay(today, -1), { inTime: '12:00' }), required: 'full' };
    if (!choice) return { ...base, nextKind: 'in', openSince, recent: [{ kind: 'in', at: openSince }] };
    openSince = '';
    if (choice === 'out') outNow = clockText(); else inNow = clockText();
    return { ...base, success: true, kind: choice, nextKind: choice === 'in' ? 'out' : 'in', recent: [{ kind: choice, at: new Date().toISOString() }] };
  }
  if (action === 'attendance_today') return { today, name: 'Demo Staff', mode: 'places', places: [{ name: 'Klinik Demo' }], nextKind: 'in', recent: [], creditMinutes: 90, shift: blankDay(today), yesterday: blankDay(addDay(today, -1), { inTime: '09:02', outTime: '', status: 'missing-out' }), required: 'full' };
  if (action === 'attendance_history') return { days: [0, 1, 2, 3, 4].map((back) => blankDay(addDay(today, -back), back === 1 ? { inTime: '09:02', outTime: '', status: 'missing-out' } : back === 0 ? {} : { inTime: '08:58', outTime: '21:01', status: 'present', worked: 720 })) };
  if (action === 'attendance_requests') return { requests };
  if (action === 'attendance_request_approvals') return { requests: [] };
  return { success: true, echo: body };
}
export default function DevAttendanceDemo() {
  const [mode, setMode] = useState<'clock' | 'ot'>(new URLSearchParams(window.location.search).get('attendanceDemo') === 'ot' ? 'ot' : 'clock');
  useMemo(() => {
    const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (!url.includes('resource=assessment')) return real(input, init);
      const action = new URL(url, window.location.origin).searchParams.get('action') || '';
      return Promise.resolve(new Response(JSON.stringify(answer(action, init?.body)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
  }, []);
  return <main className="min-h-screen bg-[#f5f5f7] p-4 text-[#14233b] sm:p-8">
    <div className="mx-auto max-w-md space-y-4">
      <p className="text-xs font-semibold text-slate-400">LOCALHOST · DEMO SAHAJA (made-up data, nothing is saved)</p>
      <div className="inline-flex rounded-xl bg-slate-200 p-1 text-sm font-semibold">{([['clock', 'Attendance'], ['ot', 'OT request']] as const).map(([key, label]) => <button key={key} onClick={() => setMode(key)} className={`rounded-lg px-4 py-2 ${mode === key ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>
      <MyAttendance key={mode} mode={mode} />
    </div>
  </main>;
}
