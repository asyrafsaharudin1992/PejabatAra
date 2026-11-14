import { useEffect, useState } from 'react';
import { Table2, BarChart3, RefreshCw } from 'lucide-react';
import { BarsChart, LinesChart, COLOR, money, type Series } from './CeoChartKit';
import { PayrollCharts } from './PayrollCharts';
import { officeFetch } from './lib/officeApi';

// The CEO's Charts tab: how many people there are in each role at each clinic. The head count, joiners and leavers and the payroll cost over the
// last twelve months come from the shared payroll charts, shown below this one. Plain SVG, no chart library; the two clinics keep their colour
// (KJ blue, SK orange) wherever they appear.
type Count = { all: number; KJ: number; SK: number };
type Headcount = { doctors: Count; assistants: Count; admins: Count };
const CLINIC: { key: 'KJ' | 'SK'; name: string; color: string }[] = [{ key: 'KJ', name: 'KJ · Kajang', color: '#2a78d6' }, { key: 'SK', name: 'SK · Seri Kembangan', color: '#eb6834' }];
const ROLES: { key: keyof Headcount; name: string }[] = [{ key: 'doctors', name: 'Doctors' }, { key: 'assistants', name: 'Clinical Assistants' }, { key: 'admins', name: 'Admins' }];

export type ChartsSource = 'ceo' | 'coo' | 'hr';
const HEADCOUNT_URL: Record<ChartsSource, string> = { ceo: '/api/status?resource=coo&action=headcount', coo: '/api/status?resource=coo&action=headcount', hr: '/api/status?resource=hr&action=headcount' };
export function PeopleByRoleChart({ onError, source = 'ceo', given }: { onError: (message: string) => void; source?: ChartsSource; given?: Headcount }) {
  const [fetched, setData] = useState<Headcount | null>(null);
  const data = given || fetched;
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<{ role: number; clinic: 'KJ' | 'SK' } | null>(null);
  useEffect(() => { if (given) return; officeFetch(HEADCOUNT_URL[source]).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => onError(cause.message)); }, []);
  const W = 480, H = 210, L = 34, R = 10, T = 22, B = 36;
  const max = data ? Math.max(1, ...ROLES.flatMap((role) => CLINIC.map((clinic) => data[role.key][clinic.key]))) : 1;
  const top = Math.max(4, Math.ceil(max / 2) * 2);
  const y = (value: number) => T + (top - value) / top * (H - T - B);
  const groupWidth = (W - L - R) / ROLES.length, barWidth = 38, gap = 2;
  const ticks = [0, 1, 2, 3, 4].map((step) => Math.round(top * step / 4 * 10) / 10);
  return <section aria-label="People by role and clinic" className="max-w-[560px] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_5px_20px_rgba(20,35,59,0.03)] sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-base font-semibold tracking-tight">People by role and clinic</h3><p className="mt-0.5 text-xs text-slate-500">Active staff today. Directors are counted with the doctors.</p></div>
      <button type="button" onClick={() => setTable(!table)} aria-pressed={table} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50">{table ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}{table ? 'Show chart' : 'Show as table'}</button>
    </div>
    <ul className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">{CLINIC.map((clinic) => <li key={clinic.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: clinic.color }} aria-hidden="true" />{clinic.name}</li>)}</ul>
    {!data ? <p className="mt-6 text-sm text-slate-500">Loading…</p> : table
      ? <table className="mt-4 w-full max-w-[560px] text-left text-sm"><thead><tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-4">Role</th>{CLINIC.map((clinic) => <th key={clinic.key} className="pr-4 text-right">{clinic.key}</th>)}<th className="text-right">Total</th></tr></thead>
          <tbody>{ROLES.map((role) => <tr key={role.key} className="border-t border-slate-100 tabular-nums"><td className="py-2 pr-4 font-semibold text-[#14233b]">{role.name}</td>{CLINIC.map((clinic) => <td key={clinic.key} className="pr-4 text-right">{data[role.key][clinic.key]}</td>)}<td className="text-right font-semibold">{data[role.key].all}</td></tr>)}</tbody></table>
      : <div className="relative mt-2">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grouped bars: the number of doctors, Clinical Assistants and admins at KJ and SK" className="w-full" onMouseLeave={() => setHover(null)}>
            {ticks.map((tick) => <g key={tick}><line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth={tick === 0 ? 1.5 : 1} /><text x={L - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#64748b">{tick}</text></g>)}
            {ROLES.map((role, roleIndex) => {
              const start = L + roleIndex * groupWidth + (groupWidth - (barWidth * 2 + gap)) / 2;
              return <g key={role.key}>
                {CLINIC.map((clinic, clinicIndex) => {
                  const value = data[role.key][clinic.key];
                  const x = start + clinicIndex * (barWidth + gap), height = y(0) - y(value);
                  return <g key={clinic.key} onMouseEnter={() => setHover({ role: roleIndex, clinic: clinic.key })}>
                    {/* The bar is anchored to the baseline: rounded at the top only. */}
                    {value > 0 && <path d={`M${x},${y(0)} V${y(value) + Math.min(4, height)} a4,4 0 0 1 4,-4 h${barWidth - 8} a4,4 0 0 1 4,4 V${y(0)} Z`} fill={clinic.color} opacity={hover && (hover.role !== roleIndex || hover.clinic !== clinic.key) ? 0.55 : 1} />}
                    <text x={x + barWidth / 2} y={y(value) - 7} textAnchor="middle" fontSize="12" fontWeight="600" fill="#14233b">{value}</text>
                    <rect x={x - 1} y={T} width={barWidth + 2} height={H - T - B} fill="transparent" />
                  </g>;
                })}
                <text x={L + roleIndex * groupWidth + groupWidth / 2} y={H - 13} textAnchor="middle" fontSize="11" fontWeight="600" fill="#52514e">{role.name}</text>
              </g>;
            })}
          </svg>
          {hover && <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">{ROLES[hover.role].name} · {hover.clinic}: {data[ROLES[hover.role].key][hover.clinic]} of {data[ROLES[hover.role].key].all}</div>}
        </div>}
  </section>;
}

type Charts = { generatedAt: string; headcount: Headcount; months: string[]; leave: Record<'KJ' | 'SK', number[]>; late: Record<'KJ' | 'SK', (number | null)[]>; ot: Record<'KJ' | 'SK', (number | null)[]>; recordsFrom: Record<'KJ' | 'SK', string>;
  incentives: { claimed: number[]; approved: number[]; care: number[] }; turnover: Record<'KJ' | 'SK', (number | null)[]>; tenure: { bands: string[]; KJ: number[]; SK: number[] }; employment: { types: string[]; KJ: number[]; SK: number[] };
  pay: { perHead: Record<'KJ' | 'SK', (number | null)[]>; otShare: Record<'KJ' | 'SK', (number | null)[]> } | null; tax: { years: number[]; gross: number[]; pcb: number[]; kwsp: number[]; partial: boolean[] } | null; reviews: { submitted: number[]; pending: number[] } };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;
const clinics = (values: Record<'KJ' | 'SK', (number | null)[]>): Series[] => [{ name: 'KJ', color: COLOR.KJ, values: values.KJ }, { name: 'SK', color: COLOR.SK, values: values.SK }];
const heading = (text: string, note: string) => <div className="pt-2"><h3 className="text-lg font-semibold tracking-tight text-[#17364c]">{text}</h3><p className="text-xs text-slate-500">{note}</p></div>;

// Everything on the CEO's Charts tab: the people, time and attendance, money, and reviews. The figures come in one read from the server.
// `source` says who is looking: the CEO and HR see everything; the COO does not see pay or tax (the server leaves them out).
export function CeoChartsPage({ onError, source = 'ceo' }: { onError: (message: string) => void; source?: ChartsSource }) {
  const [data, setData] = useState<Charts | null>(null);
  const [busy, setBusy] = useState(false);
  const load = (refresh: boolean) => { setBusy(true); officeFetch(source === 'hr' ? `/api/status?resource=hr&action=charts${refresh ? '&refresh=1' : ''}` : `/api/status?resource=coo&action=ceo_charts${refresh ? '&refresh=1' : ''}`).then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => onError(cause.message)).finally(() => setBusy(false)); };
  useEffect(() => { load(false); }, []);
  if (!data) return <div className="space-y-5"><PeopleByRoleChart onError={onError} source={source} /><p className="text-sm text-slate-500">{busy ? 'Reading the figures…' : ''}</p></div>;
  const months = data.months.map(monthLabel);
  const tenureCategories = data.tenure.bands;
  const kindsInUse = data.employment.types.filter((_, index) => data.employment.KJ[index] + data.employment.SK[index] > 0);
  const yearLabels = data.tax ? data.tax.years.map((year, index) => data.tax!.partial[index] ? `${year} so far` : String(year)) : [];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>Updated {new Date(data.generatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })}. The figures are worked out once a day; press Refresh for the latest.</span>
      <button type="button" onClick={() => load(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Refresh</button></div>

    {heading('People', 'Who works in the company today, and how many leave.')}
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <PeopleByRoleChart onError={onError} source={source} given={data.headcount} />
      <BarsChart title="Length of service" note="Active staff by how long they have been with the company." categories={tenureCategories} series={[{ name: 'KJ', color: COLOR.KJ, values: data.tenure.KJ }, { name: 'SK', color: COLOR.SK, values: data.tenure.SK }]} firstColumn="Length of service" />
      <LinesChart title="Staff turnover" note="People who left in the 12 months up to each month, as a percentage of the average head count. Lower is steadier." categories={months} series={clinics(data.turnover)} format={(value) => `${value}%`} />
      {kindsInUse.length > 1 && <BarsChart title="Kind of job" note="Active staff by employment type." categories={data.employment.types} series={[{ name: 'KJ', color: COLOR.KJ, values: data.employment.KJ }, { name: 'SK', color: COLOR.SK, values: data.employment.SK }]} firstColumn="Employment type" />}
    </div>

    {heading('Time and attendance', `Leave from the approved requests. Late days and OT come from the clocks: KJ from ${monthLabel(data.recordsFrom.KJ + '-01')}, SK from ${monthLabel(data.recordsFrom.SK + '-01')}. This month is not finished.`)}
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <BarsChart title="Leave days" note="Approved leave days in each month, spread over the days each leave covers." stacked categories={months} series={clinics(data.leave)} />
      <BarsChart title="Late days" note="Days a person clocked in past the grace time. For reference only; no pay is taken off." categories={months} series={clinics(data.late)} />
      <BarsChart title="OT recorded" note="Overtime hours the clocks recorded, before HR approves them." categories={months} series={clinics(data.ot)} />
    </div>

    {heading(data.pay ? 'Money' : 'Incentives', data.pay ? 'Pay comes from the payslips HR has locked; tax from the Borang EA and the payslips.' : 'Incentive claims and the AraCare allowance, by claim month.')}
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <BarsChart title="Incentives" note="What staff claimed and what Clinical Admin approved, and the AraCare allowance, by claim month (from October 2026)." categories={months} series={[{ name: 'Claimed', color: COLOR.aqua, values: data.incentives.claimed }, { name: 'Approved', color: COLOR.violet, values: data.incentives.approved }, { name: 'AraCare', color: COLOR.magenta, values: data.incentives.care }]} format={money} />
      {data.pay && <LinesChart title="Gross pay for each person" note="Total gross pay divided by the people paid that month." categories={months} series={clinics(data.pay.perHead)} format={money} />}
      {data.pay && <LinesChart title="OT as a share of gross pay" note="How much of the pay is overtime." categories={months} series={clinics(data.pay.otShare)} format={(value) => `${value}%`} />}
      {data.tax && <BarsChart title="Gross pay by year" note="Everyone, both clinics. The current year is only the months paid so far." categories={yearLabels} series={[{ name: 'Gross pay', color: COLOR.violet, values: data.tax.gross }]} format={money} firstColumn="Year" />}
      {data.tax && <BarsChart title="PCB and KWSP by year" note="Tax taken from salary (PCB) and the employees' KWSP." categories={yearLabels} series={[{ name: 'PCB', color: COLOR.aqua, values: data.tax.pcb }, { name: 'KWSP', color: COLOR.yellow, values: data.tax.kwsp }]} format={money} firstColumn="Year" />}
    </div>

    {heading('Performance reviews', 'Reviews HR gave to supervisors, by the month they were given.')}
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <BarsChart title="Reviews done and waiting" categories={months} stacked series={[{ name: 'Done', color: COLOR.aqua, values: data.reviews.submitted }, { name: 'Still waiting', color: COLOR.yellow, values: data.reviews.pending }]} />
    </div>

    {data.pay && <>{heading('Payroll over 12 months', 'Head count, joiners and leavers, and the cost of pay, as in HR.')}<PayrollCharts /></>}
  </div>;
}
