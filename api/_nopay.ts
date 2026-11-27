import { payPeriod, unpaidDayRate } from '../src/lib/payrollRun.js';

// The "TOTAL NO PAY" shown on a payslip (as Infotech does): what unpaid leave took off the basic pay. A slip saved from now on carries the amount; for an
// earlier one it is worked out from what HR typed, at the salary of that month (the salary before the first raise dated after its pay period).
export async function noPayOf(db: any, employeeId: string, slip: { year: number; month: number; result?: any; inputs?: any }, salaryNow: number) {
  // Lines an Infotech slip prints that its saved figures do not hold: an incentive paid outside the nett wages, and a named deduction.
  const printed = { ...(slip.result?.infotechIncentive ? { infotechIncentive: slip.result.infotechIncentive as number } : {}), ...(slip.result?.deductionLines ? { deductionLines: slip.result.deductionLines as { name: string; amount: number }[] } : {}) };
  return { ...printed, ...(await amountOf(db, employeeId, slip, salaryNow)) };
}
async function amountOf(db: any, employeeId: string, slip: { year: number; month: number; result?: any; inputs?: any }, salaryNow: number) {
  const days = Number(slip.inputs?.unpaidDays) || 0, typed = Number(slip.inputs?.unpaidLeave) || 0;
  if (typeof slip.result?.noPay === 'number') return { noPay: slip.result.noPay as number, unpaidDays: days, noPayLines: (slip.result as any).noPayLines };
  if (!days && !typed) return { noPay: 0, unpaidDays: 0 };
  let salary = salaryNow;
  if (days) {
    const { data } = await db.from('hr_career_history').select('from_value').eq('employee_id', employeeId).in('kind', ['Increment', 'Salary Adjustment']).gt('event_date', payPeriod(slip.year, slip.month).to).order('event_date').limit(1);
    const before = Number(String(data?.[0]?.from_value || '').replace(/,/g, ''));
    if (before > 0) salary = before;
  }
  return { noPay: Math.round((typed + unpaidDayRate(salary) * days) * 100) / 100, unpaidDays: days };
}
