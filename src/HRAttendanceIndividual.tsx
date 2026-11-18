import { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { csvCell } from './lib/hrReportExport';
import { newCode } from './lib/shiftCodes';
import { card } from './AssessmentStaff';
import { PeriodPicker, type Period } from './PeriodPicker';
import { PrintPage, PrintPortal } from './PrintPortal';
import { usePrintSheet } from './IncentiveSheet';

// Office HR > Attendance > Individual: Infotech's "Individual Attendance Report With Monthly Allowance", one block for each person with every day: the clocks, the shift,
// Normal / Late / EarlyOut / Actual, OT at each rate and the reason. A last Check column marks the odd days, and "Odd days" lists who has the most, for Admin.
type Day = { date: string; shift: string; startTime: string; endTime: string; inTime: string; outTime: string; status: string; leave: string; holiday: boolean; kind: string; clocks: { id: string; kind: string; time: string }[]; inId: string; outId: string; late: number; early: number; worked: number; ot: number; otByRate: Record<string, number>; credit: number; odd: string[]; soft: string[] };
type Person = { id: string; company: string; code: string; name: string; designation: string };
type Block = { person: Person; days: Day[] };
const COMPANY: Record<string, string> = { KJ: 'KJ- HSO HEALTHCARE SDN BHD', SK: 'SK- HSO HEALTHCARE SDN BHD' };
const field = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
const dmy = (date: string) => date.split('-').reverse().join('-');
const dayName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
// Infotech writes times and durations as hours.minutes (12.02 is 12 hours 2 minutes) and always with two figures after the point.
const hmDot = (minutes: number) => `${Math.floor(minutes / 60)}.${String(minutes % 60).padStart(2, '0')}`;
const clock = (time: string) => time ? time.replace(':', '.') : '0.00';
const minutesOf = (time: string) => time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : 0;
const shiftMinutes = (day: Day) => { if (!day.startTime || !day.endTime) return 0; const a = minutesOf(day.startTime), b = minutesOf(day.endTime); return b > a ? b - a : b + 1440 - a; };
const RATES = ['1', '1.5', '2', '3'];
const nowText = () => { const d = new Date(), p = (x: number) => String(x).padStart(2, '0'); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
// The report is drawn as Infotech's own: the same columns in the same order and the same header groups. Only the Check shading (screen only) and the logo are ours.
const WIDTHS = [150, 116, 72, 72, 65, 115, 70, 95, 85, 75, 75, 75, 80, 67, 68, 70, 42, 53, 75, 75, 81, 239];
const GRID = { display: 'grid', gridTemplateColumns: WIDTHS.map((width) => `${width}fr`).join(' '), alignItems: 'center', textAlign: 'center' } as const;
const dark = 'font-bold text-[#8b1a1a]';
const otMinutes = (day: Day, rate: string) => day.otByRate[rate] || 0;
// Shift column: the shift code, RD on the rest day, OD on any other day off. Reason: leave code, ABS (absent), PH, or RES (rest day).
const shiftCell = (day: Day) => day.shift ? newCode(day.shift) : day.kind === 'rest' ? 'RD' : 'OD';
const reasonOf = (day: Day) => day.leave || (day.status === 'absent' ? 'ABS' : day.holiday ? 'PH' : !day.shift && day.kind === 'rest' ? 'RES' : '');
const money = (index: number) => <span key={index}>0.00</span>;
const sumBlocks = (blocks: Block[], pick: (day: Day) => number) => blocks.reduce((total, item) => total + item.days.reduce((inner, day) => inner + pick(day), 0), 0);

// One block of the report: the figures labelled above, a line, then the values (Total, and Grand Total at the end).
function Totals({ labels, allowance, values, caption }: { labels: string[]; allowance: string[]; values: string[]; caption: string }) {
  return <div className="mt-0">
    <div className="border-t border-slate-700" style={{ ...GRID, paddingTop: 2 }}>
      <span /><span /><span /><span /><span />
      {labels.map((label) => <span key={label} className={dark}>{label}</span>)}
      <span className="col-span-7 border-x border-t border-slate-700 text-center" style={{ gridColumn: 'span 7' }}><span className={dark}>Allowance</span></span><span />
    </div>
    <div style={GRID}><span /><span /><span /><span /><span />{labels.map((label) => <span key={label} />)}<span className="col-span-7" style={{ gridColumn: 'span 7' }}><span className="grid grid-cols-7 border-x border-slate-700">{allowance.map((label) => <span key={label} className={`${dark} text-[9px] leading-3`}>{label}</span>)}</span></span><span /></div>
    <div className="mt-0.5 border-y border-slate-700 py-1 font-bold tabular-nums" style={GRID}><span className="col-span-5 text-center" style={{ gridColumn: 'span 5' }}>{caption}</span>{values.map((value, index) => <span key={index}>{value}</span>)}{Array.from({ length: 7 }, (_, index) => money(index))}<span /></div>
  </div>;
}

function Sheet({ block, period, at, page, pages, grand }: { key?: string; block: Block; period: Period; at: string; page: number; pages: number; grand?: Block[] }) {
  const { person, days } = block;
  const sum = (pick: (day: Day) => number) => days.reduce((total, day) => total + pick(day), 0);
  const figures = [hmDot(sum(shiftMinutes)), hmDot(sum((day) => day.late)), hmDot(sum((day) => day.early)), hmDot(sum((day) => day.worked)), ...RATES.map((rate) => hmDot(sum((day) => otMinutes(day, rate)))), '0.00'];
  const grandFigures = grand ? [hmDot(sumBlocks(grand, shiftMinutes)), hmDot(sumBlocks(grand, (day) => day.worked)), hmDot(sumBlocks(grand, (day) => day.late)), hmDot(sumBlocks(grand, (day) => day.early)), ...RATES.map((rate) => hmDot(sumBlocks(grand, (day) => otMinutes(day, rate)))), '0.00'] : [];
  const edge = 'border-l border-slate-700';
  return <article className="relative bg-white p-4 text-[10.5px] text-slate-900 print:p-0">
    <img src="/forms/ara-logo-plato.png" alt="" className="absolute left-4 top-3 h-14 w-14 object-contain print:left-0" />
    <header className="text-center"><p className="text-[22px] font-bold leading-tight text-[#7a1010]">{COMPANY[person.company] || person.company}</p><p className="mt-1 text-[15px] font-bold text-[#3b82c4]">Individual Attendance Report With Monthly Allowance</p></header>
    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] border-y border-slate-500 py-1.5 text-[11px] font-bold"><span>Date : &nbsp;&nbsp;&nbsp;{at}</span><span>Period : &nbsp;&nbsp;<span className="text-[#8b1a1a]">{dmy(period.from)} To {dmy(period.to)}</span></span><span className="text-right">Page : {page} of {pages}</span></div>
    <div className="mt-2 border-t border-slate-700">
      <div style={GRID}><span /><span /><span className={`${edge} col-span-2 ${dark}`} style={{ gridColumn: 'span 2' }}>Time</span><span className={`${edge} ${dark}`} style={{ gridColumn: 'span 5' }}>Shift Details</span><span className={`${edge} ${dark}`} style={{ gridColumn: 'span 5' }}>OverTime</span><span className={`${edge} ${dark}`} style={{ gridColumn: 'span 7' }}>Allowance</span><span className={edge} /></div>
      <div className="border-b border-slate-700 pb-0.5" style={GRID}>
        <span className={`${dark} text-left`}>Date</span><span className={dark}>Day</span><span className={`${edge} ${dark}`}>In</span><span className={dark}>Out</span>
        <span className={`${edge} ${dark}`}>Shift</span><span className={dark}>Normal</span><span className={dark}>Late</span><span className={dark}>EarlyOut</span><span className={dark}>Actual</span>
        <span className={`${edge} ${dark}`}>1.0</span><span className={dark}>1.5</span><span className={dark}>2.0</span><span className={dark}>3.0</span><span className={dark}>Flat</span>
        <span className={`${edge} ${dark}`}>Attd</span><span className={dark}>Shift</span><span className={dark}>Meal</span><span className={dark}>Tran</span><span className={`${dark} text-[9px] leading-3`}>Allowa nceOth</span><span className={`${dark} text-[9px] leading-3`}>Allowa nceOth</span><span className={dark}>Health</span>
        <span className={`${edge} ${dark}`}>Reason</span>
      </div>
    </div>
    <p className="mt-1.5 font-bold"><span className="text-[#8b1a1a]">Emp Code</span> &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-emerald-700">{person.code}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span className="text-[#8b1a1a]">Name :</span> &nbsp;&nbsp;&nbsp;<span className="text-emerald-700">{person.name}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span className="text-[#8b1a1a]">Designation :</span> &nbsp;&nbsp;&nbsp;<span className="text-emerald-700">{person.designation}</span></p>
    {days.map((day) => <div key={day.date} className={`tabular-nums ${day.odd.length ? 'bg-rose-50 print:bg-transparent' : ''}`} title={[...day.odd, ...day.soft].join(', ')} style={{ ...GRID, minHeight: 15 }}>
      <span className="text-left">{dmy(day.date)}</span><span>{dayName(day.date)}</span><span>{clock(day.inTime)}</span><span>{clock(day.outTime)}</span><span>{shiftCell(day)}</span><span>{hmDot(shiftMinutes(day))}</span><span>{hmDot(day.late)}</span><span>{hmDot(day.early)}</span><span>{hmDot(day.worked)}</span>
      {RATES.map((rate) => <span key={rate}>{hmDot(otMinutes(day, rate))}</span>)}<span>0.00</span>{Array.from({ length: 7 }, (_, index) => money(index))}<span>{reasonOf(day)}</span>
    </div>)}
    <div className="mt-0.5 border-t border-slate-700" />
    <Totals labels={['Normal', 'Late', 'EarlyOut', 'Actual', 'OT 1.0', 'OT 1.5', 'OT 2.0', 'OT 3.0', 'Flat']} allowance={['Attd', 'Shift', 'Meal', 'Tran', 'AllowanceOther', 'AllowanceOther2', 'Health']} values={figures} caption="Total :" />
    <div className="mt-0 w-[48%] border border-slate-700 text-center">
      <p className="border-b border-slate-700 py-1 font-bold text-emerald-700">Monthly Allowance</p>
      <div className="grid grid-cols-[0.8fr_1fr_1fr_0.9fr_1.6fr_1.6fr] border-b border-slate-700 font-bold text-[#8b1a1a]">{['Attd', 'Health', 'Trans', 'Meal', 'AllowanceOther1', 'AllowanceOther2'].map((label, index) => <span key={label} className={`py-1.5 ${index ? 'border-l border-slate-700' : ''}`}>{label}</span>)}</div>
      <div className="grid grid-cols-[0.8fr_1fr_1fr_0.9fr_1.6fr_1.6fr] tabular-nums">{[0, 1, 2, 3, 4, 5].map((index) => <span key={index} className={`py-2 ${index ? 'border-l border-slate-700' : ''}`}>0.00</span>)}</div>
    </div>
    {grand && <div className="mt-3"><Totals labels={['Nrm', 'Actual', 'Late', 'Under', 'OT 1.0', 'OT 1.5', 'OT 2.0', 'OT 3.0', 'Flat']} allowance={['Attd', 'Shift', 'Meal', 'Tran', 'AllowanceOther1', 'AllowanceOther2', 'Health']} values={grandFigures} caption="Grand Total:" /></div>}
  </article>;
}

// ---- Update by individual: the days of one person as a grid that is edited in place, like Infotech's Update By Individual ----
const TIME = /^(\d{1,2})[.:](\d{2})$/;
const normal = (value: string) => { const m = TIME.exec(value.trim()); if (!m) return value.trim() === '' ? '' : null; const h = Number(m[1]), mm = Number(m[2]); if (h > 23 || mm > 59) return null; return h === 0 && mm === 0 ? '' : `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
const colon = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
async function post(action: string, body: unknown) {
  const response = await officeFetch(`/api/status?resource=hr&action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Unable to save.');
  return result;
}
// A time that is typed in place: it is saved when the cell is left (or Enter is pressed), and only if it changed.
function TimeCell({ value, onSave, tone }: { key?: string | number; value: string; onSave: (next: string) => void; tone: string }) {
  const [text, setText] = useState(clock(value));
  useEffect(() => { setText(clock(value)); }, [value]);
  const commit = () => { const next = normal(text); if (next === null) { setText(clock(value)); return; } if (next !== value) onSave(next); else setText(clock(value)); };
  return <input value={text} onChange={(event) => setText(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }} inputMode="decimal" aria-label="Time (hh.mm)" className={`h-6 w-full min-w-[46px] border-0 px-1 text-center tabular-nums outline-none focus:bg-white focus:ring-1 focus:ring-[#0b587b] ${tone}`} />;
}
const HEAD = ['#', 'Date', 'Day', 'Clk1N', 'Clk2N', 'Clk3N', 'Clk4N', 'In', 'Out', 'Shift', 'Reason', 'NRM', 'Actual', 'Under', 'Lateness', 'OT10', 'OT15', 'OT20', 'OT30', 'Flat', 'Attd', 'Shift', 'Meal', 'Tran', 'Health', 'Oth1', 'Oth2'];
const isInsufficient = (day: Day) => day.status === 'missing-out' || (day.clocks.length % 2 === 1 && day.status !== 'off') || (Boolean(day.inTime) !== Boolean(day.outTime));

function EditGrid({ block, staffId, filters, setFilters, notice, setNotice, onChanged, onError, onPreview, staffList, onStaff }: { block: Block; staffId: string; filters: { late: boolean; under: boolean; absent: boolean; insufficient: boolean }; setFilters: (value: { late: boolean; under: boolean; absent: boolean; insufficient: boolean }) => void; notice: string; setNotice: (value: string) => void; onChanged: () => void; onError: (message: string) => void; onPreview: () => void; staffList: { id: string; fullName: string }[]; onStaff: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const { person, days } = block;
  const any = filters.late || filters.under || filters.absent || filters.insufficient;
  const rows = days.map((day, index) => ({ day, number: index + 1 })).filter(({ day }) => !any || (filters.late && day.late > 0) || (filters.under && day.early > 0) || (filters.absent && (day.status === 'absent' || reasonOf(day) === 'ABS')) || (filters.insufficient && isInsufficient(day)));
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true); setNotice('');
    try { await work(); setNotice(done); onChanged(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); onChanged(); }
    finally { setBusy(false); }
  };
  // A clock cell: a new time on an empty cell adds a clock, a new time on a used one changes it, and clearing it removes the clock.
  const saveClock = (day: Day, index: number, value: string) => {
    const clockRow = day.clocks[index];
    if (!value) { if (!clockRow || !window.confirm(`Remove the clock at ${clockRow.time} on ${dmy(day.date)} for ${person.name}?`)) { onChanged(); return; } void run(() => post('attendance_clock_delete', { clockId: clockRow.id, note: 'Removed in Update by individual' }), 'Clock removed.'); return; }
    if (clockRow) void run(() => post('attendance_clock_update', { clockId: clockRow.id, date: day.date, time: value, note: 'Changed in Update by individual' }), 'Clock changed.');
    else void run(() => post('attendance_clock_add', { id: staffId, date: day.date, kind: 'auto', time: value, note: 'Added in Update by individual' }), 'Clock added.');
  };
  // In and Out are the day's counted in and out: they change that clock, or add one when the day has none.
  const saveIn = (day: Day, value: string) => {
    if (!value) { onChanged(); return; }
    if (day.inId) void run(() => post('attendance_clock_update', { clockId: day.inId, time: value, note: 'In changed in Update by individual' }), 'In changed.');
    else void run(() => post('attendance_clock_add', { id: staffId, date: day.date, kind: 'in', time: value, note: 'In added in Update by individual' }), 'In added.');
  };
  const saveOut = (day: Day, value: string) => {
    if (!value) { onChanged(); return; }
    if (day.outId) void run(() => post('attendance_clock_update', { clockId: day.outId, time: value, note: 'Out changed in Update by individual' }), 'Out changed.');
    else void run(() => post('attendance_clock_add', { id: staffId, date: day.date, kind: 'out', time: value, nextDay: Boolean(day.inTime) && value < day.inTime, note: 'Out added in Update by individual' }), 'Out added.');
  };
  const index = staffList.findIndex((item) => item.id === staffId);
  const step = (by: number) => { const next = staffList[index + by]; if (next) onStaff(next.id); };
  const cell = 'border border-slate-200 px-1 py-0 text-center tabular-nums whitespace-nowrap';
  const box = (checked: boolean, label: string, key: 'late' | 'under' | 'absent' | 'insufficient') => <label className="inline-flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={checked} onChange={(event) => setFilters({ ...filters, [key]: event.target.checked })} className="h-4 w-4" />{label}</label>;
  const legend = (color: string, label: string) => <span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><i className="inline-block h-3.5 w-3.5 border border-slate-300" style={{ background: color }} />{label}</span>;
  return <section className={`${card} space-y-3 print:hidden`}>
    <div className="flex flex-wrap items-center gap-3">
      <h3 className="mr-auto text-lg font-semibold">Update by individual <span className="text-sm font-normal text-slate-500">· {person.code} · {person.name}</span></h3>
      <button type="button" onClick={() => step(-1)} disabled={index <= 0} className="h-9 rounded-full border border-slate-200 px-3 text-sm font-semibold text-[#0b587b] disabled:opacity-40" aria-label="Previous staff">←</button>
      <button type="button" onClick={() => step(1)} disabled={index < 0 || index >= staffList.length - 1} className="h-9 rounded-full border border-slate-200 px-3 text-sm font-semibold text-[#0b587b] disabled:opacity-40" aria-label="Next staff">→</button>
      <button type="button" onClick={onPreview} className="h-9 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white">Preview report</button>
    </div>
    <div className="flex flex-wrap items-center gap-4">{box(filters.late, 'Late', 'late')}{box(filters.under, 'Under', 'under')}{box(filters.absent, 'Absent', 'absent')}{box(filters.insufficient, 'Insufficient clocking', 'insufficient')}
      <span className="ml-auto flex flex-wrap items-center gap-4">{legend('#e3e1f7', 'Clock / In / Out (editable)')}{legend('#f7c8f0', 'Over time')}{legend('#f3c9c4', 'Lateness and Under')}{legend('#fbe3df', 'Allowance')}</span></div>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-2.5 text-sm font-semibold text-emerald-700">{notice}</p>}
    <p className="text-xs text-slate-500">Type a time (for example 8.52 or 20.50) in a Clk, In or Out cell and press Enter. A new time on an empty cell adds a clock; clearing a Clk cell removes it. Every change is written to the audit record.</p>
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200"><table className="w-full min-w-[1500px] border-collapse text-[11px]">
      <thead className="sticky top-0 z-10 bg-slate-100"><tr>{HEAD.map((label, i) => <th key={i} className="border border-slate-200 px-1 py-1 text-center font-semibold text-slate-600">{label}</th>)}</tr></thead>
      <tbody>{rows.map(({ day, number }) => {
        const worked = day.worked > 0, odd = day.odd.length > 0;
        return <tr key={day.date} className={`${busy ? 'opacity-60' : ''}`} title={[...day.odd, ...day.soft].join(', ')}>
          <td className={`${cell} bg-slate-50 text-slate-500`}>{number}</td>
          <td className={`${cell} bg-[#fdf8b0] ${odd ? 'font-semibold text-rose-700' : ''}`}>{dmy(day.date)}</td>
          <td className={`${cell} bg-[#fdf8b0]`}>{new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}</td>
          {[0, 1, 2, 3].map((slot) => <td key={slot} className={`${cell} bg-[#e3e1f7] p-0`}><TimeCell key={`${day.date}-${slot}-${day.clocks[slot]?.id || ''}`} value={day.clocks[slot]?.time || ''} tone="bg-transparent" onSave={(value) => saveClock(day, slot, value)} /></td>)}
          <td className={`${cell} bg-[#cfc8f5] p-0`}><TimeCell value={day.inTime} tone="bg-transparent" onSave={(value) => saveIn(day, value)} /></td>
          <td className={`${cell} bg-[#cfc8f5] p-0`}><TimeCell value={day.outTime} tone="bg-transparent" onSave={(value) => saveOut(day, value)} /></td>
          <td className={cell}>{shiftCell(day)}</td><td className={`${cell} ${odd ? 'font-semibold text-rose-700' : ''}`}>{reasonOf(day)}</td>
          <td className={cell}>{worked ? colon(shiftMinutes(day)) : '0:00'}</td><td className={cell}>{colon(day.worked)}</td>
          <td className={`${cell} ${day.early ? 'bg-[#f3c9c4]' : ''}`}>{colon(day.early)}</td><td className={`${cell} ${day.late ? 'bg-[#f3c9c4]' : ''}`}>{colon(day.late)}</td>
          {RATES.map((rate) => <td key={rate} className={`${cell} ${otMinutes(day, rate) ? 'bg-[#f7c8f0]' : ''}`}>{colon(otMinutes(day, rate))}</td>)}
          <td className={cell}>0:00</td>
          {Array.from({ length: 7 }, (_, i) => <td key={i} className={`${cell} bg-[#fbe3df]`}>0.00</td>)}
        </tr>;
      })}</tbody></table></div>
    {!rows.length && <p className="text-sm text-slate-500">No days match the ticked filters.</p>}
  </section>;
}

export function HRAttendanceIndividual({ onError }: { onError: (message: string) => void }) {
  const [period, setPeriod] = useState<Period | null>(null);
  const [company, setCompany] = useState('');
  const [staffId, setStaffId] = useState('');
  const [staff, setStaff] = useState<{ id: string; fullName: string; company: string }[]>([]);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [view, setView] = useState<'edit' | 'report' | 'odd'>('edit');
  const [reload, setReload] = useState(0);
  const staffBox = useRef<HTMLSelectElement>(null);
  const [filters, setFilters] = useState({ late: false, under: false, absent: false, insufficient: false });
  const [notice, setNotice] = useState('');
  // Edit needs one person: with none chosen it asks for one (a list of names to press), instead of showing nothing.
  const shownView = view;
  useEffect(() => { if (view === 'edit' && !staffId) { const box = staffBox.current; if (box) { box.focus(); try { (box as HTMLSelectElement & { showPicker?: () => void }).showPicker?.(); } catch { /* the browser only opens it after a click */ } } } }, [view, staffId]);
  const [at, setAt] = useState('');
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    let live = true;
    officeFetch('/api/status?resource=hr&action=employees').then((response) => response.json()).then((result) => { if (live) setStaff((result.employees || []).filter((item: { status: string }) => item.status === 'Active').sort((a: { fullName: string }, b: { fullName: string }) => a.fullName.localeCompare(b.fullName))); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!period) return;
    let live = true; setBlocks(null);
    officeFetch(`/api/status?resource=hr&action=attendance_individual&from=${period.from}&to=${period.to}${staffId ? `&id=${staffId}` : ''}`).then((response) => response.json()).then((result) => {
      if (result.error) throw new Error(result.error);
      if (live) { setBlocks(result.people); setAt(nowText()); }
    }).catch((cause: Error) => { if (live) { setBlocks([]); onError(cause.message); } });
    return () => { live = false; };
  }, [period?.from, period?.to, staffId, reload]);
  usePrintSheet(printing, `Individual Attendance - ${period?.label || ''}`, () => setPrinting(false));
  const shown = (blocks || []).filter((block) => !company || block.person.company === company);
  const csv = () => {
    const head = ['Company', 'Code', 'Name', 'Date', 'Day', 'In', 'Out', 'Shift', 'Normal', 'Late', 'Early out', 'Actual', 'OT 1.0', 'OT 1.5', 'OT 2.0', 'OT 3.0', 'Reason', 'Check'];
    const lines = shown.flatMap(({ person, days }) => days.map((day) => [person.company, person.code, person.name, dmy(day.date), dayName(day.date), clock(day.inTime), clock(day.outTime), shiftCell(day), hmDot(shiftMinutes(day)), hmDot(day.late), hmDot(day.early), hmDot(day.worked), ...RATES.map((rate) => hmDot(otMinutes(day, rate))), reasonOf(day), [...day.odd, ...day.soft].join(', ')]));
    downloadBlob([[head, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')], `individual-attendance-${period?.from}-to-${period?.to}.csv`, 'text/csv');
  };
  // The odd days, worked out from the same days: strangest first.
  const oddRows = shown.map(({ person, days }) => {
    const count = (name: string) => days.filter((day) => day.odd.includes(name)).length;
    return { person, odd: days.filter((day) => day.odd.length).length, absent: count('Absent'), noOut: count('No clock out'), extra: count('Clocked on a day off'), long: count('More than 14 hours'), short: count('Less than 4 hours'), late: days.filter((day) => day.late > 0).length, early: days.filter((day) => day.early > 0).length };
  }).sort((a, b) => b.odd - a.odd || a.person.name.localeCompare(b.person.name));
  const num = (value: number) => value ? <b className="text-rose-700">{value}</b> : <span className="text-slate-300">0</span>;
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">Individual attendance</h2><p className="text-sm text-slate-500">Every day of each person, like the Infotech Individual Attendance Report. Odd days (absent, no clock out, clocked on a day off, over 14 hours, under 4 hours) are shaded and named in the Check column.</p></div>
      <PeriodPicker onChange={setPeriod} />
      <label className="text-xs font-bold text-slate-600">Company<select aria-label="Company" value={company} onChange={(event) => { setCompany(event.target.value); setStaffId(''); }} className={`${field} mt-1 block`}><option value="">KJ and SK</option><option value="KJ">KJ</option><option value="SK">SK</option></select></label>
      <label className="text-xs font-bold text-slate-600">Staff<select ref={staffBox} aria-label="Staff" value={staffId} onChange={(event) => setStaffId(event.target.value)} className={`${field} mt-1 block max-w-[240px] ${view === 'edit' && !staffId ? 'border-[#0b587b] ring-2 ring-[#0b587b]/40' : ''}`}><option value="">All staff</option>{staff.filter((item) => !company || item.company === company).map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label>
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">{([['edit', 'Edit'], ['report', 'Preview report'], ['odd', 'Odd days']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setView(id)} className={`h-8 rounded-lg px-3 text-sm font-semibold ${shownView === id ? 'bg-[#0b587b] text-white' : 'text-slate-600'}`}>{label}</button>)}</div>
      <button onClick={() => setPrinting(true)} disabled={!shown.length || shownView !== 'report'} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white disabled:opacity-50"><Printer className="h-4 w-4" />Print / PDF</button>
      <button onClick={csv} disabled={!shown.length} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0b587b] disabled:opacity-50"><Download className="h-4 w-4" />CSV</button>
    </section>
    {!blocks ? <p className="text-sm text-slate-500">Reading the records…</p> : !shown.length ? <p className={`${card} text-sm text-slate-500`}>No staff to show.</p>
      : shownView === 'edit' && !staffId ? <section className={`${card} print:hidden`}><p className="text-base font-semibold text-[#0b587b]">↑ Click the Staff box above and choose a staff member to edit.</p><p className="mt-1 text-sm text-slate-500">Their days then open here as a grid you can edit in place.</p></section>
      : shownView === 'edit' && shown[0] ? <EditGrid block={shown[0]} staffId={staffId} filters={filters} setFilters={setFilters} notice={notice} setNotice={setNotice} onChanged={() => setReload((n) => n + 1)} onError={onError} onPreview={() => setView('report')} staffList={staff.filter((item) => !company || item.company === company)} onStaff={setStaffId} />
      : shownView === 'odd' ? <section className={`${card} print:hidden`}><div className="overflow-x-auto"><table className="no-stack w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Staff</th><th className="pr-3 text-right">Odd days</th><th className="pr-3 text-right">Absent</th><th className="pr-3 text-right">No clock out</th><th className="pr-3 text-right">Day off, clocked</th><th className="pr-3 text-right">Over 14 h</th><th className="pr-3 text-right">Under 4 h</th><th className="pr-3 text-right">Late</th><th className="text-right">Early out</th></tr></thead>
        <tbody>{oddRows.map((row) => <tr key={row.person.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => { setStaffId(row.person.id); setView('edit'); }}><td className="py-2 pr-3"><span className="font-semibold text-[#0b587b]">{row.person.name}</span><span className="block text-xs text-slate-400">{row.person.code} · {row.person.company}</span></td><td className="pr-3 text-right tabular-nums">{num(row.odd)}</td><td className="pr-3 text-right tabular-nums">{num(row.absent)}</td><td className="pr-3 text-right tabular-nums">{num(row.noOut)}</td><td className="pr-3 text-right tabular-nums">{num(row.extra)}</td><td className="pr-3 text-right tabular-nums">{num(row.long)}</td><td className="pr-3 text-right tabular-nums">{num(row.short)}</td><td className="pr-3 text-right tabular-nums">{row.late || <span className="text-slate-300">0</span>}</td><td className="text-right tabular-nums">{row.early || <span className="text-slate-300">0</span>}</td></tr>)}</tbody></table></div></section>
      : <div className="space-y-6 print:hidden">{shown.map((block, index) => <div key={block.person.id} className={`${card} overflow-x-auto`}><div className="min-w-[1180px]"><Sheet block={block} period={period!} at={at} page={index + 1} pages={shown.length} grand={index === shown.length - 1 ? shown : undefined} /></div></div>)}</div>}
    {printing && <PrintPortal margin={6}>{shown.map((block, index) => <PrintPage key={block.person.id}><div className="cv-fit"><Sheet block={block} period={period!} at={at} page={index + 1} pages={shown.length} grand={index === shown.length - 1 ? shown : undefined} /></div></PrintPage>)}</PrintPortal>}
  </div>;
}
