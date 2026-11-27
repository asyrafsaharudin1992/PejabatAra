import assert from 'node:assert/strict';
import { noPayOf } from '../api/_nopay.ts';
import { calculatePayslip, NO_INPUTS } from '../src/lib/payrollRun.ts';

const staff: any = { basicSalary: 2600, fixedAllowances: [], maritalStatus: '', spouseWorking: true, children: [], settings: {}, joinDate: null, resignDate: null };
const out: any = calculatePayslip(staff, { ...NO_INPUTS, unpaidDays: 2 }, { wages: 0, kwspRelief: 0, pcbPaid: 0, zakatPaid: 0 }, 2026, 11);
assert.deepEqual([out.basic, out.noPay], [2426.66, 173.34]);
// A slip saved before the amount was kept: worked out at the salary of that month, not a later raise.
const db = (rows: any[]) => ({ from: () => { const q: any = { select: () => q, eq: () => q, in: () => q, gt: () => q, order: () => q, limit: async () => ({ data: rows }) }; return q; } });
const slip = { year: 2026, month: 11, inputs: { unpaidDays: 2 }, result: {} };
assert.equal((await noPayOf(db([]), 'x', slip, 2600)).noPay, 173.34);
assert.equal((await noPayOf(db([{ from_value: '2600.00' }]), 'x', slip, 2800)).noPay, 173.34);
assert.equal((await noPayOf(db([]), 'x', { ...slip, inputs: {} }, 2600)).noPay, 0);
console.log('Payslip no pay checks passed.');
