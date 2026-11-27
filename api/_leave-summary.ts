// The leave summary at the foot of a payslip (like Infotech's "AL/Bal/YTD" and "ML/Bal/YTD"): for each of Annual and Medical Leave, the days taken in the pay
// period (the 20th of the month before to the 19th) and the balance at the end of that period are printed, as Infotech did (the days taken in the year so far are worked out too, but not printed). Emergency Leave counts as Annual
// Leave (it is in the Annual Leave group). Months paid in Infotech (before November 2026) have no balance on record, so their balance is left empty.
// Leave that runs over the 19th/20th is split by date, so each payslip shows only the days inside its own period. The January period starts on 20 December.
import { leaveDays, rosterFor } from './_assessment.js';

export type LeaveLine = { period: number; balance: number | null; ytd: number };
export type PayslipLeave = { al: LeaveLine; ml: LeaveLine };
const GROUPS: Record<'al' | 'ml', string[]> = { al: ['AL', 'AL OPS'], ml: ['ML', 'MC OPS'] };
const round = (value: number) => Math.round(value * 100) / 100;

export function payslipPeriod(year: number, month: number) {
  const from = month === 1 ? `${year - 1}-12-20` : `${year}-${String(month - 1).padStart(2, '0')}-20`;
  return { from, to: `${year}-${String(month).padStart(2, '0')}-19` };
}

const shift = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);

// How many of a request's days fall on or before a date. The days are shared over the person's working days in the request (the same calendar the leave was
// applied on); if none of its dates counts as a working day, over all its dates.
export function daysUpTo(request: { start_date: string; end_date?: string | null; days: unknown }, date: string, workDays: number[], roster: Record<string, boolean> = {}) {
  const start = request.start_date, end = request.end_date || start, days = Number(request.days) || 0;
  if (date < start) return 0;
  if (date >= end) return days;
  const total = leaveDays(start, end, null, workDays, roster);
  const share = total ? leaveDays(start, date, null, workDays, roster) / total : leaveDays(start, date, null, [0, 1, 2, 3, 4, 5, 6]) / leaveDays(start, end, null, [0, 1, 2, 3, 4, 5, 6]);
  return round(days * share);
}

export async function payslipLeave(db: any, employeeId: string, year: number, month: number): Promise<PayslipLeave> {
  const { from, to } = payslipPeriod(year, month);
  const yearStart = `${year}-01-01`, earliest = from < yearStart ? from : yearStart;
  const { data: requests, error } = await db.from('hr_leave_requests').select('leave_group,start_date,end_date,days').eq('employee_id', employeeId).eq('status', 'approved').gte('end_date', earliest).lte('start_date', `${year}-12-31`).in('leave_group', [...GROUPS.al, ...GROUPS.ml]).limit(2000);
  if (error) throw error;
  // The person's calendar is only needed for leave that has to be split.
  const splits = (item: any) => [earliest, from, yearStart, shift(to, 1)].some((date) => item.start_date < date && (item.end_date || item.start_date) >= date);
  const calendars = new Map<any, Record<string, boolean>>();
  let workDays = [1, 2, 3, 4, 5];
  const straddling = (requests || []).filter(splits);
  if (straddling.length) {
    const { data: people, error: personError } = await db.from('hr_employees').select('work_days,holiday_group').eq('id', employeeId).limit(1);
    if (personError) throw personError;
    const person: any = people?.[0];
    if (Array.isArray(person?.work_days) && person.work_days.length) workDays = person.work_days;
    for (const item of straddling) calendars.set(item, await rosterFor(db, employeeId, item.start_date, item.end_date, person?.holiday_group || ''));
  }
  const within = (item: any, first: string, last: string) => daysUpTo(item, last, workDays, calendars.get(item)) - daysUpTo(item, shift(first, -1), workDays, calendars.get(item));
  const { data: balances } = await db.from('hr_leave_balances').select('leave_group,balance').eq('employee_id', employeeId).eq('year', year).in('leave_group', ['AL', 'ML']);
  const live = month >= 11 && year >= 2026;
  const line = (key: 'al' | 'ml'): LeaveLine => {
    const mine = (requests || []).filter((item: any) => GROUPS[key].includes(item.leave_group));
    const sum = (list: any[], first: string, last: string) => round(list.reduce((total, item) => total + within(item, first, last), 0));
    const current = (balances || []).find((item: any) => item.leave_group === key.toUpperCase());
    // The balance now, plus what was taken after the end of this pay period (approved leave takes days off the balance of the year it starts in).
    const after = sum(mine.filter((item: any) => item.start_date >= yearStart), shift(to, 1), '9998-12-31');
    return { period: sum(mine, from, to), ytd: sum(mine, yearStart, to), balance: live && current ? round(Number(current.balance) + after) : null };
  };
  return { al: line('al'), ml: line('ml') };
}

// Unpaid leave of a pay period, date by date, as Infotech links it to payroll: each day goes to the period its date falls in, and a rest day or holiday inside
// a request gets none (the same calendar as the leave on the payslip). Leave of a single date needs no calendar.
export async function unpaidByDate(db: any, requests: { employee_id: string; start_date: string; end_date?: string | null; days: unknown }[], from: string, to: string) {
  const longer = requests.filter((item) => (item.end_date || item.start_date) > item.start_date);
  const people = new Map<string, any>();
  if (longer.length) {
    const { data, error } = await db.from('hr_employees').select('id,work_days,holiday_group').in('id', [...new Set(longer.map((item) => item.employee_id))]).limit(1000);
    if (error) throw error;
    for (const person of data || []) people.set(person.id, person);
  }
  const out: { employee_id: string; date: string; days: number }[] = [];
  for (const item of requests) {
    const end = item.end_date || item.start_date, person = people.get(item.employee_id);
    const workDays: number[] = Array.isArray(person?.work_days) && person.work_days.length ? person.work_days : [1, 2, 3, 4, 5];
    const calendar = end > item.start_date ? await rosterFor(db, item.employee_id, item.start_date, end, person?.holiday_group || '') : {};
    for (let date = item.start_date > from ? item.start_date : from; date <= end && date <= to; date = shift(date, 1)) {
      const days = round(daysUpTo(item, date, workDays, calendar) - daysUpTo(item, shift(date, -1), workDays, calendar));
      if (days) out.push({ employee_id: item.employee_id, date, days });
    }
  }
  return out;
}
