import assert from 'node:assert/strict';
import { changeLines, joinLine } from '../src/lib/careerAuto.ts';

assert.deepEqual(joinLine({ join_date: '2026-11-25' }).map((l) => [l.kind, l.event_date]), [['Join Date', '2026-11-25']]);
assert.equal(joinLine({ join_date: null }).length, 0);
const before = { designation: 'CLINIC ASSISTANT', department: 'OPERATION', company: 'SK', basic_salary: '1800.00', confirm_date: null, resign_date: null, employment_type: 'Permanent' };
assert.equal(changeLines(before, { ...before, basic_salary: 1800 }, '2026-11-26').length, 0, 'The same salary as text and number is not a change');
const lines = changeLines(before, { ...before, designation: 'ADMIN', basic_salary: 2000, confirm_date: '2026-11-01', resign_date: '2026-12-20' }, '2026-11-26');
assert.deepEqual(lines.map((l) => l.kind), ['Designation', 'Confirmation', 'Resignation', 'Other']);
assert.ok(lines.every((l) => !/^(Increment|Salary Adjustment)$/.test(l.kind)), 'A profile edit is never counted as a raise by the pay run');
assert.deepEqual(changeLines(before, { resign_date: '2026-12-01' }, '2026-11-26').map((l) => l.kind), ['Resignation']);
console.log('Employment history checks passed.');
