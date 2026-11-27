import { allowanceType } from './payrollAllowances.js';
import { eis, hrdf, kwsp, pcbNormal, perkeso, ringgit, skbbk } from './payrollStatutory.js';

// One staff member's pay for one month, worked out from their profile and the figures HR enters for the month.
// Everything is in ringgit with two decimals. The profile supplies salary, fixed allowances, family (for PCB) and the payroll settings;
// the year-to-date totals are what was earned and deducted in the earlier months of the year.
export type PayChild = { dateOfBirth: string | null; studying?: boolean };
export type PayStaff = {
  basicSalary: number;
  fixedAllowances: { name: string; amount: number }[];
  maritalStatus: string;
  spouseWorking: boolean | null;
  children: PayChild[];
  settings: Record<string, string | number | boolean>;
  joinDate?: string | null;     // YYYY-MM-DD; the first month is paid for the days from here
  resignDate?: string | null;   // YYYY-MM-DD; the last month is paid up to here
  salaryChanges?: { date: string; from: number }[];   // a raise from this date (YYYY-MM-DD); `from` is the salary before it, basicSalary is the latest
  workDays?: WorkDay[];   // approved OT, rest day and public holiday work and unpaid leave by date, so that days before a raise use the salary of that day
};
export type WorkDay = { date: string; ot10?: number; ot15?: number; ot20?: number; ot30?: number; restDays?: number; phDays?: number; unpaidDays?: number };
export type PayYtd = { wages: number; kwspRelief: number; pcbPaid: number; zakatPaid: number };
// What HR enters for the month. OT is entered as hours at each rate (the rate HR chose when approving it in Attendance), rest days and public
// holidays worked as a count of days; the amounts are worked out from the salary. `ot` and `restPh` are for an amount that does not fit those.
export type PayInputs = { ot: number; restPh: number; shiftAllowance: number; unpaidLeave: number; otherAllowance: number; otherDeduction: number; ot10?: number; ot15?: number; ot20?: number; ot30?: number; restDays?: number; phDays?: number; unpaidDays?: number; annualLeaveDeduction?: number; adjustments?: Adjustment[] };
// A line HR adds for one person in a month (Payroll > Adjustments): a positive amount is added to the pay, a negative one is taken off.
// Like "other allowance" it counts in the gross and the PCB, and not in KWSP or PERKESO. An incentive is the exception: it is paid and in the gross,
// but is not taxed (as in Infotech, whose year-to-date wages leave it out).
export type Adjustment = { type: string; amount: number; note: string; source?: 'incentive' };
export const ADJUSTMENT_TYPES = ['Advance', 'Director fee', 'Incentive', 'Bonus', 'Back pay', 'Other'];
export const adjustmentTotals = (list?: Adjustment[]) => ({ add: money((list || []).reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0)), less: money((list || []).reduce((sum, item) => sum + (item.amount < 0 ? -item.amount : 0), 0)) });
export const incentivePay = (list?: Adjustment[]) => money((list || []).reduce((sum, item) => sum + (item.amount > 0 && (item.type === 'Incentive' || item.source === 'incentive') ? item.amount : 0), 0));
// A saved payslip's gross for tax (yearly figures): without the incentive. On a slip brought over from Infotech it is the "Incentives" line (or the care coordinator allowance, which is an incentive) counted in its gross.
export function taxableGross(result: { gross?: number; nonTaxable?: number; source?: string; allowances?: { name?: string; amount?: number }[] } | null | undefined) {
  const gross = Number(result?.gross || 0);
  const untaxed = typeof result?.nonTaxable === 'number' ? result.nonTaxable
    : result?.source === 'Infotech' ? (result.allowances || []).reduce((sum, item) => sum + (/^(incentives?|allowance care coordinat(o|e)r)$/i.test(String(item.name || '').trim()) ? Number(item.amount) || 0 : 0), 0) : 0;
  return money(gross - untaxed);
}
export const NO_INPUTS: PayInputs = { ot: 0, restPh: 0, shiftAllowance: 0, unpaidLeave: 0, otherAllowance: 0, otherDeduction: 0, ot10: 0, ot15: 0, ot20: 0, ot30: 0, restDays: 0, phDays: 0, unpaidDays: 0, annualLeaveDeduction: 0 };

const money = (value: number) => Math.round(value * 100) / 100;
// Infotech: daily rate = salary / 26; hourly rate = daily rate / 8, shown to the sen. OT hours are paid at the hourly rate times the rate chosen.
// A rest day worked is paid one day's rate, a public holiday worked two days' rate (hours beyond the normal day go in as OT at 2.0).
export const dailyRate = (salary: number) => salary / 26;
// Unpaid leave is cut at salary / 30 per day (Infotech's setting), the daily amount shown to the sen.
export const unpaidDayRate = (salary: number) => money(salary / 30);

