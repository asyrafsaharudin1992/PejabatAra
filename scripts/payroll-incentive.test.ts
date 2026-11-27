import assert from 'node:assert/strict';
import { calculatePayslip, NO_INPUTS, taxableGross } from '../src/lib/payrollRun.ts';

const staff: any = { basicSalary: 9000, fixedAllowances: [], maritalStatus: '', spouseWorking: true, children: [], settings: {}, joinDate: null, resignDate: null };
const ytd = { wages: 90000, kwspRelief: 4000, pcbPaid: 5000, zakatPaid: 0 };
const run = (adjustments: any[]) => calculatePayslip(staff, { ...NO_INPUTS, adjustments }, ytd, 2026, 11) as any;
const plain = run([]), extra = run([{ type: 'Incentive', amount: 500, note: '' }]), bonus = run([{ type: 'Bonus', amount: 500, note: '' }]);
// The incentive is paid but not taxed, and does not enter the year-to-date wages.
assert.deepEqual([extra.gross, extra.nonTaxable, extra.pcb, extra.ytdAfter.wages], [plain.gross + 500, 500, plain.pcb, plain.ytdAfter.wages]);
assert.equal(Math.round((extra.net - plain.net) * 100) / 100, 500);
// Other additions are still taxed.
assert.ok(bonus.pcb > plain.pcb && bonus.nonTaxable === 0);
assert.equal(taxableGross(extra), plain.gross);
assert.equal(taxableGross({ gross: 2122.63, source: 'Infotech', allowances: [{ name: 'Incentives', amount: 144 }] }), 1978.63);
assert.equal(taxableGross({ gross: 2000 }), 2000);
console.log('Payroll incentive checks passed.');
assert.equal(taxableGross({ gross: 2359.23, source: 'Infotech', allowances: [{ name: 'Allowance Care Coordinator', amount: 100 }] }), 2259.23);
console.log('Care coordinator incentive check passed.');
const care = calculatePayslip({ ...staff, fixedAllowances: [{ name: 'Allowance Care Coordinator', amount: 100 }] }, NO_INPUTS, ytd, 2026, 11) as any;
assert.deepEqual([care.nonTaxable, care.pcb, care.ytdAfter.wages], [100, plain.pcb, plain.ytdAfter.wages]);
console.log('Care coordinator allowance in the pay run is not taxed.');
