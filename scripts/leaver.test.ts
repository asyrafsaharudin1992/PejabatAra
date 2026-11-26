import assert from 'node:assert/strict';
import { canClose, hasLeft, lastPayMonth, LEAVER_ACTIONS } from '../api/_leaver.ts';

assert.equal(hasLeft({ status: 'Active', resign_date: '2026-12-20' }, '2026-12-20'), false, 'The last working day is still a working day');
assert.equal(hasLeft({ status: 'Active', resign_date: '2026-12-20' }, '2026-12-21'), true);
assert.equal(hasLeft({ status: 'Inactive', resign_date: null }, '2026-12-01'), true);
assert.deepEqual(lastPayMonth('2026-11-19'), { year: 2026, month: 11 });
assert.deepEqual(lastPayMonth('2026-11-25'), { year: 2026, month: 12 });
assert.deepEqual(lastPayMonth('2026-12-20'), { year: 2027, month: 1 });
const now = Date.parse('2027-01-30T00:00:00Z');
const done = { formsCompleted: 1, formsWaiting: 0, payslipLockedAt: '2027-01-01T00:00:00Z' };
assert.equal(canClose(done, now), true);
assert.equal(canClose({ ...done, formsCompleted: 0 }, now), false, 'Stays open until a form has been filled');
assert.equal(canClose({ ...done, formsWaiting: 1 }, now), false);
assert.equal(canClose({ ...done, payslipLockedAt: null }, now), false);
assert.equal(canClose({ ...done, payslipLockedAt: '2027-01-25T00:00:00Z' }, now), false, '14 days to save the last payslip');
for (const action of ['me', 'my_payslips', 'pdfform_open', 'set_password', 'announcements']) assert.ok(LEAVER_ACTIONS.test(action), action);
for (const action of ['attendance_clock', 'leave_apply', 'leave_history', 'my_documents', 'hr_office_session', 'review_get', 'incentive_add', 'my_profile', 'care']) assert.ok(!LEAVER_ACTIONS.test(action), action);
console.log('Leaver access checks passed.');