// A joiner or leaver is paid for the days employed inside the pay period out of all its days (Infotech: RM1,700 for 25 of 31 days is RM1,370.97).
// A raise in the middle of the period is paid by the day: the old salary up to the day before it, the new one from that day (Infotech: RM2,000 to RM2,160.72
// on 12/10 over the 30 days to 19/10 is RM2,042.86).
export function proratedSalary(salary: number, year: number, month: number, joinDate?: string | null, resignDate?: string | null, changes: { date: string; from: number }[] = []) {
  const period = payPeriod(year, month);
  const day = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000;
  const total = day(period.to) - day(period.from) + 1;
  const start = joinDate && joinDate > period.from ? joinDate : period.from;
  const end = resignDate && resignDate < period.to ? resignDate : period.to;
  const worked = Math.max(0, day(end) - day(start) + 1);
  const later = [...changes].sort((a, b) => b.date.localeCompare(a.date)).filter((item) => item.date > period.from);
  if (later.length && worked > 0) {
    let sum = 0;
    for (let d = day(start); d <= day(end); d++) {
      const iso = new Date(d * 86400000).toISOString().slice(0, 10);
      let pay = salary;
      for (const change of later) if (iso < change.date) pay = change.from;
      sum += pay;
    }
    return { amount: money(sum / total), worked, total };
  }
  return { amount: worked >= total ? salary : money((salary * worked) / total), worked, total };
}
// The pay period printed on a payslip: for someone who left in it, the period ends on the last day of work (Infotech: 20-09-2026 TO 02-10-2026).
export function slipPeriod(year: number, month: number, resignDate?: string | null) {
  const period = payPeriod(year, month);
  return resignDate && resignDate >= period.from && resignDate < period.to ? { ...period, to: resignDate } : period;
}
export const hourlyRate = (salary: number) => money(dailyRate(salary) / 8);
export function overtimePay(salary: number, hours: { ot10?: number; ot15?: number; ot20?: number; ot30?: number }) {
  const rate = hourlyRate(salary);
  return money(rate * ((hours.ot10 || 0) * 1 + (hours.ot15 || 0) * 1.5 + (hours.ot20 || 0) * 2 + (hours.ot30 || 0) * 3));
}
export const restPhPay = (salary: number, restDays: number, phDays: number) => money(dailyRate(salary) * (restDays + phDays * 2));
const flag = (settings: PayStaff['settings'], key: string, fallback: boolean) => typeof settings[key] === 'boolean' ? settings[key] as boolean : fallback;

// A child counts for PCB relief when under 18 on 31 December of the pay year, or still studying.
export function childrenForRelief(children: PayChild[], year: number) {
  return children.filter((child) => child.studying || (child.dateOfBirth && Number(child.dateOfBirth.slice(0, 4)) > year - 18)).length;
}

// The salary on a date: before the first raise dated after it, the salary that raise started from.
function salaryOn(salary: number, changes: { date: string; from: number }[], date: string) {
  return [...changes].sort((a, b) => a.date.localeCompare(b.date)).find((item) => date < item.date)?.from ?? salary;
}
// OT, rest day, public holiday and unpaid leave amounts when there is a raise: the hours and days dated before the raise use the old salary.
// HR's typed totals stay the figure used; whatever is not matched to an earlier date uses the latest salary.
function workPay(staff: PayStaff, inputs: PayInputs) {
  const earlier = [...(staff.workDays || [])].sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({ day, salary: salaryOn(staff.basicSalary, staff.salaryChanges || [], day.date) })).filter((item) => item.salary !== staff.basicSalary);
  const split = (key: Exclude<keyof WorkDay, 'date'>, rate: (salary: number) => number) => {
    let left = inputs[key] || 0, amount = 0;
    for (const { day, salary } of earlier) {
      const part = Math.min(left, day[key] || 0);
      amount += rate(salary) * part; left -= part;
    }
    return amount + rate(staff.basicSalary) * left;
  };
  const ot10 = split('ot10', hourlyRate), ot15 = split('ot15', hourlyRate) * 1.5, ot20 = split('ot20', hourlyRate) * 2, ot30 = split('ot30', hourlyRate) * 3;
  return {
    ot: money(ot10 + ot15 + ot20 + ot30),
    otByRate: { ot10: money(ot10), ot15: money(ot15), ot20: money(ot20), ot30: money(ot30) },
    restPh: money(split('restDays', dailyRate) + split('phDays', dailyRate) * 2),
    unpaid: split('unpaidDays', unpaidDayRate),
  };
}

