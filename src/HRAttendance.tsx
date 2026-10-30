import { ChangeEvent, ReactNode, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Crosshair, Download, Plus, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { ImportRow, readInfotechReport } from './lib/infotechReport';

// Office HR > Attendance: who clocked in today, the month in numbers, OT to approve, corrections staff asked for, the late
// pattern, the places clocking is allowed, where each person may clock, and the rules (grace and shift times).
// Staff clock on their phone in Individual Sign In. Rules follow Infotech and HR: late is a record for discipline (no pay is
// deducted), leaving early is not counted, and OT is captured automatically but approved by HR.
const API = '/api/status?resource=hr';
async function api(query: string, body?: unknown) {
  const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return response.json();
}
type Tab = 'today' | 'month' | 'ot' | 'requests' | 'late' | 'import' | 'places' | 'staff' | 'rules';
type Row = { id: string; company: string; code: string; name: string; doctor: boolean; date: string; shift: string; status: string; startTime: string; endTime: string; inTime: string; outTime: string; late: number; lateCounted: number; otCounted: number; leave: string };
type MonthRow = { id: string; company: string; code: string; name: string; expected: number; present: number; absent: number; leave: number; missingOut: number; lateDays: number; lateMinutes: number; workedMinutes: number; otApprovedMinutes: number; otWaitingMinutes: number; exempt: number };
type Place = { id: string; name: string; company: string; latitude: number; longitude: number; radius: number; active: boolean };
type Person = { id: string; company: string; code: string; name: string; doctor: boolean; mode: 'places' | 'anywhere'; placeIds: string[]; clockRequired: 'full' | 'in_only' | 'none'; defaultShift: string; deviceRegistered: boolean; deviceAt: string | null };
type Clock = { id: string; source: 'phone' | 'infotech' | 'hr' | 'request'; kind: 'in' | 'out'; at: string; time: string; date: string; place: string; distance: number | null; accuracy: number | null; anywhere: boolean; fromRequest: boolean; device: string };
type TimeRow = { kind: 'staff' | 'doctor'; code: string; start: string; end: string };
type OtRow = { id: string; company: string; code: string; name: string; date: string; shift: string; startTime: string; endTime: string; inTime: string; outTime: string; dayOff: boolean; captured: number; status: '' | 'approved' | 'rejected'; approved: number; rate: number; note: string };
type Req = { id: string; name: string; date: string; inTime: string; outTime: string; reason: string; status: 'pending' | 'approved' | 'rejected'; decidedBy: string; note: string };

const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';
const button = 'inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50';
const ghost = 'inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50';
const nav = 'grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
const monthOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (month: string, by: number) => { const [year, number] = month.split('-').map(Number); return monthOf(new Date(year, number - 1 + by, 1)); };
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const shortMonth = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });
const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
const STATUS: Record<string, [string, string]> = { present: ['Present', 'bg-emerald-50 text-emerald-700'], working: ['Working', 'bg-sky-50 text-sky-700'], absent: ['Absent', 'bg-rose-50 text-rose-700'], 'not-in': ['Not in yet', 'bg-amber-50 text-amber-700'], leave: ['Leave', 'bg-violet-50 text-violet-700'], 'missing-out': ['No clock out', 'bg-amber-50 text-amber-700'], extra: ['Clocked on a day off', 'bg-slate-100 text-slate-500'], off: ['Off', 'bg-slate-100 text-slate-400'], upcoming: ['Upcoming', 'bg-slate-100 text-slate-500'], 'no-times': ['Shift not set', 'bg-slate-100 text-slate-500'], exempt: ['No clock needed', 'bg-slate-100 text-slate-500'] };
const badge = (status: string) => { const [label, tone] = STATUS[status] || [status, 'bg-slate-100 text-slate-500']; return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{label}</span>; };
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const addDay = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
// The Infotech code each roster name replaced, so HR who knew the old names can follow.
const WAS: Record<string, string> = { 'AM-9': 'ASCL1', 'AM-12': 'ASCL2', PM: 'ASCL3 (doctors: DOCRS2)', 'AM-6': 'ASCL4', AM: 'DOCRSD', OH: 'DR96' };

function MonthBar({ month, setMonth, children }: { month: string; setMonth: (month: string) => void; children?: ReactNode }) {
  return <section className={`${card} flex flex-wrap items-center gap-3`}>
    <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className={nav}><ChevronLeft className="h-4 w-4" /></button>
    <h2 className="min-w-[160px] text-center text-lg font-semibold">{monthName(month)}</h2>
    <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className={nav}><ChevronRight className="h-4 w-4" /></button>
    {children}
  </section>;
}

