import { isMissedClock } from './lib/attendanceRequests';
import { OtPolicyBody } from './OtPolicy';
import { SubTabs } from './SubTabs';
import { ChangeEvent, ReactNode, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Crosshair, Download, Plus, Trash2 } from 'lucide-react';
import { csvCell } from './lib/hrReportExport';
import { downloadBlob } from './lib/downloadBlob';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { NEW_CODE, newCode } from './lib/shiftCodes';
import { ImportRow, readInfotechReport } from './lib/infotechReport';

// Office HR > Attendance: who clocked in today, the month in numbers, OT to approve, corrections staff asked for, the late
// pattern, the places clocking is allowed, where each person may clock, and the rules (grace and shift times).
// Staff clock on their phone in Individual Sign In. Rules follow Infotech and HR: late is a record for discipline (no pay is
// deducted), leaving early is not counted, and OT is captured automatically but approved by HR.
const API = '/api/status?resource=hr';
async function hrApi(query: string, body?: unknown) {
  const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return response.json();
}
const api = hrApi;
type Source = (query: string) => Promise<any>;
type Tab = 'today' | 'month' | 'ot' | 'missed' | 'late' | 'credit' | 'import' | 'places' | 'staff' | 'rules';
type Row = { id: string; company: string; code: string; name: string; doctor: boolean; date: string; shift: string; status: string; startTime: string; endTime: string; inTime: string; outTime: string; late: number; lateCounted: number; otCounted: number; creditHours?: number; leave: string };
type CreditInfo = { uses: { id: string; kind: 'late' | 'early'; hours: number; note: string }[]; usedThisYear: number; balanceMinutes: number | null };
const hoursText = (minutes: number) => { const m = Math.abs(minutes); return `${minutes < 0 ? '-' : ''}${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
type MonthRow = { id: string; company: string; code: string; name: string; expected: number; present: number; absent: number; leave: number; missingOut: number; lateDays: number; lateMinutes: number; workedMinutes: number; otApprovedMinutes: number; otWaitingMinutes: number; exempt: number };
type Place = { id: string; name: string; company: string; latitude: number; longitude: number; radius: number; active: boolean };
type Person = { id: string; company: string; code: string; name: string; doctor: boolean; mode: 'places' | 'anywhere'; placeIds: string[]; clockRequired: 'full' | 'in_only' | 'none'; defaultShift: string };
type Clock = { id: string; source: 'phone' | 'infotech' | 'hr' | 'request'; kind: 'in' | 'out'; at: string; time: string; date: string; place: string; distance: number | null; accuracy: number | null; anywhere: boolean; fromRequest: boolean; device: string };
type TimeRow = { kind: 'staff' | 'doctor'; code: string; start: string; end: string };
type OtRow = { group?: string; id: string; company: string; code: string; name: string; date: string; shift: string; startTime: string; endTime: string; inTime: string; outTime: string; dayOff: boolean; captured: number; status: '' | 'approved' | 'rejected'; approved: number; rate: number; note: string };
type Req = { id: string; employeeId: string; name: string; date: string; inTime: string; outTime: string; otMinutes: number; otText: string; readOnly?: boolean; company?: string; otPreview?: string; otShown?: number; clockIn?: string; clockOut?: string; shiftCode?: string; shiftStart?: string; shiftEnd?: string; reason: string; remarks: string; status: 'pending' | 'supervisor_approved' | 'approved' | 'rejected' | 'cancelled'; supervisorDecidedBy: string; supervisorNote: string; decidedBy: string; note: string; rate: number | null };

const field = 'h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10 sm:h-10 sm:rounded-xl sm:px-3 sm:text-sm';
const button = 'inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0b587b] px-3 text-xs font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50 sm:h-10 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-sm';
const ghost = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 sm:h-10 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-sm';
const nav = 'grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
const monthOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (month: string, by: number) => { const [year, number] = month.split('-').map(Number); return monthOf(new Date(year, number - 1 + by, 1)); };
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const shortMonth = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });
const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
const STATUS: Record<string, [string, string]> = { present: ['Present', 'bg-emerald-50 text-emerald-700'], working: ['Working', 'bg-sky-50 text-sky-700'], absent: ['Absent', 'bg-rose-50 text-rose-700'], 'not-in': ['Not in yet', 'bg-amber-50 text-amber-700'], leave: ['Leave', 'bg-violet-50 text-violet-700'], 'missing-out': ['No clock out', 'bg-amber-50 text-amber-700'], extra: ['Clocked on a day off', 'bg-slate-100 text-slate-500'], off: ['Off', 'bg-slate-100 text-slate-400'], upcoming: ['Upcoming', 'bg-slate-100 text-slate-500'], 'no-times': ['Shift not set', 'bg-slate-100 text-slate-500'], 'post-call': ['Post night', 'bg-indigo-50 text-indigo-700'], exempt: ['No clock needed', 'bg-slate-100 text-slate-500'], 'no-record': ['No record', 'bg-slate-50 text-slate-400'] };
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

function Today({ onError, source }: { onError: (message: string) => void; source?: Source }) {
  // The COO sees the same table from its own source and cannot open the clock details (that is for HR to change).
  const api: Source & typeof hrApi = (source as typeof hrApi) || hrApi;
  const [date, setDate] = useState(todayKey());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [company, setCompany] = useState('');
  const [open, setOpen] = useState('');
  const [clocks, setClocks] = useState<Clock[] | null>(null);
  const [credit, setCredit] = useState<CreditInfo | null>(null);
  const [useForm, setUseForm] = useState({ kind: 'late' as 'late' | 'early', hours: '', note: '', counted: false });
  const load = () => { setRows(null); api(`action=attendance_daily&date=${date}`).then((result) => { if (result.error) throw new Error(result.error); setRows(result.rows); }).catch((cause: Error) => { setRows([]); onError(cause.message); }); };
  useEffect(() => { setOpen(''); load(); }, [date]);
  const loadClocks = async (id: string) => { setClocks(null); try { const result = await api(`action=attendance_clocks&id=${id}&date=${date}`); setClocks(result.clocks); } catch (cause) { setClocks([]); onError(cause instanceof Error ? cause.message : 'Unable to load the clocks.'); } };
  const loadCredit = async (id: string) => { try { const result = await api(`action=attendance_credit_info&id=${id}&date=${date}`); if (result.error) throw new Error(result.error); setCredit(result); } catch { setCredit(null); } };
  const details = async (id: string) => { if (open === id) return setOpen(''); setOpen(id); setAdd({ kind: 'in', time: '', nextDay: false, note: '' }); setUseForm({ kind: 'late', hours: '', note: '', counted: false }); setCredit(null); void loadCredit(id); await loadClocks(id); };
  const useCredit = async (run: () => Promise<any>, id: string) => { try { const result = await run(); if (result.error) throw new Error(result.error); await loadCredit(id); setUseForm({ kind: 'late', hours: '', note: '', counted: false }); load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } };
  const [add, setAdd] = useState({ kind: 'in' as 'in' | 'out', time: '', nextDay: false, note: '' });
  const change = async (run: () => Promise<any>, id: string) => { try { const result = await run(); if (result.error) throw new Error(result.error); await loadClocks(id); load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } };
  const SOURCE = { phone: 'phone', infotech: 'from Infotech', hr: 'added by HR', request: 'from an approved request' } as const;
  const inCompany = (rows || []).filter((row) => !company || row.company === company);
  // A company with no record on this date gets one line instead of a "No record" row for every person.
  const shown = inCompany.filter((row) => row.status !== 'no-record');
  const noRecordFor = [...new Set(inCompany.filter((row) => row.status === 'no-record').map((row) => row.company))];
  const expected = shown.filter((row) => !['off', 'extra', 'no-times', 'post-call'].includes(row.status));
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
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">{chips.map(([label, value, tone]) => <div key={label} className={`${card} !p-2.5 text-center sm:!p-4`}><p className={`text-xl font-semibold sm:text-2xl ${tone}`}>{value}</p><p className="mt-0.5 text-[11px] text-slate-500 sm:mt-1 sm:text-xs">{label}</p></div>)}</div>
    {noRecordFor.length > 0 && <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">No record for this date ({noRecordFor.join(' and ')}).</p>}
    {source && rows && <ul className="space-y-2 sm:hidden">{shown.filter((row) => row.status !== 'off').map((row) => <li key={row.id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[13px] font-semibold leading-tight text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code}</p></div>{badge(row.status)}</div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center"><div className="rounded-lg bg-slate-50 px-1 py-1.5"><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Shift</p><p className="text-[12px] font-bold text-[#0b587b]">{newCode(row.shift) || '—'}</p>{row.startTime && <p className="text-[10px] text-slate-500">{row.startTime}–{row.endTime}</p>}</div><div className="rounded-lg bg-slate-50 px-1 py-1.5"><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">In</p><p className="text-[12px] font-semibold">{row.inTime || '—'}</p></div><div className="rounded-lg bg-slate-50 px-1 py-1.5"><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Out</p><p className="text-[12px] font-semibold">{row.outTime || '—'}</p></div></div>
      {(row.lateCounted > 0 || row.late > 0) && <p className={`mt-1.5 text-[11px] ${row.lateCounted > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>Late {row.lateCounted > 0 ? `${row.lateCounted} min` : `${row.late} min (grace)`}</p>}
    </li>)}{!shown.length && <li className="text-sm text-slate-500">Nobody on this date.</li>}</ul>}
    <section className={`${card} overflow-x-auto${source ? ' hidden sm:block' : ''}`}>
      {!rows ? <p className="text-sm text-slate-500">Loading…</p> : <table className="w-full min-w-[760px] text-sm">
        <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Shift</th><th className="pr-3">In</th><th className="pr-3">Out</th><th className="pr-3">Late</th><th className="pr-3">Status</th><th /></tr></thead>
        <tbody>{shown.filter((row) => row.status !== 'off').map((row) => <>
          <tr key={row.id} className="border-t border-slate-100">
            <td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code}</p></td>
            <td className="pr-3"><span className="font-mono text-xs font-bold text-[#0b587b]">{newCode(row.shift)}</span> <span className="text-xs text-slate-500">{row.startTime && `${row.startTime}–${row.endTime}`}</span>{(row.creditHours || 0) > 0 && <span className="ml-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Credit {row.creditHours}h</span>}</td>
            <td className="pr-3 font-medium">{row.inTime || '—'}</td><td className="pr-3 font-medium">{row.outTime || '—'}</td>
            <td className="pr-3">{row.lateCounted > 0 ? <span className="font-semibold text-amber-700">{row.lateCounted} min</span> : row.late > 0 ? <span className="text-slate-400">{row.late} min (grace)</span> : '—'}</td>
            <td className="pr-3">{badge(row.status)}</td>
            <td className="text-right">{!source && <button onClick={() => void details(row.id)} className="text-xs font-semibold text-[#0b587b] hover:underline">{open === row.id ? 'Hide' : 'Clocks'}</button>}</td>
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
              <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Credit hours for {dayName(date)}</span>{credit && credit.balanceMinutes !== null && <span className="font-semibold text-violet-700">Balance {hoursText(credit.balanceMinutes)}</span>}{credit && <span className="text-slate-500">{credit.usedThisYear} h used this year · not taken off Annual Leave</span>}</div>
                {credit && credit.uses.length > 0 && <ul className="space-y-1">{credit.uses.map((use) => <li key={use.id} className="flex flex-wrap items-center gap-x-2"><span className="font-semibold text-violet-700">{use.hours} h</span> {use.kind === 'late' ? 'late arrival' : 'early leave'}{use.note && ` · ${use.note}`}<button onClick={() => void useCredit(() => api('action=attendance_credit_use_delete', { useId: use.id }), row.id)} className="ml-1 font-semibold text-rose-700 hover:underline">Remove</button></li>)}</ul>}
                <div className="flex flex-wrap items-center gap-2">
                  <select value={useForm.kind} onChange={(event) => setUseForm({ ...useForm, kind: event.target.value as 'late' | 'early' })} aria-label="Late arrival or early leave" className={field}><option value="late">Came in late</option><option value="early">Left early</option></select>
                  <input type="number" min="0.25" max="12" step="0.25" value={useForm.hours} onChange={(event) => setUseForm({ ...useForm, hours: event.target.value })} placeholder="Hours" aria-label="Hours of credit" className={`${field} w-24`} />
                  <input value={useForm.note} onChange={(event) => setUseForm({ ...useForm, note: event.target.value })} placeholder="Reason (optional)" maxLength={200} className={`${field} w-48`} aria-label="Reason" />
                  <button onClick={() => void useCredit(() => api('action=attendance_credit_use_add', { id: row.id, date, kind: useForm.kind, hours: Number(useForm.hours), note: useForm.note, alreadyCounted: useForm.counted }), row.id)} disabled={!(Number(useForm.hours) > 0)} className={button}>Record credit hours</button></div>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={useForm.counted || date < '2026-11-04'} disabled={date < '2026-11-04'} onChange={(event) => setUseForm({ ...useForm, counted: event.target.checked })} />{date < '2026-11-04' ? 'Before 4 Nov: the balance is not touched' : 'Already taken off in the Excel balance (do not deduct again)'}</label>
              </div>
            </>}</td></tr>}
        </>)}</tbody>
      </table>}
      {rows && !shown.filter((row) => row.status !== 'off').length && <p className="py-4 text-sm text-slate-500">Nobody is expected on this date.</p>}
    </section>
  </div>;
}

