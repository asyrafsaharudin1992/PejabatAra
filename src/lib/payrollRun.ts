import { allowanceType } from './payrollAllowances';
import { eis, hrdf, kwsp, pcbNormal, perkeso, ringgit, skbbk } from './payrollStatutory';

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
};
export type PayYtd = { wages: number; kwspRelief: number; pcbPaid: number; zakatPaid: number };
// What HR enters for the month. OT is entered as hours at each rate (the rate HR chose when approving it in Attendance), rest days and public
// holidays worked as a count of days; the amounts are worked out from the salary. `ot` and `restPh` are for an amount that does not fit those.
export type PayInputs = { ot: number; restPh: number; shiftAllowance: number; unpaidLeave: number; otherAllowance: number; otherDeduction: number; ot10?: number; ot15?: number; ot20?: number; ot30?: number; restDays?: number; phDays?: number };
export const NO_INPUTS: PayInputs = { ot: 0, restPh: 0, shiftAllowance: 0, unpaidLeave: 0, otherAllowance: 0, otherDeduction: 0, ot10: 0, ot15: 0, ot20: 0, ot30: 0, restDays: 0, phDays: 0 };

const money = (value: number) => Math.round(value * 100) / 100;
// Infotech: daily rate = salary / 26; hourly rate = daily rate / 8, shown to the sen. OT hours are paid at the hourly rate times the rate chosen.
// A rest day worked is paid one day's rate, a public holiday worked two days' rate (hours beyond the normal day go in as OT at 2.0).
export const dailyRate = (salary: number) => salary / 26;
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

export function calculatePayslip(staff: PayStaff, inputs: PayInputs, ytd: PayYtd, year: number, month: number) {
  const s = staff.settings;
  const basic = Math.max(0, staff.basicSalary - inputs.unpaidLeave);
  const allowances = staff.fixedAllowances.map((item) => ({ ...item, type: allowanceType(item.name) }));
  const allowanceTotal = allowances.reduce((sum, item) => sum + item.amount, 0);
  const otAmount = money(inputs.ot + overtimePay(staff.basicSalary, inputs));
  const restPh = money(inputs.restPh + restPhPay(staff.basicSalary, inputs.restDays || 0, inputs.phDays || 0));
  const gross = money(basic + allowanceTotal + otAmount + restPh + inputs.shiftAllowance + inputs.otherAllowance);
  // KWSP counts salary, rest-day and shift pay and any allowance flagged for it; OT and other allowances do not count.
  const kwspWage = basic + restPh + inputs.shiftAllowance + allowances.filter((item) => item.type?.kwsp).reduce((sum, item) => sum + item.amount, 0);
  // PERKESO, EIS and SKBBK count everything except the allowances that are not flagged for them.
  const socsoWage = gross - allowances.filter((item) => !(item.type?.perkeso)).reduce((sum, item) => sum + item.amount, 0) - inputs.otherAllowance;
  const rate = typeof s.epfRate === 'number' ? s.epfRate : 11;
  const k = kwsp(kwspWage, rate), p = perkeso(socsoWage), e = eis(socsoWage);
  const useSocso = flag(s, 'socsoEmployed', true), useEis = flag(s, 'eis', true);
  const kwspEmployee = ringgit(k.employee), kwspEmployer = ringgit(k.employer);
  const socsoEmployee = useSocso ? ringgit(p.employee) : 0, socsoEmployer = useSocso ? ringgit(p.employer) : 0;
  const eisEmployee = useEis ? ringgit(e.employee) : 0, eisEmployer = useEis ? ringgit(e.employer) : 0;
  const skbbkEmployee = flag(s, 'skbbk', false) ? ringgit(skbbk(socsoWage)) : 0;
  const hrdfEmployer = flag(s, 'hrdf', false) ? ringgit(hrdf(basic)) : 0;

  let pcb = 0, chargeable = 0;
  if (flag(s, 'pcbApplied', true) && flag(s, 'taxResident', true)) {
    const married = staff.maritalStatus === 'Married';
    const result = pcbNormal({
      earnedBefore: ytd.wages, kwspBefore: ytd.kwspRelief, thisMonth: gross, kwspThisMonth: kwspEmployee, nextMonth: gross, kwspNextMonth: kwspEmployee,
      monthsLeft: 12 - month, spouse: married && staff.spouseWorking === false ? 4000 : 0, children: childrenForRelief(staff.children, year), pcbPaidBefore: ytd.pcbPaid, zakatBefore: ytd.zakatPaid,
    });
    pcb = money(result.pcb); chargeable = money(result.chargeable);
  }
  const deductions = money(kwspEmployee + socsoEmployee + eisEmployee + skbbkEmployee + pcb + inputs.otherDeduction);
  return {
    ot: otAmount, restPh, basic: money(basic), allowances: allowances.map((item) => ({ name: item.name, amount: item.amount })), gross, kwspWage: money(kwspWage), socsoWage: money(socsoWage),
    kwspEmployee, kwspEmployer, socsoEmployee, socsoEmployer, eisEmployee, eisEmployer, skbbk: skbbkEmployee, hrdf: hrdfEmployer, pcb, chargeable, deductions, net: money(gross - deductions),
    ytdAfter: { wages: money(ytd.wages + gross), kwspRelief: money(Math.min(4000, ytd.kwspRelief + kwspEmployee)), pcbPaid: money(ytd.pcbPaid + pcb), zakatPaid: ytd.zakatPaid },
  };
}

// The pay period for a month: from the 20th of the month before to the 19th of the month itself. Management and Operation, the only two
// pay groups in use, are the same. OT, unpaid leave and late are counted for the days inside it.
export function payPeriod(year: number, month: number) {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { from: iso(prev.year, prev.month, 20), to: iso(year, month, 19) };
}
