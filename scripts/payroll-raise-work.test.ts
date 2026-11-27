import assert from 'node:assert/strict';
import { calculatePayslip, NO_INPUTS } from '../src/lib/payrollRun.ts';

const ytd = { wages: 0, kwspRelief: 0, pcbPaid: 0, zakatPaid: 0 };
const base: any = { basicSalary: 2164.28, fixedAllowances: [], maritalStatus: '', spouseWorking: true, children: [], settings: {}, joinDate: null, resignDate: null };
const run = (staff: any, inputs: any) => calculatePayslip(staff, { ...NO_INPUTS, ...inputs }, ytd, 2026, 11) as any;
// November 2026, raise 2042.00 -> 2164.28 on 18 Nov: OT and a public holiday before it at the old rate, OT after it at the new one.
const raised = { ...base, salaryChanges: [{ date: '2026-11-18', from: 2042 }], workDays: [{ date: '2026-11-02', ot15: 4 }, { date: '2026-11-03', ot30: 3 }, { date: '2026-11-08', phDays: 1 }, { date: '2026-11-18', ot15: 1 }] };
const out = run(raised, { ot15: 5, ot30: 3, phDays: 1 });
assert.deepEqual([out.ot, out.restPh], [162.92, 157.08]);
// Hours HR types beyond what Attendance has are paid at the latest salary; fewer hours are never paid more than typed.
assert.equal(run(raised, { ot15: 6, ot30: 3 }).ot, 178.53);
assert.equal(run(raised, { ot15: 2 }).ot, 29.46);
// No raise: the same as before.
assert.deepEqual([run(base, { ot15: 5, ot30: 3, phDays: 1 }).ot, run(base, { phDays: 1 }).restPh], [171.77, 166.48]);
console.log('Payroll raise OT and holiday checks passed.');
// Unpaid leave before the raise is cut at the old salary / 30, after it at the new one.
const away = { ...base, salaryChanges: [{ date: '2026-11-18', from: 2042 }], workDays: [{ date: '2026-10-26', unpaidDays: 1 }, { date: '2026-11-19', unpaidDays: 1 }] };
assert.equal(run(away, { unpaidDays: 1 }).noPay, 68.07);
assert.equal(run(away, { unpaidDays: 2 }).noPay, 140.21);
console.log('Payroll raise unpaid leave checks passed.');
