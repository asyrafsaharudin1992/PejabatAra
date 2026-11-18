import { useMemo, useState, type ReactNode } from 'react';
import { card } from './AssessmentStaff';
import { ALLOWANCE_TYPES } from './lib/payrollAllowances';
import { incomeTax } from './lib/payrollStatutory';
import { calculatePayslip, dailyRate, hourlyRate, NO_INPUTS, unpaidDayRate, type PayInputs } from './lib/payrollRun';

// Payroll > Calculation guide: how every figure on the pay run is worked out, in plain words, and a calculator that uses the very same working-out
// as the pay run, so HR can try a salary and see each step.
const fmt = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const field = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details open={open} className={`${card} group`}><summary className="cursor-pointer text-base font-semibold text-[#14233b]">{title}</summary><div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">{children}</div></details>;
}
const Table = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => <div className="overflow-x-auto"><table className="no-stack w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">{head.map((item) => <th key={item} className="py-2 pr-4">{item}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-slate-50">{row.map((cell, at) => <td key={at} className={`py-2 pr-4 ${at === 0 ? 'font-semibold text-slate-700' : ''}`}>{cell}</td>)}</tr>)}</tbody></table></div>;

export function PayrollGuide() {
  const [salary, setSalary] = useState('2000');
  const [hours, setHours] = useState({ ot10: '0', ot15: '3', ot20: '0', ot30: '0' });
  const [days, setDays] = useState({ restDays: '0', phDays: '0', unpaidDays: '0' });
  const [other, setOther] = useState('0');
  const [skbbkOn, setSkbbkOn] = useState(false), [hrdfOn, setHrdfOn] = useState(false), [rate, setRate] = useState('11');
  // The family, for the tax (PCB): married or single, whether the spouse works, and the children under 18.
  const [marital, setMarital] = useState<'Single' | 'Married'>('Single'), [spouseWorks, setSpouseWorks] = useState(true), [kids, setKids] = useState('0');
  const n = (value: string) => Math.max(0, Number(value) || 0);
  const result = useMemo(() => {
    const basic = n(salary);
    const inputs: PayInputs = { ...NO_INPUTS, ot10: n(hours.ot10), ot15: n(hours.ot15), ot20: n(hours.ot20), ot30: n(hours.ot30), restDays: n(days.restDays), phDays: n(days.phDays), unpaidDays: n(days.unpaidDays), otherAllowance: n(other) };
    const staff = { basicSalary: basic, fixedAllowances: [], maritalStatus: marital, spouseWorking: marital === 'Married' ? spouseWorks : null, children: Array.from({ length: Math.min(12, Math.floor(n(kids))) }, () => ({ dateOfBirth: '2021-06-01' })), settings: { epfRate: Number(rate), socsoEmployed: true, eis: true, skbbk: skbbkOn, hrdf: hrdfOn, pcbApplied: true, taxResident: true } };
    // January with nothing earned before it: the tax is worked out as if the same pay is earned in every month of the year.
    return basic > 0 ? { out: calculatePayslip(staff, inputs, { wages: 0, kwspRelief: 0, pcbPaid: 0, zakatPaid: 0 }, 2026, 1), inputs, basic } : null;
  }, [salary, hours, days, other, skbbkOn, hrdfOn, rate, marital, spouseWorks, kids]);
  const num = (key: string, value: string, set: (next: string) => void, label: string) => <label key={key} className="text-xs font-semibold text-slate-500">{label}<input type="number" min="0" step="0.5" value={value} onChange={(event) => set(event.target.value)} className={`${field} mt-1`} /></label>;
  const steps = result ? (() => {
    const { out, inputs, basic } = result, hourly = hourlyRate(basic), orp = dailyRate(basic), unpaid = Math.round(unpaidDayRate(basic) * (inputs.unpaidDays || 0) * 100) / 100;
    const children = Math.min(12, Math.floor(n(kids))), spouse = marital === 'Married' && !spouseWorks ? 4000 : 0, relief = 9000 + spouse + children * 2000;
    const kwspYear = Math.min(4000, out.kwspEmployee * 12), yearGross = out.gross * 12, chargeable = Math.max(0, yearGross - kwspYear - relief), tax = incomeTax(chargeable);
    return [
      ['Daily rate (ORP)', `${fmt(basic)} ÷ 26`, fmt(orp)],
      ['Hourly rate (HRP)', `${fmt(orp)} ÷ 8`, fmt(hourly)],
      ['Unpaid leave', `${fmt(unpaidDayRate(basic))} (salary ÷ 30) × ${inputs.unpaidDays} day`, fmt(unpaid)],
      ['Basic salary paid', `${fmt(basic)} − ${fmt(unpaid)}`, fmt(out.basic)],
      ['OT (by the hour)', `${inputs.ot10}h × 1.0 + ${inputs.ot15}h × 1.5 + ${inputs.ot20}h × 2.0 + ${inputs.ot30}h × 3.0, each × ${fmt(hourly)}`, fmt(out.ot)],
      ['Rest/PH (fixed for the day)', `${fmt(orp)} × (${inputs.restDays} rest + ${inputs.phDays} PH × 2)`, fmt(out.restPh)],
      ['Other allowance', 'as entered', fmt(inputs.otherAllowance)],
      ['GROSS', 'basic + OT + Rest/PH + allowances', fmt(out.gross)],
      ['Wage for KWSP', 'basic + Rest/PH + shift (OT is not counted)', fmt(out.kwspWage)],
      ['KWSP employee / employer', 'band of the wage × rate, up to the next ringgit', `${fmt(out.kwspEmployee)} / ${fmt(out.kwspEmployer)}`],
      ['Wage for PERKESO, EIS, SKBBK', 'gross (OT counted), less allowances not flagged', fmt(out.socsoWage)],
      ['PERKESO employee / employer', '0.5% / 1.75% of the band middle', `${fmt(out.socsoEmployee)} / ${fmt(out.socsoEmployer)}`],
      ['EIS employee / employer', '0.2% each of the band middle', `${fmt(out.eisEmployee)} / ${fmt(out.eisEmployer)}`],
      ['SKBBK (employee)', '0.75% of the band middle (only if marked)', fmt(out.skbbk)],
      ['HRDF (employer)', '1% of basic after unpaid leave (only if marked)', fmt(out.hrdf)],
      ['PCB: year\'s pay', `${fmt(out.gross)} × 12 months (as if paid like this all year)`, fmt(yearGross)],
      ['PCB: KWSP relief', `${fmt(out.kwspEmployee)} × 12, at most 4,000`, fmt(kwspYear)],
      ['PCB: personal reliefs', `9,000 person${spouse ? ' + 4,000 spouse not working' : marital === 'Married' ? ' (spouse works: no spouse relief)' : ''}${children ? ` + ${children} child${children > 1 ? 'ren' : ''} × 2,000` : ''}`, fmt(relief)],
      ['PCB: chargeable income', 'year\'s pay − KWSP relief − reliefs', fmt(chargeable)],
      ['PCB: tax for the year', `by the tax bands${chargeable <= 35000 ? ', less the 400 rebate' : ''}`, fmt(tax)],
      ['PCB this month', 'tax for the year ÷ 12, up to the next 5 sen', fmt(out.pcb)],
      ['Total taken from the staff', 'KWSP + PERKESO + EIS + SKBBK + PCB', fmt(out.deductions)],
      ['NET PAY', 'gross − total taken', fmt(out.net)],
    ];
  })() : [];
  return <div className="space-y-4">
    <section className={`${card} space-y-4`}>
      <div><h3 className="text-lg font-semibold">Calculation guide</h3><p className="mt-1 text-sm text-slate-500">How the pay run works out each figure, with Infotech's method (checked against the October 2026 pay run). Below, try a salary and see every step; it uses the same working-out as the pay run.</p></div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {num('salary', salary, setSalary, 'Basic salary (RM)')}
        {num('ot10', hours.ot10, (v) => setHours({ ...hours, ot10: v }), 'OT hours at 1.0')}{num('ot15', hours.ot15, (v) => setHours({ ...hours, ot15: v }), 'OT hours at 1.5')}{num('ot20', hours.ot20, (v) => setHours({ ...hours, ot20: v }), 'OT hours at 2.0')}{num('ot30', hours.ot30, (v) => setHours({ ...hours, ot30: v }), 'OT hours at 3.0')}
        {num('other', other, setOther, 'Other allowance (RM)')}
        {num('rest', days.restDays, (v) => setDays({ ...days, restDays: v }), 'Rest days (fixed pay)')}{num('ph', days.phDays, (v) => setDays({ ...days, phDays: v }), 'Public holidays (fixed pay)')}{num('unpaid', days.unpaidDays, (v) => setDays({ ...days, unpaidDays: v }), 'Unpaid leave days')}
        <label className="text-xs font-semibold text-slate-500">KWSP employee rate<select value={rate} onChange={(event) => setRate(event.target.value)} className={`${field} mt-1`}><option value="11">11%</option><option value="9">9%</option><option value="0">None</option></select></label>
        <label className="text-xs font-semibold text-slate-500">Marital status<select value={marital} onChange={(event) => setMarital(event.target.value as 'Single' | 'Married')} className={`${field} mt-1`}><option value="Single">Single</option><option value="Married">Married</option></select></label>
        <label className="text-xs font-semibold text-slate-500">Spouse<select value={spouseWorks ? 'works' : 'no'} disabled={marital !== 'Married'} onChange={(event) => setSpouseWorks(event.target.value === 'works')} className={`${field} mt-1 disabled:opacity-50`}><option value="works">Works</option><option value="no">Does not work</option></select></label>
        {num('kids', kids, setKids, 'Children under 18')}
        <label className="flex items-center gap-2 pt-6 text-xs font-semibold text-slate-600"><input type="checkbox" checked={skbbkOn} onChange={(event) => setSkbbkOn(event.target.checked)} />SKBBK applies</label>
        <label className="flex items-center gap-2 pt-6 text-xs font-semibold text-slate-600"><input type="checkbox" checked={hrdfOn} onChange={(event) => setHrdfOn(event.target.checked)} />HRDF applies</label>
      </div>
      {result ? <div className="overflow-x-auto"><table className="no-stack w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400"><th className="py-2 pr-4">Step</th><th className="pr-4">How</th><th className="text-right">RM</th></tr></thead>
        <tbody>{steps.map(([step, how, value]) => <tr key={step} className={`border-b border-slate-50 ${/^(GROSS|NET PAY)$/.test(step) ? 'bg-[#f4fafd] font-bold text-[#0b587b]' : ''}`}><td className="py-2 pr-4 font-semibold">{step}</td><td className="pr-4 text-slate-500">{how}</td><td className="whitespace-nowrap text-right tabular-nums">{value}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">Type a basic salary above.</p>}
      <p className="text-xs text-slate-400">The PCB here assumes the same pay is earned in every month of the year. In the real pay run it uses what the person actually earned and paid in the earlier months of the year, and the family details in their profile (marital status, spouse working or not, children).</p>
    </section>

    <Section title="1. Pay period, daily and hourly rates" open>
      <p>The pay period is from the <b>20th of the month before to the 19th</b> of the month (for November: 20 October to 19 November). Staff who joined or left in the period are paid for the days employed out of all the days in the period (RM1,700 for 25 of 31 days is RM1,370.97). A raise in the middle of the period is paid by the day: the old salary up to the day before it, the new one from that day.</p>
      <Table head={['Name', 'How', 'Used for']} rows={[['ORP (daily rate)', 'salary ÷ 26', 'Rest day and public holiday pay'], ['HRP (hourly rate)', 'ORP ÷ 8, to the sen', 'OT by the hour'], ['Unpaid leave a day', 'salary ÷ 30, to the sen', 'Unpaid leave and no-pay days']]} />
    </Section>

    <Section title="2. OT, rest day and public holiday pay">
      <p>OT is counted in whole hours, rounded down, at least 1 hour; a long stretch of more than 5 hours has 1 hour of rest taken off. HR can change these in Attendance &gt; OT &gt; Settings. The rates below are the memo's.</p>
      <Table head={['Day', 'Pay', 'Column on the report']} rows={[['Normal day, off day', 'each hour × 1.5 HRP', 'OT Amt'], ['Rest day, first 4 hours', 'fixed 0.5 ORP', 'Rest/PH'], ['Rest day, up to 8 hours', 'fixed 1 ORP', 'Rest/PH'], ['Rest day, after 8 hours', 'each hour × 2 HRP', 'OT Amt'], ['Public holiday, up to 8 hours', 'fixed 2 ORP', 'Rest/PH'], ['Public holiday, after 8 hours', 'each hour × 3 HRP', 'OT Amt']]} />
      <p>The Rest day is the last day off of the week; other days off are off days. A public holiday follows the staff member's holiday list (operation or management).</p>
    </Section>

    <Section title="3. Gross pay">
      <p>Gross = basic salary after unpaid leave + fixed allowances + OT + Rest/PH + shift allowance + other allowance. Only the allowance types in the table are used; the flags say how each is treated.</p>
      <Table head={['Allowance', 'KWSP', 'PERKESO', 'EIS', 'HRDF', 'PCB']} rows={ALLOWANCE_TYPES.map((item) => [item.name, item.kwsp ? 'Yes' : 'No', item.perkeso ? 'Yes' : 'No', item.eis ? 'Yes' : 'No', item.hrdf ? 'Yes' : 'No', item.pcb ? 'Yes' : 'No'])} />
    </Section>

    <Section title="4. KWSP (EPF)">
      <p><b>Wage:</b> basic after unpaid leave + Rest/PH + shift pay + allowances flagged for KWSP. OT and other allowances do not count.</p>
      <p><b>Working out:</b> the wage is put in a band (RM20 wide up to RM5,000, RM100 wide above), the rate is applied to the <b>top of the band</b>, and the result goes up to the next ringgit. Employee: 11% (HR can set another rate for a person). Employer: <b>13%</b> up to RM5,000, <b>12%</b> above.</p>
      <p>Example: wage RM1,978.63 is in the band to RM1,980; 11% of 1,980 = 217.80, up to <b>RM218</b>; 13% = 257.40, up to <b>RM258</b>.</p>
    </Section>

    <Section title="5. PERKESO (SOCSO) and EIS">
      <p><b>Wage:</b> gross (OT counts), less any allowance not flagged for PERKESO and EIS, capped at RM6,000. The wage is put in a band RM100 wide and the figures are worked from the <b>middle of the band</b> (RM1,978.63 is in the band 1,900–2,000, middle 1,950).</p>
      <Table head={['', 'Employee', 'Employer']} rows={[['PERKESO', '0.5% of the middle, to the sen (1,950 → 9.75)', '1.75% of the middle, to the nearest 5 sen (1,950 → 34.15)'], ['EIS', '0.2% of the middle (1,950 → 3.90)', '0.2% of the middle (1,950 → 3.90)']]} />
      <p>Very low wages (under RM200) follow the official table instead of a percentage.</p>
    </Section>

    <Section title="6. SKBBK and HRDF">
      <p><b>SKBBK</b> (24-hour cover) is taken from the employee: 0.75% of the band middle, to the nearest 5 sen, only for staff marked for it (1,950 → 14.65). <b>HRDF</b> is paid by the employer only (not taken from the staff): 1% of the basic salary after unpaid leave, only for staff marked for it.</p>
    </Section>

    <Section title="7. PCB (monthly tax)">
      <p>PCB is worked out by the LHDN computerised method, as Infotech does. The year's chargeable income is projected: what was earned so far in the year, plus this month, plus the same pay for every month still to come, less the KWSP relief (at most RM4,000 for the year) and the personal reliefs: <b>RM9,000</b> for the person, <b>RM4,000</b> if the spouse does not work, and <b>RM2,000</b> for each child under 18 (or studying).</p>
      <p>The tax on that income is found from the bands below (a RM400 rebate if the chargeable income is RM35,000 or less). From it, the PCB and zakat already paid this year are taken off, and the rest is divided over this month and the months left, then <b>rounded up to the next 5 sen</b>.</p>
      <Table head={['Chargeable income up to', 'Rate']} rows={[['RM5,000', '0%'], ['RM20,000', '1%'], ['RM35,000', '3%'], ['RM50,000', '6%'], ['RM70,000', '11%'], ['RM100,000', '19%'], ['RM250,000', '24%'], ['RM400,000', '24.5%'], ['RM600,000', '25%'], ['RM1,000,000', '26%'], ['RM2,000,000', '28%'], ['above', '30%']]} />
      <p className="text-xs text-slate-400">The year-to-date totals come from Infotech up to October 2026; each month after it needs the month before it to be locked.</p>
    </Section>

    <Section title="8. Net pay">
      <p>Net pay = gross − (KWSP employee + PERKESO employee + EIS employee + SKBBK + PCB + other deductions + annual leave deduction). The employer's KWSP, PERKESO, EIS and HRDF are costs to the company and are <b>not</b> taken from the staff.</p>
    </Section>
  </div>;
}
