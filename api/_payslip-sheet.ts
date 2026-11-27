import { ADJUSTMENT_TYPES, hourlyRate, payPeriod, proratedSalary } from '../src/lib/payrollRun.js';
import { noPayOf } from './_nopay.js';
import { payslipLeave } from './_leave-summary.js';

// One payslip with everything the A4 sheet prints (the Infotech layout). HR's preview and the staff member's own view are both built here, so they show the same lines.
export const PAYSLIP_STAFF = 'full_name,employee_code,company,designation,department,bank_name,bank_account,ic_no,tax_no,socso_no,epf_no,join_date,resign_date,basic_salary';

// The lines HR adds for one person in a month: at most 12, a type from the list, an amount (+ added, - taken off) and a short note.
export function cleanAdjustments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((item: any) => ({ type: ADJUSTMENT_TYPES.includes(String(item?.type)) ? String(item.type) : 'Other', amount: Math.round((Number(item?.amount) || 0) * 100) / 100, note: String(item?.note ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60), ...(item?.source === 'incentive' ? { source: 'incentive' as const } : {}) })).filter((item) => item.amount !== 0 && Math.abs(item.amount) <= 1000000);
}
// `slip` is the row of hr_payslips (year, month, result, inputs); `me` the person's HR record (PAYSLIP_STAFF).
export async function payslipSheet(db: any, id: string, slip: any, me: any) {
  const r: any = slip.result || {};
  // A month brought over from Infotech keeps what was printed then: the designation, the bank and every earning and deduction line.
  const printed: any = r.printed;
  // Like Infotech's payslip: a raise in the middle of the period shows as "INCREMENT : amount" under the basic pay, and the OT is listed by rate
  // (before and after the raise when the attendance dates allow it).
  const period = payPeriod(slip.year, slip.month);
  const { data: raiseRows } = await db.from('hr_career_history').select('event_date,from_value,to_value').eq('employee_id', id).in('kind', ['Increment', 'Salary Adjustment']).gte('event_date', period.from).lte('event_date', period.to).order('event_date');
  const changes = (raiseRows || []).filter((row: any) => Number.isFinite(Number(row.from_value))).map((row: any) => ({ date: String(row.event_date), from: Number(row.from_value), to: Number(row.to_value) }));
  const raises = changes.filter((row: any) => row.date > period.from); // a raise inside the period splits the OT; one on its first day does not
  const less = await noPayOf(db, id, slip, Number(me.basic_salary) || 0);
  // INCREMENT is what this slip actually paid above the salary before the raise. For someone who joined or left inside the period the by-the-day share is worked
  // out. November 2026 only: the slips that paid the whole new salary for a raise dated inside the period (a fault since put right) have no INCREMENT line.
  let increment = 0;
  let otLines: { heading: string; rows: { label: string; hours: number; amount: number }[] }[] = [];
  if (changes.length && Number(r.basic) > 0) {
    const partMonth = (me.join_date && me.join_date > period.from) || (me.resign_date && me.resign_date < period.to);
    const latest = Number(changes[changes.length - 1].to) || Number(me.basic_salary) || 0;
    const paid = partMonth ? proratedSalary(latest, slip.year, slip.month, null, null, changes.map((row: any) => ({ date: row.date, from: row.from }))).amount : Number(r.basic) + (Number(less.noPay) || 0);
    const paidInFull = slip.year === 2026 && slip.month === 11 && raises.length > 0 && paid >= latest - 0.005;
    increment = paidInFull ? 0 : Math.max(0, Math.round((paid - changes[0].from) * 100) / 100);
  }
  let typed: Record<string, number> = { ot10: Number(slip.inputs?.ot10) || 0, ot15: Number(slip.inputs?.ot15) || 0, ot20: Number(slip.inputs?.ot20) || 0, ot30: Number(slip.inputs?.ot30) || 0 };
  const salaryNow = Number((me as any).basic_salary) || Number(r.basic) || 0;
  const rateRows = (salary: number, hours: Record<string, number>) => ([['ot10', 1], ['ot15', 1.5], ['ot20', 2], ['ot30', 3]] as const).filter(([key]) => (hours[key] || 0) > 0).map(([key, times]) => ({ label: `OT ${times.toFixed(1)}`, hours: Math.round(hours[key] * 100) / 100, amount: Math.round(hourlyRate(salary) * times * hours[key] * 100) / 100 }));
  if ((Number(r.ot) || 0) > 0) {
    // The OT hours HR approved in Attendance for the pay period, by day. A month brought over from Infotech has only the OT amount, so these hours stand in for the typed ones.
    const { data: att } = await db.from('hr_attendance_ot').select('work_date,approved_minutes,multiplier,parts').eq('employee_id', id).eq('status', 'approved').gte('work_date', period.from).lte('work_date', period.to).limit(400);
    const buckets = new Map<string, Record<string, number>>();
    const total: Record<string, number> = { ot10: 0, ot15: 0, ot20: 0, ot30: 0 };
    for (const row of att || []) {
      const parts: any[] = Array.isArray(row.parts) && row.parts.length ? row.parts : [{ minutes: Number(row.approved_minutes || 0), multiplier: Number(row.multiplier) }];
      for (const part of parts) {
        if (part.flat) continue;
        const key = ({ 1: 'ot10', 1.5: 'ot15', 2: 'ot20', 3: 'ot30' } as Record<number, string>)[Number(part.multiplier)];
        if (!key) continue;
        const group = raises.length && String(row.work_date) < raises[0].date ? 'before' : 'after';
        const entry = buckets.get(group) || { ot10: 0, ot15: 0, ot20: 0, ot30: 0 };
        entry[key] += Number(part.minutes || 0) / 60; total[key] += Number(part.minutes || 0) / 60; buckets.set(group, entry);
      }
    }
    const typedNone = Object.values(typed).every((value) => value === 0);
    const useAttendance = typedNone || Object.keys(typed).every((key) => Math.abs((total[key] || 0) - typed[key]) < 0.01);
    if (typedNone) typed = total;
    if (raises.length && useAttendance && Object.values(total).some((value) => value > 0)) {
      const before = new Date(Date.parse(`${raises[0].date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      for (const [group, heading, salary] of [['before', `${period.from} TO ${before} BEFORE INCREMENT`, raises[0].from], ['after', `${raises[0].date} TO ${period.to} AFTER INCREMENT`, raises[raises.length - 1].to]] as const) {
        const entry = buckets.get(group); const rows = entry ? rateRows(salary, entry) : [];
        if (rows.length) otLines.push({ heading, rows });
      }
    }
    if (!otLines.length) otLines = [{ heading: '', rows: rateRows(raises.length ? raises[raises.length - 1].to : salaryNow, typed) }];
  }
  // The listed OT must add up to the OT on the payslip (a month brought over from Infotech, or a salary that changed, may not); if not, it is left out.
  if (Math.abs(otLines.reduce((sum, block) => sum + block.rows.reduce((inner, row) => inner + row.amount, 0), 0) - (Number(r.ot) || 0)) > 0.05) otLines = [];
  return { increment, otLines, otFrom: period.from, otTo: period.to, year: slip.year, month: slip.month, name: me.full_name, code: me.employee_code, company: me.company, designation: printed?.designation || me.designation, department: me.department,
    basic: r.basic, allowances: r.allowances || [], ot: r.ot, restPh: r.restPh, gross: r.gross, kwspEmployee: r.kwspEmployee, kwspEmployer: r.kwspEmployer, socsoEmployee: r.socsoEmployee, socsoEmployer: r.socsoEmployer,
    eisEmployee: r.eisEmployee, eisEmployer: r.eisEmployer, skbbk: r.skbbk, pcb: r.pcb, deductions: r.deductions, net: r.net, ytdWages: r.ytdAfter?.wages, ytdPcb: r.ytdAfter?.pcbPaid,
    bankName: printed?.bankName || me.bank_name || '', bankAccountEnd: String(me.bank_account || '').replace(/\D/g, '').slice(-4),
    // For HR's A4 payslip (the Infotech layout): the identity and bank numbers (shown only when HR chooses), the join date and what HR typed that month.
    ic: me.ic_no || '', taxNo: me.tax_no || '', socsoNo: me.socso_no || '', epfNo: me.epf_no || '', joinDate: me.join_date || '', resignDate: me.resign_date || '', bankAccount: printed?.account || me.bank_account || '',
    ...(printed ? { printedRows: { earnings: printed.earnings, deductions: printed.deductions } } : {}),
    ...less, annualLeaveDeduction: Number(slip.inputs?.annualLeaveDeduction) || 0, otherDeduction: Number(slip.inputs?.otherDeduction) || 0, adjustments: cleanAdjustments(slip.inputs?.adjustments), leave: r.leave || await payslipLeave(db, id, slip.year, slip.month) };
}