function Today({ onError }: { onError: (message: string) => void }) {
  const [date, setDate] = useState(todayKey());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [company, setCompany] = useState('');
  const [open, setOpen] = useState('');
  const [clocks, setClocks] = useState<Clock[] | null>(null);
  const load = () => { setRows(null); api(`action=attendance_daily&date=${date}`).then((result) => { if (result.error) throw new Error(result.error); setRows(result.rows); }).catch((cause: Error) => { setRows([]); onError(cause.message); }); };
  useEffect(() => { setOpen(''); load(); }, [date]);
  const loadClocks = async (id: string) => { setClocks(null); try { const result = await api(`action=attendance_clocks&id=${id}&date=${date}`); setClocks(result.clocks); } catch (cause) { setClocks([]); onError(cause instanceof Error ? cause.message : 'Unable to load the clocks.'); } };
  const details = async (id: string) => { if (open === id) return setOpen(''); setOpen(id); setAdd({ kind: 'in', time: '', nextDay: false, note: '' }); await loadClocks(id); };
  const [add, setAdd] = useState({ kind: 'in' as 'in' | 'out', time: '', nextDay: false, note: '' });
  const change = async (run: () => Promise<any>, id: string) => { try { const result = await run(); if (result.error) throw new Error(result.error); await loadClocks(id); load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } };
  const SOURCE = { phone: 'phone', infotech: 'from Infotech', hr: 'added by HR', request: 'from an approved request' } as const;
  const shown = (rows || []).filter((row) => !company || row.company === company);
  const expected = shown.filter((row) => !['off', 'extra', 'no-times'].includes(row.status));
  const count = (...statuses: string[]) => expected.filter((row) => statuses.includes(row.status)).length;
  const chips: [string, number, string][] = [['Expected', expected.length, 'text-slate-700'], ['In', count('present', 'working', 'missing-out'), 'text-emerald-700'], ['Not in yet', count('not-in', 'upcoming'), 'text-amber-700'], ['Absent', count('absent'), 'text-rose-700'], ['Leave', count('leave'), 'text-violet-700'], ['Late', expected.filter((row) => row.lateCounted > 0).length, 'text-amber-700']];
  return <div className="space-y-4">
    <section className={`${card} flex flex-wrap items-center gap-3`}>
      <button onClick={() => setDate(addDay(date, -1))} aria-label="Previous day" className={nav}><ChevronLeft className="h-4 w-4" /></button>
      <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} className={field} aria-label="Date" />
      <button onClick={() => setDate(addDay(date, 1))} aria-label="Next day" className={nav}><ChevronRight className="h-4 w-4" /></button>
      {date !== todayKey() && <button onClick={() => setDate(todayKey())} className="text-sm font-semibold text-[#0b587b]">Today</button>}
      <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Company" className={`${field} ml-auto`}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select>
    </section>
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{chips.map(([label, value, tone]) => <div key={label} className={`${card} !p-4 text-center`}><p className={`text-2xl font-semibold ${tone}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>)}</div>
    <section className={`${card} overflow-x-auto`}>
      {!rows ? <p className="text-sm text-slate-500">Loading…</p> : <table className="w-full min-w-[760px] text-sm">
        <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Shift</th><th className="pr-3">In</th><th className="pr-3">Out</th><th className="pr-3">Late</th><th className="pr-3">Status</th><th /></tr></thead>
        <tbody>{shown.filter((row) => row.status !== 'off').map((row) => <>
          <tr key={row.id} className="border-t border-slate-100">
            <td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code}</p></td>
            <td className="pr-3"><span className="font-mono text-xs font-bold text-[#0b587b]">{row.shift}</span> <span className="text-xs text-slate-500">{row.startTime && `${row.startTime}–${row.endTime}`}</span></td>
            <td className="pr-3 font-medium">{row.inTime || '—'}</td><td className="pr-3 font-medium">{row.outTime || '—'}</td>
            <td className="pr-3">{row.lateCounted > 0 ? <span className="font-semibold text-amber-700">{row.lateCounted} min</span> : row.late > 0 ? <span className="text-slate-400">{row.late} min (grace)</span> : '—'}</td>
            <td className="pr-3">{badge(row.status)}</td>
            <td className="text-right"><button onClick={() => void details(row.id)} className="text-xs font-semibold text-[#0b587b] hover:underline">{open === row.id ? 'Hide' : 'Clocks'}</button></td>
          </tr>
          {open === row.id && <tr key={`${row.id}-details`}><td colSpan={7} className="bg-slate-50 px-3 py-3 text-xs text-slate-600">
            {!clocks ? 'Loading…' : <>
              {!clocks.length ? <p>No clocks around this date.</p> : <ul className="space-y-1">{clocks.map((clock) => <li key={clock.id} className="flex flex-wrap items-center gap-x-2">{clock.date} {clock.time} · {clock.kind === 'in' ? 'In' : 'Out'} · {clock.source === 'phone' ? (clock.anywhere ? 'phone, anywhere (not checked)' : `${clock.place}, ${clock.distance} m away${clock.accuracy !== null ? ` · GPS ±${clock.accuracy} m` : ''}`) : SOURCE[clock.source]}<button onClick={() => { if (window.confirm('Delete this clock? It is written to the audit trail.')) void change(() => api('action=attendance_clock_delete', { clockId: clock.id }), row.id); }} className="font-semibold text-rose-600 hover:underline">Delete</button></li>)}</ul>}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3"><span className="font-semibold">Add a clock for {dayName(date)}</span>
                <select value={add.kind} onChange={(event) => setAdd({ ...add, kind: event.target.value as 'in' | 'out' })} aria-label="Clock in or out" className={field}><option value="in">In</option><option value="out">Out</option></select>
                <input type="time" value={add.time} onChange={(event) => setAdd({ ...add, time: event.target.value })} aria-label="Time" className={field} />
                <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={add.nextDay} onChange={(event) => setAdd({ ...add, nextDay: event.target.checked })} />next day (night shift)</label>
                <input value={add.note} onChange={(event) => setAdd({ ...add, note: event.target.value })} placeholder="Reason (optional)" maxLength={200} className={`${field} w-48`} aria-label="Reason" />
                <button onClick={() => void change(() => api('action=attendance_clock_add', { id: row.id, date, kind: add.kind, time: add.time, nextDay: add.nextDay, note: add.note }), row.id)} disabled={!add.time} className={button}>Add</button></div>
            </>}</td></tr>}
        </>)}</tbody>
      </table>}
      {rows && !shown.filter((row) => row.status !== 'off').length && <p className="py-4 text-sm text-slate-500">Nobody is expected on this date.</p>}
    </section>
  </div>;
}

function Month({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(monthOf(new Date()));
  const [data, setData] = useState<{ rows: MonthRow[]; rules: { lateGrace: number; otMin: number } } | null>(null);
  useEffect(() => { setData(null); api(`action=attendance_month&month=${month}`).then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => { setData({ rows: [], rules: { lateGrace: 0, otMin: 0 } }); onError(cause.message); }); }, [month]);
  const csv = () => {
    if (!data) return;
    const head = ['Company', 'Code', 'Name', 'Expected days', 'Present days', 'Absent days', 'Leave days', 'Late days', 'Late minutes', 'Worked hours', 'OT approved hours', 'OT waiting hours'];
    const lines = data.rows.map((row) => [row.company, row.code, row.name, row.expected, row.present, row.absent, row.leave, row.lateDays, row.lateMinutes, (row.workedMinutes / 60).toFixed(2), (row.otApprovedMinutes / 60).toFixed(2), (row.otWaitingMinutes / 60).toFixed(2)]);
    const body = [head, ...lines].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' })); link.download = `attendance-${month}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  return <div className="space-y-4">
    <MonthBar month={month} setMonth={setMonth}><button onClick={csv} disabled={!data?.rows.length} className={`${ghost} ml-auto`}><Download className="h-4 w-4" />Download CSV</button></MonthBar>
    <section className={`${card} overflow-x-auto`}>
      {!data ? <p className="text-sm text-slate-500">Loading…</p> : <table className="w-full min-w-[900px] text-sm">
        <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3 text-right">Expected</th><th className="pr-3 text-right">Present</th><th className="pr-3 text-right">Absent</th><th className="pr-3 text-right">Leave</th><th className="pr-3 text-right">Late</th><th className="pr-3 text-right">Worked</th><th className="pr-3 text-right">OT approved</th><th className="text-right">OT waiting</th></tr></thead>
        <tbody>{data.rows.filter((row) => row.expected || row.present).map((row) => <tr key={row.id} className="border-t border-slate-100">
          <td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code}{row.exempt > 0 && ' · does not clock'}</p></td>
          <td className="pr-3 text-right">{row.expected}</td><td className="pr-3 text-right">{row.present}</td>
          <td className={`pr-3 text-right ${row.absent ? 'font-semibold text-rose-700' : ''}`}>{row.absent || '—'}{row.missingOut > 0 && <span className="block text-[10px] font-normal text-amber-600">{row.missingOut} no clock out</span>}</td>
          <td className="pr-3 text-right">{row.leave || '—'}</td>
          <td className="pr-3 text-right">{row.lateDays ? `${row.lateDays}× · ${row.lateMinutes} min` : '—'}</td>
          <td className="pr-3 text-right">{row.workedMinutes ? hours(row.workedMinutes) : '—'}</td>
          <td className="pr-3 text-right font-semibold">{row.otApprovedMinutes ? hours(row.otApprovedMinutes) : '—'}</td>
          <td className="text-right">{row.otWaitingMinutes ? <span className="text-amber-700">{hours(row.otWaitingMinutes)}</span> : '—'}</td>
        </tr>)}</tbody>
      </table>}
    </section>
    {data && <p className="px-1 text-xs leading-5 text-slate-500">Late counts only past the grace ({data.rules.lateGrace} minutes), in full, and is a record for discipline reference: no pay is deducted. A working day with no clock in is absent; a clock in with no clock out shows as <em>no clock out</em> until the person asks for a correction. Management do not clock. OT waiting is extra time of {data.rules.otMin} minutes or more that HR has not decided on yet (OT tab).</p>}
  </div>;
}

function Ot({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(monthOf(new Date()));
  const [rows, setRows] = useState<OtRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { rate: string; minutes: string; note: string }>>({});
  const [busy, setBusy] = useState('');
  const key = (row: OtRow) => `${row.id}|${row.date}`;
  const load = () => { setRows(null); api(`action=attendance_ot&month=${month}`).then((result) => { if (result.error) throw new Error(result.error); setRows(result.rows); }).catch((cause: Error) => { setRows([]); onError(cause.message); }); };
  useEffect(load, [month]);
  const value = (row: OtRow) => draft[key(row)] || { rate: String(row.rate || (row.dayOff ? 2 : 1.5)), minutes: String(row.status === 'approved' ? row.approved : row.captured), note: row.note };
  const set = (row: OtRow, patch: Partial<{ rate: string; minutes: string; note: string }>) => setDraft({ ...draft, [key(row)]: { ...value(row), ...patch } });
  const decide = async (row: OtRow, status: 'approved' | 'rejected') => { setBusy(key(row)); try { const v = value(row); const result = await api('action=attendance_ot_decide', { id: row.id, date: row.date, status, rate: Number(v.rate), minutes: Number(v.minutes), note: v.note }); if (result.error) throw new Error(result.error); load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(''); } };
  const waiting = (rows || []).filter((row) => !row.status).length;
  return <div className="space-y-4">
    <MonthBar month={month} setMonth={setMonth}>{rows && <span className="ml-auto text-sm text-slate-500">{waiting} waiting · {(rows || []).length - waiting} decided</span>}</MonthBar>
    <section className={`${card} overflow-x-auto`}>
      <p className="mb-3 text-sm text-slate-500">Extra time is captured automatically from the clocks: before the shift starts, after it ends, or a whole day worked on a day off. Not every extra hour is OT (for example staying back on personal matters), so you approve or reject each one and choose the rate. Doctors have no OT.</p>
      {!rows ? <p className="text-sm text-slate-500">Loading…</p> : !rows.length ? <p className="text-sm text-slate-500">No extra time to decide on in {monthName(month)}.</p> : <table className="w-full min-w-[900px] text-sm">
        <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Date</th><th className="pr-3">Staff</th><th className="pr-3">Shift</th><th className="pr-3">Clocks</th><th className="pr-3">Extra</th><th className="pr-3">Approve minutes</th><th className="pr-3">Rate</th><th /></tr></thead>
        <tbody>{rows.map((row) => { const v = value(row); return <tr key={key(row)} className="border-t border-slate-100 align-top">
          <td className="py-2.5 pr-3 font-medium">{dayName(row.date)}</td>
          <td className="pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code}</p></td>
          <td className="pr-3 text-xs"><span className="font-mono font-bold text-[#0b587b]">{row.shift || 'Day off'}</span>{row.startTime && <span className="block text-slate-400">{row.startTime}–{row.endTime}</span>}</td>
          <td className="pr-3">{row.inTime} → {row.outTime}</td>
          <td className="pr-3 font-semibold">{hours(row.captured)}</td>
          <td className="pr-3"><input value={v.minutes} onChange={(event) => set(row, { minutes: event.target.value })} inputMode="numeric" className={`${field} w-24`} aria-label="Minutes to approve" /></td>
          <td className="pr-3"><select value={v.rate} onChange={(event) => set(row, { rate: event.target.value })} className={field} aria-label="OT rate"><option value="1">1.0</option><option value="1.5">1.5</option><option value="2">2.0</option><option value="3">3.0</option></select></td>
          <td className="text-right">{row.status === 'approved' ? <span className="mr-2 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Approved {hours(row.approved)} · {row.rate}</span> : row.status === 'rejected' ? <span className="mr-2 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">Rejected</span> : null}
            <button onClick={() => void decide(row, 'approved')} disabled={busy === key(row)} className={ghost}>{row.status ? 'Change' : 'Approve'}</button> <button onClick={() => void decide(row, 'rejected')} disabled={busy === key(row)} className={ghost}>Reject</button></td>
        </tr>; })}</tbody>
      </table>}
    </section>
  </div>;
}

function Requests({ onError }: { onError: (message: string) => void }) {
  const [all, setAll] = useState(false);
  const [requests, setRequests] = useState<Req[] | null>(null);
  const [busy, setBusy] = useState('');
  const load = () => { setRequests(null); api(`action=attendance_requests&status=${all ? 'all' : 'pending'}`).then((result) => { if (result.error) throw new Error(result.error); setRequests(result.requests); }).catch((cause: Error) => { setRequests([]); onError(cause.message); }); };
  useEffect(load, [all]);
  const decide = async (id: string, decision: 'approved' | 'rejected') => { setBusy(id); try { const result = await api('action=attendance_request_decide', { id, decision }); if (result.error) throw new Error(result.error); load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(''); } };
  return <section className={`${card} space-y-3`}>
    <div className="flex flex-wrap items-center gap-3"><p className="flex-1 text-sm text-slate-500">Staff who forgot to clock ask for the time to be added. The supervisor or HR approves; approving adds the clock.</p><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(event) => setAll(event.target.checked)} />Show decided too</label></div>
    {!requests ? <p className="text-sm text-slate-500">Loading…</p> : !requests.length ? <p className="text-sm text-slate-500">{all ? 'No requests yet.' : 'Nothing waiting.'}</p> : <ul className="divide-y divide-slate-100">{requests.map((request) => <li key={request.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1"><p className="font-semibold">{request.name}</p><p className="text-xs text-slate-500">{dayName(request.date)} · {request.inTime && `in ${request.inTime}`}{request.inTime && request.outTime && ' · '}{request.outTime && `out ${request.outTime}`}</p><p className="mt-0.5 text-xs text-slate-400">{request.reason}</p></div>
      {request.status === 'pending' ? <><button onClick={() => void decide(request.id, 'approved')} disabled={busy === request.id} className={button}>Approve</button><button onClick={() => void decide(request.id, 'rejected')} disabled={busy === request.id} className={ghost}>Reject</button></> : <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{request.status === 'approved' ? 'Approved' : 'Rejected'} · {request.decidedBy}</span>}
    </li>)}</ul>}
  </section>;
}

function Late({ onError }: { onError: (message: string) => void }) {
  const [data, setData] = useState<{ months: string[]; grace: number; rows: { id: string; company: string; code: string; name: string; total: number; perMonth: { month: string; days: number; minutes: number }[] }[] } | null>(null);
  useEffect(() => { api('action=attendance_late_pattern').then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => { setData({ months: [], grace: 0, rows: [] }); onError(cause.message); }); }, []);
  return <section className={`${card} overflow-x-auto`}>
    <p className="mb-3 text-sm text-slate-500">Days counted late over the last six months (past the {data?.grace ?? 15}-minute grace), most first. For spotting a pattern before any disciplinary step. No pay is deducted for being late.</p>
    {!data ? <p className="text-sm text-slate-500">Loading…</p> : !data.rows.length ? <p className="text-sm text-slate-500">Nobody has been late in this period.</p> : <table className="w-full min-w-[640px] text-sm">
      <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th>{data.months.map((month) => <th key={month} className="pr-3 text-right">{shortMonth(month)}</th>)}<th className="text-right">Total</th></tr></thead>
      <tbody>{data.rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code}</p></td>{row.perMonth.map((item) => <td key={item.month} className="pr-3 text-right">{item.days ? <>{item.days}× <span className="text-[11px] text-slate-400">{item.minutes}m</span></> : '—'}</td>)}<td className="text-right font-semibold">{row.total}×</td></tr>)}</tbody>
    </table>}
  </section>;
}

