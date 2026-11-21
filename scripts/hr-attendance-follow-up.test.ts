import assert from 'node:assert/strict';
import { attendanceFollowUps, attendanceFollowUpStatus, emptyFollowUp } from '../src/lib/attendanceFollowUp.js';

const day = (followUp = emptyFollowUp(), odd: string[] = [], soft: string[] = []) => ({ followUp, odd, soft });
const approvedOt = { ...emptyFollowUp(), ot: [{ status: 'approved' }] };
assert.equal(attendanceFollowUpStatus(day(emptyFollowUp(), ['Absent'])), 'unresolved');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), missed: [{ reason: 'Forgot to clock out', status: 'pending' }] })), 'awaiting');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), ot: [{ status: 'supervisor_approved' }] })), 'awaiting');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), missed: [{ reason: 'Forgot to clock out', status: 'approved' }] })), 'settled');
assert.equal(attendanceFollowUpStatus(day(approvedOt, ['More than 14 hours'])), 'settled');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), otDecision: 'rejected' }, ['Clocked on a day off'])), 'settled');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), otDecision: 'pending' })), 'awaiting');
assert.equal(attendanceFollowUpStatus(day(emptyFollowUp(), ['Clocked on a day off'])), 'unresolved');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), ot: [{ status: 'cancelled' }] }, ['More than 14 hours'])), 'unresolved');
assert.equal(attendanceFollowUpStatus(day(approvedOt, ['No clock out', 'More than 14 hours'])), 'unresolved');
assert.equal(attendanceFollowUpStatus(day({ ...approvedOt, missed: [{ reason: 'Forgot to clock out', status: 'pending' }] })), 'awaiting');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), credit: [{ kind: 'late', hours: 1 }] })), 'settled');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), credit: [{ kind: 'late', hours: 1 }] }, [], ['Late'])), 'unresolved');
assert.equal(attendanceFollowUpStatus(day({ ...approvedOt, missed: [{ reason: 'Forgot to clock in', status: 'approved' }] }, [], ['Early out'])), 'unresolved');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), ot: [{ status: 'rejected' }] })), 'settled');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), ot: [{ status: 'unknown' }] })), 'unresolved');

// Latest request per type wins; an old approval must not hide a new pending request.
const request = (reason: string, status: string) => ({ employee_id: 'a', work_date: '2026-11-19', reason, status });
const rows = attendanceFollowUps([
  request('Overtime', 'draft'), request('Overtime', 'pending'), request('Overtime', 'approved'),
  request('Forgot to clock out', 'approved'), request('Forgot to clock out', 'pending'),
  request('Forgot to clock in', 'rejected'),
], [{ employee_id: 'a', work_date: '2026-11-19', kind: 'late', hours: 1 }], []);
const follow = rows.get('a|2026-11-19')!;
assert.deepEqual(follow.ot, [{ status: 'pending' }]);
assert.deepEqual(follow.missed.map((r) => r.status), ['approved', 'rejected']);
assert.equal(attendanceFollowUpStatus(day(follow)), 'awaiting');
assert.equal(rows.size, 1);
// A pending request wins over an unrelated flag; once it is rejected the flag is HR's to chase again.
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), missed: [{ reason: 'Forgot to clock out', status: 'pending' }] }, ['Absent'])), 'awaiting');
assert.equal(attendanceFollowUpStatus(day({ ...emptyFollowUp(), missed: [{ reason: 'Forgot to clock out', status: 'rejected' }] }, ['No clock out'])), 'unresolved');
console.log('Attendance follow-up status and request grouping checks passed.');

// A long day whose OT was decided on the next day (covered) is settled, not unresolved.
{
  const covered = { odd: ['More than 14 hours'], soft: [], followUp: { ot: [], missed: [], credit: [], otDecision: 'covered' } };
  assert.equal(attendanceFollowUpStatus(covered), 'settled');
}
console.log('Covered OT follow-up check passed.');
