import assert from 'node:assert/strict';
import { joinedForPay, proratedSalary } from '../src/lib/payrollRun.ts';

// November 2026 is paid for 20/10 to 19/11: someone who starts on 25/11 is not on it.
assert.equal(joinedForPay('2026-11-25', 2026, 11), false);
assert.equal(joinedForPay('2026-11-19', 2026, 11), true);
assert.equal(joinedForPay(null, 2026, 11), true);
// December pays 25/11 to 19/12: 25 of 30 days.
assert.equal(joinedForPay('2026-11-25', 2026, 12), true);
const december = proratedSalary(1800, 2026, 12, '2026-11-25');
assert.deepEqual([december.worked, december.total, december.amount], [25, 30, 1500]);
console.log('Payroll joiner checks passed.');