function Month({ onError, source }: { onError: (message: string) => void; source?: Source }) {
  const api: Source & typeof hrApi = (source as typeof hrApi) || hrApi;
  const [month, setMonth] = useState(monthOf(new Date()));
  const [data, setData] = useState<{ rows: MonthRow[]; noRecord?: string[]; rules: { lateGrace: number; otMin: number } } | null>(null);
  useEffect(() => { setData(null); api(`action=attendance_month&month=${month}`).then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => { setData({ rows: [], rules: { lateGrace: 0, otMin: 0 } }); onError(cause.message); }); }, [month]);
  const csv = () => {
    if (!data) return;
    const head = ['Company', 'Code', 'Name', 'Expected days', 'Present days', 'Absent days', 'Leave days', 'Late days', 'Late minutes', 'Worked hours', 'OT approved hours', 'OT waiting hours'];
    const lines = data.rows.map((row) => [row.company, row.code, row.name, row.expected, row.present, row.absent, row.leave, row.lateDays, row.lateMinutes, (row.workedMinutes / 60).toFixed(2), (row.otApprovedMinutes / 60).toFixed(2), (row.otWaitingMinutes / 60).toFixed(2)]);
    const body = [head, ...lines].map((line) => line.map(csvCell).join(',')).join('\n');
    downloadBlob([body], `attendance-${month}.csv`, 'text/csv');
  };
  return <div className="space-y-4">
    <MonthBar month={month} setMonth={setMonth}><button onClick={csv} disabled={!data?.rows.length} className={`${ghost} ml-auto`}><Download className="h-4 w-4" />Download CSV</button></MonthBar>
    {data && (data.noRecord || []).length > 0 && <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">No record for this month ({(data.noRecord || []).join(' and ')}).</p>}
    {source && data && <ul className="space-y-2 sm:hidden">{data.rows.filter((row) => row.expected || row.present).map((row) => <li key={row.id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <p className="text-[13px] font-semibold leading-tight text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code}{row.exempt > 0 && ' · clocking optional'}</p>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">{([['Expected', String(row.expected), ''], ['Present', String(row.present), ''], ['Absent', row.absent ? String(row.absent) : '—', row.absent ? 'text-rose-700' : ''], ['Leave', row.leave ? String(row.leave) : '—', ''], ['Late', row.lateDays ? `${row.lateDays}×` : '—', row.lateDays ? 'text-amber-700' : ''], ['Worked', row.workedMinutes ? hours(row.workedMinutes) : '—', ''], ['OT ok', row.otApprovedMinutes ? hours(row.otApprovedMinutes) : '—', 'text-emerald-700'], ['OT wait', row.otWaitingMinutes ? hours(row.otWaitingMinutes) : '—', row.otWaitingMinutes ? 'text-amber-700' : '']] as const).map(([label, value, tone]) => <div key={label} className="rounded-lg bg-slate-50 px-1 py-1.5"><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className={`text-[12px] font-semibold ${tone}`}>{value}</p></div>)}</div>
      {row.missingOut > 0 && <p className="mt-1.5 text-[11px] text-amber-600">{row.missingOut} no clock out</p>}{row.lateDays > 0 && <p className="mt-0.5 text-[11px] text-slate-500">Late {row.lateMinutes} min in total</p>}
    </li>)}</ul>}
    <section className={`${card} overflow-x-auto${source ? ' hidden sm:block' : ''}`}>
      {!data ? <p className="text-sm text-slate-500">Loading…</p> : <table className="w-full min-w-[900px] text-sm">
        <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3 text-right">Expected</th><th className="pr-3 text-right">Present</th><th className="pr-3 text-right">Absent</th><th className="pr-3 text-right">Leave</th><th className="pr-3 text-right">Late</th><th className="pr-3 text-right">Worked</th><th className="pr-3 text-right">OT approved</th><th className="text-right">OT waiting</th></tr></thead>
        <tbody>{data.rows.filter((row) => row.expected || row.present).map((row) => <tr key={row.id} className="border-t border-slate-100">
          <td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code}{row.exempt > 0 && ' · clocking optional'}</p></td>
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

// OT is now asked for by staff (the Requests below). From the clocks we only raise an alert: extra time that nobody has asked for yet,
// so HR can check whether the person did overtime and ask them to apply. Nothing is approved from here.
function OtAlerts({ onError }: { onError: (message: string) => void }) {
  const [month, setMonth] = useState(monthOf(new Date()));
  const [allRows, setRows] = useState<OtRow[] | null>(null);
  const [group, setGroup] = useState('');
  const rows = allRows && allRows.filter((row) => !group || row.group === group);
  useEffect(() => {
    let live = true; setRows(null);
    Promise.all([api(`action=attendance_ot&month=${month}`), api('action=attendance_requests&status=all')]).then(([ot, requests]) => {
      if (ot.error) throw new Error(ot.error);
      const asked = new Set<string>(((requests.requests || []) as Req[]).filter((request) => request.status !== 'cancelled').map((request) => `${request.employeeId}|${request.date}`));
      if (live) setRows((ot.rows as OtRow[]).filter((row) => !row.status && !asked.has(`${row.id}|${row.date}`)));
    }).catch((cause: Error) => { if (live) { setRows([]); onError(cause.message); } });
    return () => { live = false; };
  }, [month]);
  return <section className={`${card} space-y-3`}>
    <MonthBar month={month} setMonth={setMonth}><select aria-label="Staff group" value={group} onChange={(event) => setGroup(event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All staff</option><option value="CA">CA</option><option value="Others">Others</option></select>{rows && <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${rows.length ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{rows.length ? `${rows.length} possible OT without a request` : 'No unreported extra time'}</span>}</MonthBar>
    <p className="text-sm text-slate-500">Alert only: these staff clocked extra time (before the shift, after it ended, or on a day off) but have not applied for OT. Check whether it was overtime and ask them to apply. Doctors have no OT.</p>
    {!rows ? <p className="text-sm text-slate-500">Loading…</p> : rows.length > 0 && <table className="w-full min-w-[640px] text-sm">
      <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Date</th><th className="pr-3">Staff</th><th className="pr-3">Shift</th><th className="pr-3">Clocks</th><th>Extra time</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={`${row.id}|${row.date}`} className="border-t border-slate-100">
        <td className="py-2.5 pr-3 font-medium">{dayName(row.date)}</td>
        <td className="pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code}</p></td>
        <td className="pr-3 text-xs"><span className="font-mono font-bold text-[#0b587b]">{row.shift ? newCode(row.shift) : 'Day off'}</span></td>
        <td className="pr-3">{row.inTime} → {row.outTime}</td>
        <td className="font-semibold text-amber-700">{hours(row.captured)}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

const monthEndOf = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
function Requests({ onError, kind }: { onError: (message: string) => void; kind: 'ot' | 'missed' }) {
  // Everything is listed (waiting, approved, rejected, cancelled); the filters narrow it down.
  const all = true;
  const [requests, setRequests] = useState<Req[] | null>(null);
  const [busy, setBusy] = useState('');
  // This tab shows only the requests that belong to it: a missed clock (forgot to clock in or out), or OT / a rest-day request.
  const [monthFilter, setMonthFilter] = useState('');
  const [payrollFilter, setPayrollFilter] = useState('');
  const [placeFilter, setPlaceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [policyOpen, setPolicyOpen] = useState(false);
  const [confirming, setConfirming] = useState('');
  const ofKind = requests && requests.filter((request) => isMissedClock(request.reason) === (kind === 'missed'));
  // The last 12 months are always on the list (so any month can be chosen), plus any month a request is in.
  const recent = Array.from({ length: 12 }, (_, index) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - index); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const months: string[] = [...new Set<string>([...recent, ...(ofKind || []).map((request) => String(request.date).slice(0, 7))])].sort().reverse();
  const PLACE_NAME: Record<string, string> = { KJ: 'Kajang', SK: 'Seri Kembangan' };
  // Both clinics are always listed, even when the list shown has requests from only one of them.
  const places: string[] = [...new Set<string>([...Object.keys(PLACE_NAME), ...(ofKind || []).map((request) => request.company || '').filter(Boolean)])].sort();
  // A payroll month runs from the 20th of the month before to the 19th (Nov payroll: 20 Oct to 19 Nov).
  const payrollRange = (value: string) => { const [year, month] = value.split('-').map(Number); const before = new Date(year, month - 2, 1); return { from: `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, '0')}-20`, to: `${value}-19` }; };
  const payrolls: string[] = recent;
  const range = payrollFilter ? payrollRange(payrollFilter) : monthFilter ? { from: `${monthFilter}-01`, to: `${monthFilter}-31` } : null;
  const shown = ofKind && ofKind.filter((request) => (!range || (request.date >= range.from && request.date <= range.to)) && (!placeFilter || request.company === placeFilter) && (!statusFilter || request.status === statusFilter));
  const load = () => { setRequests(null); api(`action=attendance_requests&status=${all ? 'all' : 'pending'}${range ? `&from=${range.from}&to=${monthFilter ? monthEndOf(monthFilter) : range.to}` : ''}`).then((result) => { if (result.error) throw new Error(result.error); setRequests(result.requests); }).catch((cause: Error) => { setRequests([]); onError(cause.message); }); };
  useEffect(load, [monthFilter, payrollFilter]);
  const decide = async (request: Req, decision: 'approved' | 'rejected') => { setBusy(request.id); try { const result = await api('action=attendance_request_decide', { id: request.id, decision }); if (result.error) throw new Error(result.error); load(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(''); } };
  const stage = (request: Req) => request.status === 'pending' ? 'Waiting for supervisor' : request.status === 'supervisor_approved' ? (request.supervisorDecidedBy ? `Supervisor approved (${request.supervisorDecidedBy}) · waiting for HR` : 'Waiting for HR') : request.status === 'approved' ? `Approved · ${request.decidedBy}${request.rate ? ` · OT ${request.rate}x` : ''}` : request.status === 'cancelled' ? 'Cancelled by staff' : `Rejected · ${request.decidedBy}`;
  return <section className={`${card} space-y-3`}>
    <div className="flex flex-wrap items-center gap-3"><select aria-label="Month" value={monthFilter} onChange={(event) => { setMonthFilter(event.target.value); setPayrollFilter(''); }} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All months</option>{months.map((value) => <option key={value} value={value}>{new Date(`${value}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</option>)}</select><select aria-label="Payroll" value={payrollFilter} onChange={(event) => { setPayrollFilter(event.target.value); setMonthFilter(''); }} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All payrolls</option>{payrolls.map((value) => { const r = payrollRange(value); const d = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); return <option key={value} value={value}>{`Payroll ${new Date(`${value}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} · ${d(r.from)} to ${d(r.to)}`}</option>; })}</select><select aria-label="Location" value={placeFilter} onChange={(event) => setPlaceFilter(event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All locations</option>{places.map((value) => <option key={value} value={value}>{PLACE_NAME[value] ? `${value} · ${PLACE_NAME[value]}` : value}</option>)}</select><select aria-label="Approval status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); }} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All statuses</option><option value="pending">Waiting for supervisor</option><option value="supervisor_approved">Waiting for HR</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select>{kind === 'ot' && <button type="button" onClick={() => setPolicyOpen(!policyOpen)} aria-expanded={policyOpen} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">OT policy {policyOpen ? '▴' : '▾'}</button>}{kind === 'missed' && <p className="order-last basis-full text-[11px] leading-4 text-slate-500 sm:order-none sm:basis-0 sm:flex-1 sm:text-sm">Staff ask for a clock they forgot (in or out) to be added. The supervisor approves first, then HR confirms here.</p>}</div>
    {kind === 'ot' && policyOpen && <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm leading-6 text-slate-600"><p className="font-semibold text-slate-800">OT policy</p><OtPolicyBody /></div>}
    {!shown ? <p className="text-sm text-slate-500">Loading…</p> : !shown.length ? <p className="text-sm text-slate-500">{all ? 'No requests yet.' : 'Nothing waiting.'}</p> : <ul className="divide-y divide-slate-100">{shown.map((request) => <li key={request.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-sm sm:py-3">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1"><p className="font-semibold">{request.name}</p><p className="text-xs text-slate-500">{dayName(request.date)} · {request.shiftCode !== undefined && <><span className="font-semibold text-[#0b587b]">{request.shiftCode ? `${newCode(request.shiftCode)} ${request.shiftStart}–${request.shiftEnd}` : 'No shift'}</span> · </>}{[(request.clockIn || request.inTime) && `in ${request.clockIn || request.inTime}`, (request.clockOut || request.outTime) && `out ${request.clockOut || request.outTime}`, (request.otShown ?? request.otMinutes) > 0 && `OT ${Math.floor((request.otShown ?? request.otMinutes) / 60)} h ${(request.otShown ?? request.otMinutes) % 60} m`].filter(Boolean).join(' · ')}</p><p className="mt-0.5 text-xs text-slate-400">{request.reason}{request.remarks && ` · ${request.remarks}`}</p>{request.otPreview && <p className="mt-0.5 text-xs font-semibold text-[#0b587b]">Pay: {request.otPreview}</p>}{request.supervisorNote && <p className="mt-0.5 text-xs text-slate-400">Supervisor: {request.supervisorNote}</p>}</div>
      {['pending', 'supervisor_approved'].includes(request.status) ? <><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">{stage(request)}</span>{confirming === request.id ? <div className="basis-full rounded-xl border border-[#0b587b]/20 bg-sky-50/60 p-3 text-sm sm:basis-auto sm:max-w-md"><p className="font-semibold text-slate-800">Confirm {isMissedClock(request.reason) ? 'this missed clock' : 'OT'} for {request.name.replace(/\s*\(.*\)$/, '')}?</p><p className="mt-1 text-xs text-slate-600">{dayName(request.date)}{request.otPreview ? ` · ${request.otPreview.replace(/^.*?\. (?=[A-Z][a-z]+ (day|holiday))/, '')}` : ''}. Payroll will use this; the clock in the request is added to the day.</p><div className="mt-2 flex gap-2"><button onClick={() => { setConfirming(''); void decide(request, 'approved'); }} disabled={busy === request.id} className={button}>Yes, confirm</button><button onClick={() => setConfirming('')} className={ghost}>Cancel</button></div></div> : <><button onClick={() => setConfirming(request.id)} disabled={busy === request.id} className={button}>Confirm</button><button onClick={() => void decide(request, 'rejected')} disabled={busy === request.id} className={ghost}>Reject</button></>}</> : <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{stage(request)}</span>}
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
  const load = () => Promise.all([api('action=attendance_people'), api('action=attendance_places'), api('action=attendance_rules')]).then(([a, b, c]) => { setPeople(a.people); setPlaces(b.places); setShifts([...new Set<string>((c.times as TimeRow[]).filter((row) => row.kind === 'staff' && !NEW_CODE[row.code]).map((row) => row.code))]); }).catch((cause: Error) => { setPeople([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);
  const save = async (person: Person) => { try { const result = await api('action=attendance_person_save', { id: person.id, mode: person.mode, placeIds: person.placeIds, clockRequired: person.clockRequired, defaultShift: person.defaultShift }); if (result.error) throw new Error(result.error); setSaved(person.id); setTimeout(() => setSaved(''), 1500); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } };
  const patch = (id: string, next: Partial<Person>) => setPeople((list) => (list || []).map((person) => person.id === id ? { ...person, ...next } : person));
  const extra = places.filter((place) => place.active);
  return <section className={`${card} overflow-x-auto`}>
    <p className="mb-3 text-sm text-slate-500">Everyone can clock at their own company's places. Add the office for admin staff who work there, or choose <em>Anywhere</em> for those who may work from home (their location is still recorded). <em>Who clocks</em>: in and out is the rule; <em>in only</em> counts the day as worked without a clock out; <em>optional</em> is for management: they can clock in and out, and nothing is counted against them if they do not. <em>Shift when not on roster</em> is only used on days a person has no roster entry, such as office staff; Clinic Assistants follow their roster shift and can leave it as it is. Staff may use different browsers or phones. Their allowed places and GPS checks still apply.</p>
    {!people ? <p className="text-sm text-slate-500">Loading…</p> : <table className="w-full min-w-[980px] text-sm">
      <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Who clocks</th><th className="pr-3">Shift when not on roster</th><th className="pr-3">Where</th><th className="pr-3">Also allowed at</th><th /></tr></thead>
      <tbody>{people.map((person) => <tr key={person.id} className="border-t border-slate-100 align-top">
        <td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{person.name}</p><p className="text-[11px] text-slate-400">{person.company} · {person.code}{person.doctor ? ' · doctor' : ''}</p></td>
        <td className="pr-3"><select value={person.clockRequired} onChange={(event) => patch(person.id, { clockRequired: event.target.value as Person['clockRequired'] })} aria-label={`Who clocks: ${person.name}`} className={field}><option value="full">In and out</option><option value="in_only">In only</option><option value="none">Optional (management)</option></select></td>
        <td className="pr-3"><select value={newCode(person.defaultShift)} onChange={(event) => patch(person.id, { defaultShift: event.target.value })} aria-label={`Shift when not on roster: ${person.name}`} className={field}><option value="">Follow roster, else office hours (AM-5)</option>{shifts.map((code) => <option key={code} value={code}>{code}</option>)}</select></td>
        <td className="pr-3"><select value={person.mode} onChange={(event) => patch(person.id, { mode: event.target.value as Person['mode'] })} aria-label={`Where ${person.name} may clock`} className={field}><option value="places">At the clinic / places</option><option value="anywhere">Anywhere (home)</option></select></td>
        <td className="pr-3">{person.mode === 'anywhere' ? <span className="text-xs text-slate-400">Not checked</span> : <div className="flex flex-wrap gap-x-3 gap-y-1">{extra.filter((place) => place.company !== person.company).map((place) => <label key={place.id} className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={person.placeIds.includes(place.id)} onChange={(event) => patch(person.id, { placeIds: event.target.checked ? [...person.placeIds, place.id] : person.placeIds.filter((id) => id !== place.id) })} />{place.name}</label>)}{!extra.filter((place) => place.company !== person.company).length && <span className="text-xs text-slate-400">—</span>}</div>}</td>
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
      <div className="grid grid-cols-3 gap-2 sm:gap-4">{([['lateGrace', 'Late grace (minutes)', 'Late grace'], ['earlyGrace', 'Early-out grace (minutes)', 'Early-out'], ['otMin', 'Smallest extra time captured (minutes)', 'Smallest OT']] as const).map(([key, label, short]) => <label key={key} className="min-w-0 text-sm"><span className="mb-1 block truncate text-[10px] text-slate-500 sm:text-sm"><span className="sm:hidden">{short} (min)</span><span className="hidden sm:inline">{label}</span></span><input value={rules[key]} onChange={(event) => setRules({ ...rules, [key]: event.target.value })} inputMode="numeric" className={`${field} w-full`} /></label>)}</div>
      <p className="text-[10.5px] leading-4 text-slate-500 sm:text-xs sm:leading-5">As in Infotech: arriving within the grace is not late; past it the full minutes late are counted, as a record for discipline (no pay is deducted). Leaving early is not counted. Extra time of at least the smallest amount is captured for HR to approve as OT.</p>
    </section>
    <section className={`${card} space-y-3`}>
      <h3 className="font-semibold">Shifts</h3>
      <p className="text-[10.5px] leading-4 text-slate-500 sm:text-sm">The start and end of each roster code. The code always shows what time it starts (AM-9 starts at 9AM, AM-12 at 12PM), the same for KJ and SK. A shift that ends before it starts runs overnight. A person with no roster is expected on their usual shift on their working weekdays.</p>
      <div className="grid gap-2">{rules.times.map((row, index) => NEW_CODE[row.code] ? null : <div key={`${row.kind}-${row.code}-${index}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm sm:gap-3">
        <span className="w-12 text-[10px] text-slate-400 sm:w-16 sm:text-xs">{row.kind === 'doctor' ? 'Doctors' : 'Staff'}</span><span className="w-11 font-mono text-[11px] font-bold text-[#0b587b] sm:w-20 sm:text-xs">{row.code}</span>
        <input type="time" value={row.start} onChange={(event) => setTime(index, { start: event.target.value })} className={`${field} w-[5.5rem] sm:w-auto`} aria-label={`${row.code} start`} /><span className="text-slate-400">–</span><input type="time" value={row.end} onChange={(event) => setTime(index, { end: event.target.value })} className={`${field} w-[5.5rem] sm:w-auto`} aria-label={`${row.code} end`} />
        {WAS[row.code] && <span className="basis-full pl-[3.75rem] text-[10px] text-slate-400 sm:basis-auto sm:pl-0 sm:text-xs">was {WAS[row.code]} in Infotech</span>}
      </div>)}</div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm sm:gap-3">
        <span className="basis-full text-[10px] text-slate-400 sm:basis-auto sm:text-xs">Add a shift</span>
        <input value={add.code} onChange={(event) => setAdd({ ...add, code: event.target.value })} placeholder="Code" className={`${field} w-20 sm:w-28`} aria-label="New shift code" />
        <select value={add.kind} onChange={(event) => setAdd({ ...add, kind: event.target.value as 'staff' | 'doctor' })} className={field} aria-label="For"><option value="staff">Staff</option><option value="doctor">Doctors</option></select>
        <input type="time" value={add.start} onChange={(event) => setAdd({ ...add, start: event.target.value })} className={`${field} w-[5.5rem] sm:w-auto`} aria-label="New shift start" /><span className="text-slate-400">–</span><input type="time" value={add.end} onChange={(event) => setAdd({ ...add, end: event.target.value })} className={`${field} w-[5.5rem] sm:w-auto`} aria-label="New shift end" />
        <button onClick={addShift} className={ghost}><Plus className="h-4 w-4" />Add</button>
      </div>
      <button onClick={() => void save()} className={button}>{saved ? 'Saved' : 'Save rules'}</button>
    </section>
  </div>;
}

type CreditRow = { id: string; company: string; code: string; name: string; designation: string; minutes: number };
type CreditEntry = { id: string; entry_date: string; minutes: number; kind: 'opening' | 'earn' | 'use' | 'adjust'; note: string; created_by: string };
const KIND_LABEL: Record<CreditEntry['kind'], string> = { opening: 'Opening balance', earn: 'Earned', use: 'Used', adjust: 'Correction' };
// Credit hours (Kredit Hrs): the hours each person has earned outside their shift and not used yet. Kept apart from Annual Leave.
function CreditHours({ onError }: { onError: (message: string) => void }) {
  const [rows, setRows] = useState<CreditRow[] | null>(null);
  const [company, setCompany] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState('');
  const [entries, setEntries] = useState<CreditEntry[] | null>(null);
  const [form, setForm] = useState({ kind: 'earn' as 'earn' | 'plus' | 'minus', hours: '', date: todayKey(), note: '' });
  const [busy, setBusy] = useState(false);
  const load = () => api('action=attendance_credit_hours_list').then((result) => { if (result.error) throw new Error(result.error); setRows(result.rows); }).catch((cause: Error) => { setRows([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);
  const loadEntries = async (id: string) => { setEntries(null); try { const result = await api(`action=attendance_credit_hours_entries&id=${id}`); if (result.error) throw new Error(result.error); setEntries(result.entries); } catch (cause) { setEntries([]); onError(cause instanceof Error ? cause.message : 'Unable to load the entries.'); } };
  const toggle = (id: string) => { if (open === id) return setOpen(''); setOpen(id); setForm({ kind: 'earn', hours: '', date: todayKey(), note: '' }); void loadEntries(id); };
  const run = async (action: () => Promise<any>, id: string) => { setBusy(true); try { const result = await action(); if (result.error) throw new Error(result.error); await Promise.all([loadEntries(id), load()]); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); } };
  const add = (id: string) => void run(async () => { const result = await api('action=attendance_credit_hours_add', { id, kind: form.kind === 'earn' ? 'earn' : 'adjust', minutes: Math.round(Number(form.hours) * 60) * (form.kind === 'minus' ? -1 : 1), date: form.date, note: form.note }); if (!result.error) setForm({ kind: 'earn', hours: '', date: todayKey(), note: '' }); return result; }, id);
  const shown = (rows || []).filter((row) => (!company || row.company === company) && `${row.name} ${row.code}`.toLowerCase().includes(query.trim().toLowerCase()));
  const total = shown.reduce((sum, row) => sum + row.minutes, 0);
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3"><div><h3 className="text-lg font-semibold">Credit hours</h3><p className="text-sm text-slate-500">Hours earned outside the shift (reset hours, a meeting, a talk) and not used yet. They are kept apart from Annual Leave. Use them from the Today tab for a late arrival or an early leave.</p></div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or code" className={`${field} ml-auto w-52`} aria-label="Search" />
      <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Company" className={field}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></div>
    {!rows ? <p className="text-sm text-slate-500">Loading…</p> : <table className="w-full min-w-[640px] text-sm">
      <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3">Balance</th><th /></tr></thead>
      <tbody>{shown.map((row) => <>
        <tr key={row.id} className="border-t border-slate-100"><td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code} · {row.designation}</p></td>
          <td className={`pr-3 font-semibold ${row.minutes > 0 ? 'text-violet-700' : 'text-slate-400'}`}>{hoursText(row.minutes)}</td>
          <td className="text-right"><button onClick={() => toggle(row.id)} className="text-xs font-semibold text-[#0b587b] hover:underline">{open === row.id ? 'Hide' : 'Open'}</button></td></tr>
        {open === row.id && <tr key={`${row.id}-open`}><td colSpan={3} className="bg-slate-50 px-3 py-3 text-xs text-slate-600">
          {!entries ? 'Loading…' : !entries.length ? <p>No entries yet.</p> : <ul className="space-y-1">{entries.map((entry) => <li key={entry.id} className="flex flex-wrap items-center gap-x-2"><span className="w-20 shrink-0 text-slate-500">{entry.entry_date}</span><span className={`w-20 shrink-0 font-semibold ${entry.minutes > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{entry.minutes > 0 ? '+' : ''}{hoursText(entry.minutes)}</span><span className="text-slate-500">{KIND_LABEL[entry.kind]}</span>{entry.note && <span>· {entry.note}</span>}{entry.kind !== 'use' && <button disabled={busy} onClick={() => void run(() => api('action=attendance_credit_hours_entry_delete', { entryId: entry.id }), row.id)} className="ml-1 font-semibold text-rose-700 hover:underline">Remove</button>}</li>)}</ul>}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3"><span className="font-semibold">Add</span>
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as 'earn' | 'plus' | 'minus' })} aria-label="Type" className={field}><option value="earn">Hours earned</option><option value="plus">Correction: add</option><option value="minus">Correction: take off</option></select>
            <input type="number" min="0.25" step="0.25" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} placeholder="Hours" aria-label="Hours" className={`${field} w-24`} />
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} aria-label="Date" className={field} />
            <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Why (e.g. meeting 17/4)" maxLength={200} aria-label="Reason" className={`${field} w-56`} />
            <button disabled={busy || !(Number(form.hours) > 0)} onClick={() => add(row.id)} className={button}>Save</button></div>
        </td></tr>}
      </>)}</tbody>
      <tfoot><tr className="border-t border-slate-200 text-xs font-semibold text-slate-600"><td className="py-2.5">{shown.length} staff</td><td colSpan={2}>Total {hoursText(total)}</td></tr></tfoot>
    </table>}
  </section>;
}

// ---- OT: Summary and Settings ----
type OtSum = { id: string; company: string; code: string; name: string; group: string; days: number; worked: number; at: Record<string, number>; hrp: number; waitingMinutes: number; waitingCount: number };
const lastMonthsList = () => Array.from({ length: 12 }, (_, index) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - index); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
const payrollWindow = (value: string) => { const [year, month] = value.split('-').map(Number); const before = new Date(year, month - 2, 1); return { from: `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, '0')}-20`, to: `${value}-19` }; };
const monthLast = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
const hm = (minutes: number) => minutes ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${Math.round(minutes % 60)} m` : ''}` : '—';
const monthLabel = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function OtSummary({ onError }: { onError: (message: string) => void }) {
  // The payroll month we are in: from the 20th it is next month's payroll.
  const now = new Date(); const current = now.getDate() >= 20 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const [payroll, setPayroll] = useState(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
  const [month, setMonth] = useState('');
  const [place, setPlace] = useState('');
  const [group, setGroup] = useState('');
  const [rows, setRows] = useState<OtSum[] | null>(null);
  const range = month ? { from: `${month}-01`, to: monthLast(month) } : payrollWindow(payroll);
  useEffect(() => {
    let live = true; setRows(null);
    api(`action=attendance_ot_summary&from=${range.from}&to=${range.to}`).then((result) => { if (result.error) throw new Error(result.error); if (live) setRows(result.rows); }).catch((cause: Error) => { if (live) { setRows([]); onError(cause.message); } });
    return () => { live = false; };
  }, [range.from, range.to]);
  const shown = rows && rows.filter((row) => (!place || row.company === place) && (!group || row.group === group));
  const total = (shown || []).reduce((sum, row) => ({ days: sum.days + row.days, worked: sum.worked + row.worked, hrp: sum.hrp + row.hrp, waiting: sum.waiting + row.waitingMinutes, at: { '1': sum.at['1'] + row.at['1'], '1.5': sum.at['1.5'] + row.at['1.5'], '2': sum.at['2'] + row.at['2'], '3': sum.at['3'] + row.at['3'] } }), { days: 0, worked: 0, hrp: 0, waiting: 0, at: { '1': 0, '1.5': 0, '2': 0, '3': 0 } });
  const exportCsv = () => {
    const head = ['Location', 'Code', 'Staff', 'Days', 'Worked (h)', 'At 1.0x (h)', 'At 1.5x (h)', 'At 2.0x (h)', 'At 3.0x (h)', 'Paid hours (x HRP)', 'Waiting (h)'];
    const lines = (shown || []).map((row) => [row.company, row.code, row.name, row.days, row.worked / 60, row.at['1'] / 60, row.at['1.5'] / 60, row.at['2'] / 60, row.at['3'] / 60, Math.round(row.hrp * 100) / 100, row.waitingMinutes / 60]);
    downloadBlob([[head, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')], `ot-summary-${range.from}-to-${range.to}.csv`, 'text/csv');
  };
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center gap-3">
      <select aria-label="Payroll" value={month ? '' : payroll} onChange={(event) => { setPayroll(event.target.value); setMonth(''); }} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>Payroll…</option>{lastMonthsList().map((value) => { const r = payrollWindow(value); return <option key={value} value={value}>{`Payroll ${monthLabel(value)} · ${shortDate(r.from)} to ${shortDate(r.to)}`}</option>; })}</select>
      <select aria-label="Month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">By payroll</option>{lastMonthsList().map((value) => <option key={value} value={value}>{`Month ${monthLabel(value)}`}</option>)}</select>
      <select aria-label="Location" value={place} onChange={(event) => setPlace(event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All locations</option><option value="KJ">KJ · Kajang</option><option value="SK">SK · Seri Kembangan</option></select>
      <select aria-label="Staff group" value={group} onChange={(event) => setGroup(event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All staff</option><option value="CA">CA</option><option value="Others">Others</option></select>
      <button onClick={exportCsv} disabled={!shown || !shown.length} className={`${ghost} ml-auto`}><Download className="h-4 w-4" />Download CSV</button>
    </div>
    <p className="text-sm text-slate-500">OT that HR has approved, from {shortDate(range.from)} to {shortDate(range.to)}, as the hours Payroll will pay at each rate. "Waiting" is OT asked for and not decided yet.</p>
    {!shown ? <p className="text-sm text-slate-500">Loading…</p> : <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([['Staff', String(shown.length)], ['OT days', String(total.days)], ['Hours worked', hm(total.worked)], ['Waiting', hm(total.waiting)]] as const).map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-lg font-bold text-slate-800">{value}</p></div>)}</div>
      {!shown.length ? <p className="text-sm text-slate-500">No OT in this period.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
        <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3 text-right">Days</th><th className="pr-3 text-right">Worked</th><th className="pr-3 text-right">1.0x</th><th className="pr-3 text-right">1.5x</th><th className="pr-3 text-right">2.0x</th><th className="pr-3 text-right">3.0x</th><th className="pr-3 text-right" title="Hours x rate: multiply by the hourly rate to get the pay">Paid hrs</th><th className="text-right">Waiting</th></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="py-2.5 pr-3"><p className="font-semibold text-slate-800">{row.name}</p><p className="text-[11px] text-slate-400">{row.company} · {row.code}</p></td><td className="pr-3 text-right">{row.days}</td><td className="pr-3 text-right">{hm(row.worked)}</td><td className="pr-3 text-right">{hm(row.at['1'])}</td><td className="pr-3 text-right">{hm(row.at['1.5'])}</td><td className="pr-3 text-right">{hm(row.at['2'])}</td><td className="pr-3 text-right">{hm(row.at['3'])}</td><td className="pr-3 text-right font-semibold text-[#0b587b]">{Math.round(row.hrp * 100) / 100}</td><td className="text-right text-amber-700">{row.waitingMinutes ? `${hm(row.waitingMinutes)} (${row.waitingCount})` : '—'}</td></tr>)}</tbody>
        <tfoot><tr className="border-t-2 border-slate-200 font-bold text-slate-800"><td className="py-2.5 pr-3">Total</td><td className="pr-3 text-right">{total.days}</td><td className="pr-3 text-right">{hm(total.worked)}</td><td className="pr-3 text-right">{hm(total.at['1'])}</td><td className="pr-3 text-right">{hm(total.at['1.5'])}</td><td className="pr-3 text-right">{hm(total.at['2'])}</td><td className="pr-3 text-right">{hm(total.at['3'])}</td><td className="pr-3 text-right text-[#0b587b]">{Math.round(total.hrp * 100) / 100}</td><td className="text-right text-amber-700">{hm(total.waiting)}</td></tr></tfoot>
      </table></div>}
      <p className="text-[11px] leading-4 text-slate-400">Paid hrs = hours x rate (for example 8 h at 2.0x = 16). Multiply by a person's hourly rate (HRP) for the pay; Payroll does this.</p>
    </>}
  </section>;
}

type OtPolicyForm = Record<string, string>;
function OtSettings({ onError }: { onError: (message: string) => void }) {
  const [form, setForm] = useState<OtPolicyForm | null>(null);
  const [defaults, setDefaults] = useState<OtPolicyForm | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<{ from: string; policy: Record<string, number> }[]>([]);
  const [asking, setAsking] = useState(false);
  const [from, setFrom] = useState('');
  const [today, setToday] = useState('');
  const toForm = (policy: Record<string, number>) => Object.fromEntries(Object.entries(policy).map(([key, value]) => [key, String(value)]));
  useEffect(() => { api('action=attendance_ot_policy').then((result) => { if (result.error) throw new Error(result.error); setForm(toForm(result.policy)); setDefaults(toForm(result.defaults)); setVersions(result.versions || []); setToday(result.today); setFrom(result.today); }).catch((cause: Error) => onError(cause.message)); }, []);
  if (!form || !defaults) return <p className="text-sm text-slate-500">Loading…</p>;
  const changed = Object.keys(defaults).filter((key) => form[key] !== defaults[key]);
  const set = (key: string, value: string) => { setForm({ ...form, [key]: value }); setMessage(''); };
  const save = async (reset = false) => {
    setBusy(true); setMessage('');
    try {
      const result = await api('action=attendance_ot_policy_save', reset ? { reset: true } : { policy: form, from });
      if (result.error) throw new Error(result.error);
      setForm(toForm(result.policy)); setVersions(result.versions || []); setAsking(false);
      setMessage(reset ? 'Back to the memo settings.' : `Saved. The new settings start from ${new Date(`${from}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`);
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); } finally { setBusy(false); }
  };
  const dateText = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const number = (key: string, label: string, unit: string, hint?: string) => <label key={key} className="block text-sm"><span className="mb-1 block text-slate-600">{label}</span><span className="flex items-center gap-2"><input type="number" inputMode="numeric" value={form[key]} onChange={(event) => set(key, event.target.value)} className={`${field} w-24`} /><span className="text-xs text-slate-400">{unit}{form[key] !== defaults[key] ? ` · memo: ${defaults[key]}` : ''}</span></span>{hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}</label>;
  // The cells of the rate tables (the same two tables as in the memo): a rate to choose, or a number of hours.
  const selectClass = "h-8 w-[5.5rem] rounded-lg border border-slate-200 bg-white px-1 text-center text-xs font-semibold sm:w-28 sm:text-sm";
  // A pay per hour is shown as in the memo: "1.5 x HRP". A fixed amount for a day is shown as "0.5 x ORP" (hours x rate / 8); the rate behind it is one of Payroll's four.
  const hrp = (key: string) => <select aria-label={key} value={form[key]} onChange={(event) => set(key, event.target.value)} className={selectClass}>{['1', '1.5', '2', '3'].map((value) => <option key={value} value={value}>{`${Number(value)} x HRP`}</option>)}</select>;
  const orpBox = (hoursKey: string, rateKey: string) => <select aria-label={rateKey} value={form[rateKey]} onChange={(event) => set(rateKey, event.target.value)} className={selectClass}>{['1', '1.5', '2', '3'].map((value) => <option key={value} value={value}>{`${Math.round(Number(form[hoursKey]) * Number(value) / 8 * 100) / 100} x ORP`}</option>)}</select>;
  const hoursBox = (key: string) => <input aria-label={key} type="number" inputMode="numeric" value={form[key]} onChange={(event) => set(key, event.target.value)} className="h-8 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-xs font-semibold sm:w-16 sm:text-sm" />;
  const cell = 'border border-slate-300 p-1 align-middle sm:p-2';
  const afterHours = Number(form.restAfterMinutes) / 60;
  return <div className="space-y-4">
    <section className={`${card} space-y-4`}>
      <div><h3 className="font-semibold">How OT is counted</h3><p className="mt-1 text-sm text-slate-500">Starts as the memos say (5 Aug and 10 Nov 2026). Change a value here if the policy changes. It applies to OT confirmed after you save; OT already confirmed keeps the pay it was given.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        {number('minMinutes', 'Smallest OT', 'minutes', 'Less than this is not OT.')}
        {number('roundMinutes', 'OT is counted in blocks of', 'minutes', '60 = whole hours, rounded down.')}
        {number('restMinutes', 'Rest taken off', 'minutes', 'A rest the staff are not paid for.')}
        {number('restAfterMinutes', 'Taken off when more than', 'minutes worked', Number.isFinite(afterHours) ? `= more than ${Math.round(afterHours * 100) / 100} hours` : '')}
      </div>
    </section>
    <section className={`${card} space-y-4`}>
      <div><h3 className="font-semibold">Rates and hours</h3><p className="mt-1 text-sm text-slate-500">The same tables as the memo. Payroll has four rates (1.0x, 1.5x, 2.0x, 3.0x). A fixed amount for a day is hours at a rate: 4 hours at 1.0x is half a day (0.5 x ORP), 8 hours at 2.0x is 2 x ORP.</p></div>
      <div className="overflow-hidden rounded-xl border border-slate-300">
        <table className="w-full table-fixed border-collapse text-center text-[10px] leading-tight sm:text-xs">
          <thead><tr><th className={`${cell} bg-amber-400 text-slate-900`}>Hours of work</th><th className={`${cell} bg-green-200 text-slate-900`}>Normal Day</th><th className={`${cell} bg-green-300 text-slate-900`}>Off Day</th></tr></thead>
          <tbody className="text-slate-700">
            <tr><td className={`${cell} font-semibold`}>Complete shift</td><td className={cell}>Normal rate</td><td rowSpan={2} className={cell}><div className="flex flex-col items-center gap-1">{hrp('offRate')}<span className="text-slate-400">per hour</span></div></td></tr>
            <tr><td className={`${cell} font-semibold`}>After complete shift</td><td className={cell}><div className="flex flex-col items-center gap-1">{hrp('normalRate')}<span className="text-slate-400">per hour</span></div></td></tr>
          </tbody>
        </table>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-300">
        <table className="w-full table-fixed border-collapse text-center text-[10px] leading-tight sm:text-xs">
          <thead><tr><th className={`${cell} bg-amber-400 text-slate-900`}>Hours of work</th><th className={`${cell} bg-sky-300 text-slate-900`}>Rest Day</th><th className={`${cell} bg-orange-300 text-slate-900`}>Public Holiday</th></tr></thead>
          <tbody className="text-slate-700">
            <tr><td className={`${cell} font-semibold`}><div className="flex flex-wrap items-center justify-center gap-1">First {hoursBox('restHalfHours')} hours</div></td><td className={cell}><div className="flex flex-col items-center gap-1">{orpBox('restHalfHours', 'restHalfRate')}</div></td><td rowSpan={2} className={cell}><div className="flex flex-col items-center gap-1"><span>first {hoursBox('phHours')} hours</span>{orpBox('phHours', 'phRate')}</div></td></tr>
            <tr><td className={`${cell} font-semibold`}><div className="flex flex-wrap items-center justify-center gap-1">Next <input aria-label="Next hours" type="number" inputMode="numeric" value={Number.isFinite(Number(form.restFullHours) - Number(form.restHalfHours)) ? String(Number(form.restFullHours) - Number(form.restHalfHours)) : ''} onChange={(event) => set('restFullHours', String(Number(form.restHalfHours) + Number(event.target.value)))} className="h-8 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-xs font-semibold sm:w-16 sm:text-sm" /> hours</div></td><td className={cell}><div className="flex flex-col items-center gap-1">{orpBox('restFullHours', 'restFullRate')}</div></td></tr>
            <tr><td className={`${cell} font-semibold`}>After {form.restFullHours} hours</td><td className={cell}><div className="flex flex-col items-center gap-1">{hrp('restExtraRate')}<span className="text-slate-400">per hour</span></div></td><td className={cell}><div className="flex flex-col items-center gap-1">{hrp('phExtraRate')}<span className="text-slate-400">per hour</span></div></td></tr>
          </tbody>
        </table>
      </div>
      {changed.length > 0 && <p className="text-xs text-amber-700">{changed.length} value{changed.length === 1 ? '' : 's'} differ from the memo: {changed.map((key) => `${key} (memo ${defaults[key]})`).join(', ')}.</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button onClick={() => { setFrom(today); setAsking(true); }} disabled={busy} className={button}>Save settings</button>
        <button onClick={() => void save(true)} disabled={busy} className={ghost}>Back to the memo</button>
        {message && <span className="text-sm font-semibold text-emerald-700">{message}</span>}
      </div>
    </section>
    {versions.length > 1 && <section className={`${card} space-y-2`}><h3 className="font-semibold">Settings by date</h3><ul className="divide-y divide-slate-100 text-sm">{versions.map((version, index) => { const next = versions[index + 1]; const active = version.from <= today && (!next || next.from > today); return <li key={version.from || 'start'} className="flex flex-wrap items-center gap-2 py-2"><span className="font-semibold text-slate-800">{version.from ? `From ${dateText(version.from)}` : 'Before that (the memo)'}</span>{active && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">in force now</span>}{version.from > today && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">starts later</span>}<span className="text-xs text-slate-400">{Object.keys(defaults).filter((key) => String(version.policy[key]) !== defaults[key]).length} value(s) differ from the memo</span></li>; })}</ul><p className="text-[11px] text-slate-400">OT dated on or after a date uses the settings from that date. Going back to the memo clears all of these.</p></section>}
    <section className={`${card} space-y-3`}><h3 className="font-semibold">The policy in the memos</h3><div className="space-y-3 text-sm leading-6 text-slate-600"><OtPolicyBody /></div></section>
    {asking && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Start date of the new OT settings">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <div><h3 className="text-lg font-semibold text-slate-900">Change the OT settings from when?</h3><p className="mt-1 text-sm text-slate-500">OT dated <b>on or after</b> this day will use the new settings. OT before it keeps the old settings, and OT that is already confirmed keeps its pay.</p></div>
        <label className="block text-sm"><span className="mb-1 block text-slate-600">New settings start from</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${field} w-full`} /></label>
        {from && today && from < today && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">This date is in the past. Requests for that period that are still waiting will be counted with the new settings when you confirm them. Pay that is already confirmed does not change.</p>}
        {changed.length > 0 && <p className="text-xs text-slate-500">{changed.length} value{changed.length === 1 ? '' : 's'} differ from the memo.</p>}
        <div className="flex justify-end gap-2"><button onClick={() => setAsking(false)} disabled={busy} className={ghost}>Cancel</button><button onClick={() => void save()} disabled={busy || !from} className={button}>Save from this date</button></div>
      </div>
    </div>}
  </div>;
}

function OtArea({ onError, badges }: { onError: (message: string) => void; badges?: number }) {
  const [sub, setSub] = useState<'requests' | 'summary' | 'settings'>('requests');
  return <div className="space-y-5">
    <SubTabs active={sub} onSelect={setSub} tabs={[{ id: 'requests' as const, label: 'Requests', badge: badges || 0 }, { id: 'summary' as const, label: 'Summary' }, { id: 'settings' as const, label: 'Settings' }]} />
    {sub === 'requests' && <><Requests onError={onError} kind="ot" /><OtAlerts onError={onError} /></>}
    {sub === 'summary' && <OtSummary onError={onError} />}
    {sub === 'settings' && <OtSettings onError={onError} />}
  </div>;
}

export function HRAttendance({ onError, badges = {} }: { onError: (message: string) => void; badges?: { ot?: number; missed?: number } }) {
  const [tab, setTab] = useState<Tab>('today');
  const tabs: [Tab, string][] = [['today', 'Today'], ['month', 'Month'], ['ot', 'OT'], ['missed', 'Missed clock'], ['late', 'Late'], ['credit', 'Credit hrs'], ['import', 'Import'], ['places', 'Places'], ['staff', 'Staff'], ['rules', 'Rules']];
  return <div className="text-compact mx-auto max-w-[1500px] space-y-3 sm:space-y-5">
    <SubTabs active={tab} onSelect={setTab} tabs={tabs.map(([key, label]) => ({ id: key, label, short: key === 'missed' ? 'Missed' : key === 'credit' ? 'Credit' : undefined, badge: key === 'ot' ? badges.ot : key === 'missed' ? badges.missed : 0 }))} />
    {tab === 'today' && <Today onError={onError} />}
    {tab === 'month' && <Month onError={onError} />}
    {tab === 'ot' && <OtArea onError={onError} />}
    {tab === 'missed' && <Requests onError={onError} kind="missed" />}
    {tab === 'late' && <Late onError={onError} />}
    {tab === 'credit' && <CreditHours onError={onError} />}
    {tab === 'import' && <Import onError={onError} />}
    {tab === 'places' && <Places onError={onError} />}
    {tab === 'staff' && <Staff onError={onError} />}
    {tab === 'rules' && <Rules onError={onError} />}
  </div>;
}

// Reuse the same report views in the central HR Reports page.
export { Today as AttendanceDailyReport, Month as AttendanceMonthlyReport, Late as AttendanceLateReport };
