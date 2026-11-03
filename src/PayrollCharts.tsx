import { useEffect, useMemo, useState } from 'react';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';

// Twelve months of head count, joiners/leavers and payroll cost, as in Infotech's payroll dashboard. Plain SVG, no chart library.
type Trend = { months: string[]; cost: Record<string, number[]>; paidStaff?: number[]; headcount: number[]; joined: number[]; left: number[] };
type Series = { name: string; color: string; values: number[] };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;
const COST: { key: string; name: string; color: string; on: boolean }[] = [
  { key: 'gross', name: 'Gross wages', color: '#0b87b8', on: true }, { key: 'net', name: 'Nett wages', color: '#d9622b', on: true }, { key: 'basic', name: 'Basic wages', color: '#e0457b', on: true },
  { key: 'allowance', name: 'Allowance', color: '#e8b400', on: true }, { key: 'ot', name: 'OT amount', color: '#f0963c', on: true }, { key: 'pcb', name: 'MTD / PCB', color: '#6a1b9a', on: true },
  { key: 'kwspEmployee', name: 'Employee EPF', color: '#8a6d00', on: true }, { key: 'kwspEmployer', name: 'Employer EPF', color: '#7a0f0f', on: true }, { key: 'socsoEmployee', name: 'Employee SOCSO', color: '#1a237e', on: true },
  { key: 'socsoEmployer', name: 'Employer SOCSO', color: '#6b6b1a', on: true }, { key: 'eisEmployee', name: 'Employee EIS', color: '#1b8a6b', on: true }, { key: 'eisEmployer', name: 'Employer EIS', color: '#2e7d32', on: true },
];
const niceMax = (value: number) => { if (value <= 0) return 1; const power = 10 ** Math.floor(Math.log10(value)); const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value)! * power; return step; };

function LineChart({ months, series, money, minZero = true }: { months: string[]; series: Series[]; money?: boolean; minZero?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900, H = 300, L = 62, R = 16, T = 14, B = 44;
  const all = series.flatMap((item) => item.values);
  const lo = minZero ? 0 : Math.floor(Math.min(...all, 0)), hi = niceMax(Math.max(...all, 1));
  const x = (index: number) => L + (months.length === 1 ? (W - L - R) / 2 : index * (W - L - R) / (months.length - 1));
  const y = (value: number) => T + (hi - value) / (hi - lo || 1) * (H - T - B);
  const ticks = [0, 1, 2, 3, 4].map((step) => lo + (hi - lo) * step / 4);
  const fmt = (value: number) => money ? value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value)) : String(Math.round(value * 10) / 10);
  return <div className="relative">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className="w-full" onMouseLeave={() => setHover(null)}>
      {ticks.map((tick) => <g key={tick}><line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" /><text x={L - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#64748b">{fmt(tick)}</text></g>)}
      {months.map((month, index) => <text key={month} x={x(index)} y={H - 14} textAnchor="middle" fontSize="11" fill="#64748b">{label(month)}</text>)}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="3 3" />}
      {series.map((item) => <g key={item.name}><polyline fill="none" stroke={item.color} strokeWidth="2" points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />{item.values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r={hover === index ? 4.5 : 3} fill={item.color} />)}</g>)}
      {months.map((month, index) => <rect key={month} x={x(index) - (W - L - R) / (months.length * 2)} y={T} width={(W - L - R) / months.length} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} />)}
    </svg>
    {hover !== null && <div className="pointer-events-none absolute right-2 top-2 max-h-[260px] overflow-hidden rounded-lg bg-slate-800/95 px-3 py-2 text-[11px] leading-5 text-white shadow-lg"><p className="font-semibold">{label(months[hover])}</p>{series.map((item) => <p key={item.name}><span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: item.color }} />{item.name}: {money ? item.values[hover].toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.values[hover]}</p>)}</div>}
    <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">{series.map((item) => <span key={item.name}><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: item.color }} />{item.name}</span>)}</div>
  </div>;
}

export function PayrollCharts({ compact = false }: { compact?: boolean }) {
  const [company, setCompany] = useState('');
  const [data, setData] = useState<Trend | null>(null);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(COST.filter((item) => item.on).map((item) => item.key)));
  useEffect(() => {
    let live = true; setData(null); setError('');
    officeFetch(`/api/status?resource=hr&action=payroll_trend${company ? `&company=${company}` : ''}`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); if (live) setData(result); }).catch((cause: Error) => { if (live) setError(cause.message || 'Unable to load the charts.'); });
    return () => { live = false; };
  }, [company]);
  const costSeries = useMemo(() => COST.filter((item) => picked.has(item.key)).map((item) => ({ name: item.name, color: item.color, values: data?.cost[item.key] || [] })), [data, picked]);
  const hasCost = (data?.paidStaff || []).some((count) => count > 0);
  const toggle = (key: string) => setPicked((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-lg font-semibold tracking-tight">Payroll charts</h3><p className="text-xs text-slate-500">Last 12 months. Head count and joiners / leavers come from Staff Profile dates; payroll cost comes from the payslips.</p></div>
      <div className="flex gap-2"><select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Company" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><option value="">KJ and SK</option><option>KJ</option><option>SK</option></select></div>
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {!data && !error && <p className="text-sm text-slate-500">Loading…</p>}
    {data && <>
      <div className={`grid gap-4 ${compact ? 'xl:grid-cols-2' : 'lg:grid-cols-2'}`}>
        <div className={card}><h4 className="mb-2 text-center text-sm font-semibold">Monthly head count</h4><LineChart months={data.months} money={false} minZero={false} series={[{ name: 'Head count', color: '#e0457b', values: data.headcount }]} /></div>
        <div className={card}><h4 className="mb-2 text-center text-sm font-semibold">Joiners vs leavers</h4><LineChart months={data.months} money={false} series={[{ name: 'Joined', color: '#e0457b', values: data.joined }, { name: 'Left', color: '#f0963c', values: data.left }]} /></div>
      </div>
      <div className={card}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Monthly payroll cost (RM)</h4><button type="button" onClick={() => setShow(!show)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0b587b]">{show ? 'Hide amounts' : 'Show amounts'}</button></div>
        <div className="mb-3 flex flex-wrap gap-1.5">{COST.map((item) => <button key={item.key} type="button" onClick={() => toggle(item.key)} aria-pressed={picked.has(item.key)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${picked.has(item.key) ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-500'}`} style={picked.has(item.key) ? { background: item.color } : undefined}>{item.name}</button>)}</div>
        {!show ? <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Amounts are hidden. Press Show amounts to see the chart.</p> : !hasCost ? <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">No payslips in these months yet.</p> : <LineChart months={data.months} money series={costSeries} />}
      </div>
    </>}
  </section>;
}