function Import({ onError }: { onError: (message: string) => void }) {
  const [file, setFile] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ from: string; to: string; days: number; people: number; added: number; replaced: number; rosterAdded: number; unknown: string[] } | null>(null);
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]; event.target.value = '';
    if (!picked) return;
    setResult(null); setRows(null); setFile(picked.name);
    try { const read = readInfotechReport(await picked.text()); if (!read.length) throw new Error('No attendance rows were found in that file.'); setRows(read); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to read that file.'); }
  };
  const run = async () => {
    if (!rows) return;
    setBusy(true);
    try { const response = await api('action=attendance_import', { rows }); if (response.error) throw new Error(response.error); setResult(response); setRows(null); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to import.'); } finally { setBusy(false); }
  };
  const days: string[] = rows ? [...new Set<string>(rows.map((row) => row.date))].sort() : [];
  return <section className={`${card} space-y-4`}>
    <div><h3 className="font-semibold">Import from Infotech</h3><p className="text-sm text-slate-500">When something changes in Infotech (a clock, a correction, a new day), bring it in here. In Infotech open <em>Reports &gt; Individual Attendance</em>, choose the dates and all staff, and press <em>Export CSV</em> (one company at a time). Then choose the file below.</p></div>
    <label className={`${ghost} cursor-pointer`}><Download className="h-4 w-4 rotate-180" />Choose the CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => void choose(event)} className="hidden" /></label>
    {rows && <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm"><p><strong>{file}</strong>: {rows.length} person-days for {new Set(rows.map((row) => row.code)).size} staff ({[...new Set(rows.map((row) => row.company))].join(' and ')}), {dayName(days[0])} to {dayName(days[days.length - 1])}.</p><p className="text-xs text-slate-500">Importing replaces what an earlier import said for these people and days with what Infotech says now. Clocks made on the phones and clocks HR added are not touched.</p><button onClick={() => void run()} disabled={busy} className={button}>{busy ? 'Importing…' : 'Import'}</button></div>}
    {result && <div className="space-y-1 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><p className="font-semibold">Imported {dayName(result.from)} to {dayName(result.to)}.</p><p>{result.added} clocks added for {result.people} staff over {result.days} days{result.replaced ? `; ${result.replaced} earlier Infotech clocks replaced` : ''}{result.rosterAdded ? `; ${result.rosterAdded} roster days filled in` : ''}.</p>{result.unknown.length > 0 && <p className="text-amber-800">Not in HR, so skipped: {result.unknown.join(', ')}.</p>}</div>}
  </section>;
}

function Places({ onError }: { onError: (message: string) => void }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const blank = { id: '', name: '', company: 'KJ', latitude: '', longitude: '', radius: '150' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const load = () => api('action=attendance_places').then((result) => setPlaces(result.places)).catch((cause: Error) => { setPlaces([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);
  const here = () => { if (!navigator.geolocation) return onError('This browser cannot give your location.'); navigator.geolocation.getCurrentPosition((result) => setForm((current) => ({ ...current, latitude: result.coords.latitude.toFixed(6), longitude: result.coords.longitude.toFixed(6) })), () => onError('Allow location for this page to use your current location.'), { enableHighAccuracy: true, timeout: 20000 }); };
  const save = async () => { setBusy(true); try { const result = await api('action=attendance_place_save', { ...form, radius: Number(form.radius) }); if (result.error) throw new Error(result.error); setForm(blank); await load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); } };
  const remove = async (id: string) => { try { await api('action=attendance_place_delete', { id }); await load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to delete.'); } };
  return <div className="space-y-4">
    <section className={`${card} space-y-4`}>
      <div><h3 className="font-semibold">{form.id ? 'Edit place' : 'Add a place'}</h3><p className="text-sm text-slate-500">Stand at the clinic or office with your phone, then press <em>Use my current location</em>. Staff can clock only within the distance below.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name (for example KJ clinic)" className={`${field} lg:col-span-2`} aria-label="Name" />
        <select value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} aria-label="Company" className={field}><option value="KJ">KJ staff clock here</option><option value="SK">SK staff clock here</option><option value="">Only people I choose (office)</option></select>
        <input value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} placeholder="Latitude" inputMode="decimal" className={field} aria-label="Latitude" />
        <input value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} placeholder="Longitude" inputMode="decimal" className={field} aria-label="Longitude" />
        <div className="flex items-center gap-2"><input value={form.radius} onChange={(event) => setForm({ ...form, radius: event.target.value })} inputMode="numeric" className={`${field} w-24`} aria-label="Distance in metres" /><span className="text-sm text-slate-500">metres</span></div>
      </div>
      <div className="flex flex-wrap gap-3"><button onClick={here} className={ghost}><Crosshair className="h-4 w-4" />Use my current location</button><button onClick={() => void save()} disabled={busy} className={button}><Plus className="h-4 w-4" />{form.id ? 'Save place' : 'Add place'}</button>{form.id && <button onClick={() => setForm(blank)} className={ghost}>Cancel</button>}</div>
    </section>
    <section className={`${card} space-y-2`}>
      <h3 className="font-semibold">Places</h3>
      {!places ? <p className="text-sm text-slate-500">Loading…</p> : !places.length ? <p className="text-sm text-slate-500">No place yet. Until one is added, staff who must clock at a place cannot clock.</p> : <ul className="divide-y divide-slate-100">{places.map((place) => <li key={place.id} className="flex flex-wrap items-center gap-3 py-3 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold">{place.name}</p><p className="text-xs text-slate-400">{place.company ? `${place.company} staff` : 'People HR chooses'} · {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)} · {place.radius} m</p></div><button onClick={() => setForm({ id: place.id, name: place.name, company: place.company, latitude: String(place.latitude), longitude: String(place.longitude), radius: String(place.radius) })} className="text-xs font-semibold text-[#0b587b] hover:underline">Edit</button><button onClick={() => void remove(place.id)} aria-label={`Delete ${place.name}`} className="grid h-9 w-9 place-items-center rounded-xl text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></li>)}</ul>}
    </section>
  </div>;
}

function Staff({ onError }: { onError: (message: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [shifts, setShifts] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const load = () => Promise.all([api('action=attendance_people'), api('action=attendance_places'), api('action=attendance_rules')]).then(([a, b, c]) => { setPeople(a.people); setPlaces(b.places); setShifts([...new Set<string>((c.times as TimeRow[]).filter((row) => row.kind === 'staff').map((row) => row.code))]); }).catch((cause: Error) => { setPeople([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);
  const save = async (person: Person) => { try { const result = await api('action=attendance_person_save', { id: person.id, mode: person.mode, placeIds: person.placeIds, clockRequired: person.clockRequired, defaultShift: person.defaultShift }); if (result.error) throw new Error(result.error); setSaved(person.id); setTimeout(() => setSaved(''), 1500); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } };
  const reset = async (person: Person) => { try { await api('action=attendance_device_reset', { id: person.id }); await load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to reset.'); } };
  const patch = (id: string, next: Partial<Person>) => setPeople((list) => (list || []).map((person) => person.id === id ? { ...person, ...next } : person));
  const extra = places.filter((place) => place.active);
  return <section className={`${card} overflow-x-auto`}>
    <p className="mb-3 text-sm text-slate-500">Everyone can clock at their own company's places. Add the office for admin staff who work there, or choose <em>Anywhere</em> for those who may work from home (their location is still recorded). <em>Who clocks</em>: in and out is the rule; <em>in only</em> counts the day as worked without a clock out; <em>does not clock</em> is for management. <em>Usual shift</em> is for people with no roster, such as office staff. Each person clocks from one phone; reset it when they change phones.</p>
    {!people ? <p className="text-sm text-slate-500">Loading…</p> : <table className="w-full min-w-[980px] text-sm">
      <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Who clocks</th><th className="pr-3">Usual shift</th><th className="pr-3">Where</th><th className="pr-3">Also allowed at</th><th className="pr-3">Phone</th><th /></tr></thead>
      <tbody>{people.map((person) => <tr key={person.id} className="border-t border-slate-100 align-top">
        <td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{person.name}</p><p className="text-[11px] text-slate-400">{person.company} · {person.code}{person.doctor ? ' · doctor' : ''}</p></td>
        <td className="pr-3"><select value={person.clockRequired} onChange={(event) => patch(person.id, { clockRequired: event.target.value as Person['clockRequired'] })} aria-label={`Who clocks: ${person.name}`} className={field}><option value="full">In and out</option><option value="in_only">In only</option><option value="none">Does not clock</option></select></td>
        <td className="pr-3"><select value={person.defaultShift} onChange={(event) => patch(person.id, { defaultShift: event.target.value })} aria-label={`Usual shift: ${person.name}`} className={field}><option value="">Office hours (AM-5)</option>{shifts.map((code) => <option key={code} value={code}>{code}</option>)}</select></td>
        <td className="pr-3"><select value={person.mode} onChange={(event) => patch(person.id, { mode: event.target.value as Person['mode'] })} aria-label={`Where ${person.name} may clock`} className={field}><option value="places">At the clinic / places</option><option value="anywhere">Anywhere (home)</option></select></td>
        <td className="pr-3">{person.mode === 'anywhere' ? <span className="text-xs text-slate-400">Not checked</span> : <div className="flex flex-wrap gap-x-3 gap-y-1">{extra.filter((place) => place.company !== person.company).map((place) => <label key={place.id} className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={person.placeIds.includes(place.id)} onChange={(event) => patch(person.id, { placeIds: event.target.checked ? [...person.placeIds, place.id] : person.placeIds.filter((id) => id !== place.id) })} />{place.name}</label>)}{!extra.filter((place) => place.company !== person.company).length && <span className="text-xs text-slate-400">—</span>}</div>}</td>
        <td className="pr-3 text-xs">{person.deviceRegistered ? <><span className="text-emerald-700">Registered</span> <button onClick={() => void reset(person)} className="ml-1 font-semibold text-[#0b587b] hover:underline">Reset</button></> : <span className="text-slate-400">Not yet</span>}</td>
        <td className="text-right"><button onClick={() => void save(person)} className={ghost}>{saved === person.id ? 'Saved' : 'Save'}</button></td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

function Rules({ onError }: { onError: (message: string) => void }) {
  const [rules, setRules] = useState<{ lateGrace: string; earlyGrace: string; otMin: string; times: TimeRow[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const [add, setAdd] = useState({ code: '', kind: 'staff' as 'staff' | 'doctor', start: '09:00', end: '18:00' });
  useEffect(() => { api('action=attendance_rules').then((result) => setRules({ lateGrace: String(result.lateGrace), earlyGrace: String(result.earlyGrace), otMin: String(result.otMin), times: result.times })).catch((cause: Error) => onError(cause.message)); }, []);
  if (!rules) return <p className="text-sm text-slate-500">Loading…</p>;
  const setTime = (index: number, patch: Partial<TimeRow>) => setRules({ ...rules, times: rules.times.map((row, at) => at === index ? { ...row, ...patch } : row) });
  const addShift = () => { const code = add.code.trim().toUpperCase(); if (!code) return onError('Enter the shift code.'); setRules({ ...rules, times: [...rules.times, { kind: add.kind, code, start: add.start, end: add.end }] }); setAdd({ ...add, code: '' }); };
  const save = async () => { try { const result = await api('action=attendance_rules_save', { lateGrace: rules.lateGrace, earlyGrace: rules.earlyGrace, otMin: rules.otMin, times: rules.times }); if (result.error) throw new Error(result.error); setSaved(true); setTimeout(() => setSaved(false), 1500); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } };
  return <div className="space-y-4">
    <section className={`${card} space-y-4`}>
      <h3 className="font-semibold">Grace and extra time</h3>
      <div className="grid gap-4 sm:grid-cols-3">{([['lateGrace', 'Late grace (minutes)'], ['earlyGrace', 'Early-out grace (minutes)'], ['otMin', 'Smallest extra time captured (minutes)']] as const).map(([key, label]) => <label key={key} className="text-sm"><span className="mb-1 block text-slate-500">{label}</span><input value={rules[key]} onChange={(event) => setRules({ ...rules, [key]: event.target.value })} inputMode="numeric" className={`${field} w-full`} /></label>)}</div>
      <p className="text-xs leading-5 text-slate-500">As in Infotech: arriving within the grace is not late; past it the full minutes late are counted, as a record for discipline (no pay is deducted). Leaving early is not counted. Extra time of at least the smallest amount is captured for HR to approve as OT.</p>
    </section>
    <section className={`${card} space-y-3`}>
      <h3 className="font-semibold">Shifts</h3>
      <p className="text-sm text-slate-500">The start and end of each roster code. The code always shows what time it starts (AM-9 starts at 9AM, AM-12 at 12PM), the same for KJ and SK. A shift that ends before it starts runs overnight. A person with no roster is expected on their usual shift on their working weekdays.</p>
      <div className="grid gap-2">{rules.times.map((row, index) => <div key={`${row.kind}-${row.code}-${index}`} className="flex flex-wrap items-center gap-3 text-sm">
        <span className="w-16 text-xs text-slate-400">{row.kind === 'doctor' ? 'Doctors' : 'Staff'}</span><span className="w-20 font-mono text-xs font-bold text-[#0b587b]">{row.code}</span>
        <input type="time" value={row.start} onChange={(event) => setTime(index, { start: event.target.value })} className={field} aria-label={`${row.code} start`} /><span className="text-slate-400">to</span><input type="time" value={row.end} onChange={(event) => setTime(index, { end: event.target.value })} className={field} aria-label={`${row.code} end`} />
        {WAS[row.code] && <span className="text-xs text-slate-400">was {WAS[row.code]} in Infotech</span>}
      </div>)}</div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-sm">
        <span className="text-xs text-slate-400">Add a shift</span>
        <input value={add.code} onChange={(event) => setAdd({ ...add, code: event.target.value })} placeholder="Code" className={`${field} w-28`} aria-label="New shift code" />
        <select value={add.kind} onChange={(event) => setAdd({ ...add, kind: event.target.value as 'staff' | 'doctor' })} className={field} aria-label="For"><option value="staff">Staff</option><option value="doctor">Doctors</option></select>
        <input type="time" value={add.start} onChange={(event) => setAdd({ ...add, start: event.target.value })} className={field} aria-label="New shift start" /><span className="text-slate-400">to</span><input type="time" value={add.end} onChange={(event) => setAdd({ ...add, end: event.target.value })} className={field} aria-label="New shift end" />
        <button onClick={addShift} className={ghost}><Plus className="h-4 w-4" />Add</button>
      </div>
      <button onClick={() => void save()} className={button}>{saved ? 'Saved' : 'Save rules'}</button>
    </section>
  </div>;
}

export function HRAttendance({ onError }: { onError: (message: string) => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const tabs: [Tab, string][] = [['today', 'Today'], ['month', 'Month'], ['ot', 'OT'], ['requests', 'Requests'], ['late', 'Late'], ['import', 'Import'], ['places', 'Places'], ['staff', 'Staff'], ['rules', 'Rules']];
  return <div className="mx-auto max-w-[1500px] space-y-5">
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`h-9 rounded-lg px-4 text-sm font-semibold transition ${tab === key ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>)}</div>
    {tab === 'today' && <Today onError={onError} />}
    {tab === 'month' && <Month onError={onError} />}
    {tab === 'ot' && <Ot onError={onError} />}
    {tab === 'requests' && <Requests onError={onError} />}
    {tab === 'late' && <Late onError={onError} />}
    {tab === 'import' && <Import onError={onError} />}
    {tab === 'places' && <Places onError={onError} />}
    {tab === 'staff' && <Staff onError={onError} />}
    {tab === 'rules' && <Rules onError={onError} />}
  </div>;
}
