import assert from 'node:assert/strict';
import { monthKey, monthList } from '../api/_payslip-hidden.ts';

const hidden = monthList([{ payload: { months: ['2026-11'] } }, { payload: null }]);
assert.ok(hidden.has(monthKey(2026, 11)));
assert.ok(!hidden.has(monthKey(2026, 10)) && !hidden.has(monthKey(2027, 11)));
assert.equal(monthList([]).size, 0);
console.log('Hidden payslip month checks passed.');