export function calculatePayslip(staff: PayStaff, given: PayInputs, ytd: PayYtd, year: number, month: number) {
  const extra = adjustmentTotals(given.adjustments);
  const inputs: PayInputs = { ...given, otherAllowance: money(given.otherAllowance + extra.add), otherDeduction: money(given.otherDeduction + extra.less) };
  const s = staff.settings;
  const work = workPay(staff, inputs);
  const unpaid = money(inputs.unpaidLeave + work.unpaid);
  const earned = proratedSalary(staff.basicSalary, year, month, staff.joinDate, staff.resignDate, staff.salaryChanges).amount;
  const basic = Math.max(0, earned - unpaid);
  const allowances = staff.fixedAllowances.map((item) => ({ ...item, type: allowanceType(item.name) }));
  const allowanceTotal = allowances.reduce((sum, item) => sum + item.amount, 0);
  const otAmount = money(inputs.ot + work.ot);
  const restPh = money(inputs.restPh + work.restPh);
  const gross = money(basic + allowanceTotal + otAmount + restPh + inputs.shiftAllowance + inputs.otherAllowance);
  // KWSP counts salary, rest-day and shift pay and any allowance flagged for it; OT and other allowances do not count.
  const leaveCut = inputs.annualLeaveDeduction || 0;
  const kwspWage = Math.max(0, basic - leaveCut) + restPh + inputs.shiftAllowance + allowances.filter((item) => item.type?.kwsp).reduce((sum, item) => sum + item.amount, 0);
  // PERKESO, EIS and SKBBK count everything except the allowances that are not flagged for them.
  const socsoWage = gross - leaveCut - allowances.filter((item) => !(item.type?.perkeso)).reduce((sum, item) => sum + item.amount, 0) - inputs.otherAllowance;
  const rate = typeof s.epfRate === 'number' ? s.epfRate : 11;
  const k = kwsp(kwspWage, rate), p = perkeso(socsoWage), e = eis(socsoWage);
  const useSocso = flag(s, 'socsoEmployed', true), useEis = flag(s, 'eis', true);
  const kwspEmployee = ringgit(k.employee), kwspEmployer = ringgit(k.employer);
  const socsoEmployee = useSocso ? ringgit(p.employee) : 0, socsoEmployer = useSocso ? ringgit(p.employer) : 0;
  const eisEmployee = useEis ? ringgit(e.employee) : 0, eisEmployer = useEis ? ringgit(e.employer) : 0;
  const skbbkEmployee = flag(s, 'skbbk', false) ? ringgit(skbbk(socsoWage)) : 0;
  const hrdfEmployer = flag(s, 'hrdf', false) ? ringgit(hrdf(basic)) : 0;

  // Not taxed: incentives, and any monthly allowance Infotech does not count for PCB (such as Care Coordinator).
  const nonTaxable = money(incentivePay(given.adjustments) + allowances.filter((item) => item.type && !item.type.pcb).reduce((sum, item) => sum + item.amount, 0)), taxable = money(gross - nonTaxable);
  let pcb = 0, chargeable = 0;
  if (flag(s, 'pcbApplied', true) && flag(s, 'taxResident', true)) {
    const married = staff.maritalStatus === 'Married';
    const result = pcbNormal({
      earnedBefore: ytd.wages, kwspBefore: ytd.kwspRelief, thisMonth: taxable, kwspThisMonth: kwspEmployee, nextMonth: taxable, kwspNextMonth: kwspEmployee,
      monthsLeft: 12 - month, spouse: married && staff.spouseWorking === false ? 4000 : 0, children: childrenForRelief(staff.children, year), pcbPaidBefore: ytd.pcbPaid, zakatBefore: ytd.zakatPaid,
    });
    pcb = money(result.pcb); chargeable = money(result.chargeable);
  }
  const deductions = money(kwspEmployee + socsoEmployee + eisEmployee + skbbkEmployee + pcb + inputs.otherDeduction + leaveCut);
  return {
    ot: otAmount, otByRate: work.otByRate, restPh, basic: money(basic), noPay: money(earned - basic), allowances: allowances.map((item) => ({ name: item.name, amount: item.amount })), gross, nonTaxable, kwspWage: money(kwspWage), socsoWage: money(socsoWage),
    kwspEmployee, kwspEmployer, socsoEmployee, socsoEmployer, eisEmployee, eisEmployer, skbbk: skbbkEmployee, hrdf: hrdfEmployer, pcb, chargeable, deductions, net: money(gross - deductions),
    ytdAfter: { wages: money(ytd.wages + taxable), kwspRelief: money(Math.min(4000, ytd.kwspRelief + kwspEmployee)), pcbPaid: money(ytd.pcbPaid + pcb), zakatPaid: ytd.zakatPaid },
  };
}

// A staff member is in a month's pay run only if they had joined by the last day of its pay period (the 19th). Someone who starts after it is first paid
// the next month, for the days from the date joined.
export const joinedForPay = (joinDate: string | null | undefined, year: number, month: number) => !joinDate || joinDate <= payPeriod(year, month).to;

// The pay period for a month: from the 20th of the month before to the 19th of the month itself. Management and Operation, the only two
// pay groups in use, are the same. OT, unpaid leave and late are counted for the days inside it.
export function payPeriod(year: number, month: number) {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { from: iso(prev.year, prev.month, 20), to: iso(year, month, 19) };
}
