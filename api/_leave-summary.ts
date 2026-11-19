// The leave summary at the foot of a payslip (like Infotech's "AL/Bal/YTD" and "ML/Bal/YTD"): for each of Annual and Medical Leave, the days taken in the pay
// period (the 20th of the month before to the 19th), the balance at the end of that period and the days taken in the year so far. Emergency Leave counts as Annual
// Leave (it is in the Annual Leave group). Months paid in Infotech (before November 2026) have no balance on record, so their balance is left empty.
export type LeaveLine = { period: number; balance: number | null; ytd: number };
export type PayslipLeave = { al: LeaveLine; ml: LeaveLine };
const GROUPS: Record<'al' | 'ml', string[]> = { al: ['AL', 'AL OPS'], ml: ['ML', 'MC OPS'] };
const round = (value: number) => Math.round(value * 100) / 100;

export function payslipPeriod(year: number, month: number) {
  const from = month === 1 ? `${year - 1}-12-20` : `${year}-${String(month - 1).padStart(2, '0')}-20`;
  return { from, to: `${year}-${String(month).padStart(2, '0')}-19` };
}

export async function payslipLeave(db: any, employeeId: string, year: number, month: number): Promise<PayslipLeave> {
  const { from, to } = payslipPeriod(year, month);
  const { data: requests, error } = await db.from('hr_leave_requests').select('leave_group,start_date,days').eq('employee_id', employeeId).eq('status', 'approved').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`).in('leave_group', [...GROUPS.al, ...GROUPS.ml]).limit(2000);
  if (error) throw error;
  const { data: balances } = await db.from('hr_leave_balances').select('leave_group,balance').eq('employee_id', employeeId).eq('year', year).in('leave_group', ['AL', 'ML']);
  const live = month >= 11 && year >= 2026;
  const line = (key: 'al' | 'ml'): LeaveLine => {
    const mine = (requests || []).filter((item: any) => GROUPS[key].includes(item.leave_group));
    const days = (test: (date: string) => boolean) => round(mine.filter((item: any) => test(item.start_date)).reduce((sum: number, item: any) => sum + (Number(item.days) || 0), 0));
    const current = (balances || []).find((item: any) => item.leave_group === key.toUpperCase());
    // The balance now, plus what was taken after the end of this pay period (approved leave takes days off the balance when it is approved).
    return { period: days((date) => date >= from && date <= to), ytd: days((date) => date <= to), balance: live && current ? round(Number(current.balance) + days((date) => date > to)) : null };
  };
  return { al: line('al'), ml: line('ml') };
}
