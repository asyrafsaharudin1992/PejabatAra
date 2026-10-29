import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';

// My roster inside Individual Sign In: the signed-in person's own duty roster for a month, as a calendar and a list,
// with their approved leave on top. Other people's rosters are not shown here.
type Day = { date: string; shift: string; works: boolean };
type Leave = { type: string; start: string; end: string; half: string | null };
type Data = { month: string; today: string; workDays: number[]; days: Day[]; leave: Leave[] };

const MEANING: Record<string, string> = {
  'AM-9': 'Day shift, 9AM – 9PM', 'AM-12': 'Day shift, 12PM – 9PM', 'PM': 'Night shift, 9PM – 9AM', 'AM-6': 'Day shift, 9AM – 6PM', 'AM-5': 'Office hours, 8AM – 5PM',
  'AM': 'Day shift', 'OH': 'Office hours', 'OFF': 'Off day', 'REST': 'Rest day', 'PH': 'Public holiday', 'NA': 'Not working yet', 'RESIGN': 'Resigned',
  'ASCL1': 'Day shift, 9AM – 9PM', 'ASCL2': 'Day shift, 12PM – 9PM', 'ASCL3': 'Night shift, 9PM – 9AM', 'ASCL4': 'Day shift, 9AM – 6PM', 'OD': 'Off day', 'RD': 'Rest day',
};
const monthOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (month: string, by: number) => { const [year, number] = month.split('-').map(Number); return monthOf(new Date(year, number - 1 + by, 1)); };
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Kind = 'day' | 'night' | 'office' | 'off' | 'leave' | 'holiday';
const kindOf = (shift: string, works: boolean): Kind => !works ? (shift === 'PH' ? 'holiday' : 'off') : shift === 'PM' || shift === 'ASCL3' ? 'night' : shift === 'OH' || shift === 'AM-6' || shift === 'AM-5' ? 'office' : 'day';
const TONE: Record<Kind, string> = { day: 'bg-emerald-100 text-emerald-900', night: 'bg-amber-100 text-amber-900', office: 'bg-sky-100 text-sky-900', off: 'bg-slate-100 text-slate-400', leave: 'bg-rose-100 text-rose-800', holiday: 'bg-violet-100 text-violet-800' };

export default function MyRoster() {
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setData(null); setError(''); assessmentFetch(`action=leave_roster&month=${month}`).then((result) => setData(result)).catch((cause: Error) => setError(cause.message)); }, [month]);

  const count = Number(month.slice(5)), year = Number(month.slice(0, 4));
  const dates = Array.from({ length: new Date(year, count, 0).getDate() }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
  const lead = (new Date(`${month}-01T00:00:00`).getDay() + 6) % 7;
  const rostered = new Map<string, Day>((data?.days || []).map((day): [string, Day] => [day.date, day]));
  const leaveOn = (date: string) => data?.leave.find((item) => item.start <= date && item.end >= date);
  // What the person sees for a date: approved leave first, then the roster.
  const entry = (date: string): { label: string; kind: Kind; note: string } | null => {
    const leave = leaveOn(date);
    if (leave) return { label: leave.type, kind: 'leave', note: `Leave (${leave.type})${leave.half ? `, ${leave.half}` : ''}` };
    const day = rostered.get(date);
    return day ? { label: day.shift, kind: kindOf(day.shift, day.works), note: MEANING[day.shift] || day.shift } : null;
  };
  const working = dates.map((date) => ({ date, item: entry(date) })).filter((row) => row.item && (row.item.kind === 'day' || row.item.kind === 'night' || row.item.kind === 'office'));
  const next = data ? dates.map((date) => ({ date, item: entry(date) })).find((row) => row.date >= data.today && row.item && ['day', 'night', 'office'].includes(row.item.kind)) : undefined;
  const codes = [...new Set(dates.map((date) => entry(date)).filter(Boolean).map((item) => item!.label))];
  const nav = 'grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
  const card = 'rounded-[22px] border border-black/[0.045] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.025)] sm:p-6';

  return <div className="space-y-4">
    <div className="flex items-center gap-3">
      <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className={nav}><ChevronLeft className="h-4 w-4" /></button>
      <h2 className="min-w-[160px] text-center text-lg font-semibold">{monthName(month)}</h2>
      <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className={nav}><ChevronRight className="h-4 w-4" /></button>
      {month !== monthOf(new Date()) && <button onClick={() => setMonth(monthOf(new Date()))} className="ml-auto text-sm font-semibold text-[#0b587b]">This month</button>}
    </div>
    {error && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {!data && !error && <p className="text-sm text-slate-500">Loading…</p>}
    {data && <>
      <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-b from-[#0f5478] via-[#0b3d59] to-[#082c42] p-5 text-white shadow-[0_18px_40px_rgba(11,48,70,0.25)] sm:p-6">
        <i className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Your next shift</p>
        {next ? <p className="relative mt-2 text-2xl font-semibold tracking-tight">{dayName(next.date)}<span className="ml-3 text-lg font-medium text-white/85">{next.item!.label} · {next.item!.note}</span></p> : <p className="relative mt-2 text-lg font-medium text-white/85">{working.length ? 'No more shifts on your roster this month.' : 'No shifts on your roster for this month yet.'}</p>}
        <p className="relative mt-2 text-sm text-white/70">{working.length} {working.length === 1 ? 'working day' : 'working days'} in {monthName(month)}</p>
      </section>

      <section className={`${card} overflow-x-auto`}>
        <div className="min-w-[320px]">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 sm:gap-1.5">{HEAD.map((name) => <p key={name} className="py-1">{name}</p>)}</div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {Array.from({ length: lead }, (_, index) => <div key={`lead-${index}`} />)}
            {dates.map((date) => { const item = entry(date); return <div key={date} title={item ? `${dayName(date)} · ${item.note}` : dayName(date)} className={`flex min-h-[58px] flex-col items-center justify-between rounded-xl border p-1 sm:min-h-[76px] sm:p-1.5 ${date === data.today ? 'border-[#0b587b] ring-2 ring-[#0b587b]/20' : 'border-slate-100'}`}>
              <span className={`text-[11px] font-semibold ${date === data.today ? 'text-[#0b587b]' : 'text-slate-500'}`}>{Number(date.slice(8))}</span>
              {item ? <span className={`w-full truncate rounded-md px-0.5 py-1 text-center text-[10px] font-bold sm:text-xs ${TONE[item.kind]}`}>{item.label}</span> : <span className="pb-1 text-slate-200">·</span>}
            </div>; })}
          </div>
        </div>
      </section>

      {working.length > 0 && <section className={card}>
        <h3 className="text-sm font-semibold">Your working days</h3>
        <ul className="mt-3 divide-y divide-slate-100">{working.map((row) => <li key={row.date} className="flex items-center gap-3 py-2.5 text-sm"><span className="w-28 shrink-0 font-medium">{dayName(row.date)}</span><span className={`w-14 shrink-0 rounded-md px-1 py-0.5 text-center text-xs font-bold ${TONE[row.item!.kind]}`}>{row.item!.label}</span><span className="text-slate-500">{row.item!.note}</span></li>)}</ul>
      </section>}

      {codes.length > 0 && <p className="px-1 text-xs leading-5 text-slate-500">{codes.map((code) => `${code}: ${code === 'AL' || code === 'ML' || code === 'EL' ? 'leave' : MEANING[code] || code}`).join(' · ')}</p>}
      {!data.days.length && <p className="rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600">There is no duty roster for you in {monthName(month)} yet. Until HR uploads it, your usual working days apply.</p>}
    </>}
  </div>;
}
