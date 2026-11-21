import assert from 'node:assert/strict';
import { attendanceHrAction, buildDaysFrom, clockSource } from '../api/_attendance.js';
import { DEFAULT_OT_POLICY } from '../api/_ot-rules.js';

const person = { id: 'a', company: 'SK', employee_code: 'TEST', full_name: 'Test', designation: 'CLINIC ASSISTANT', work_days: [-1], holiday_group: null };
const rules = { lateGrace: 15, earlyGrace: 15, countEarly: false, otMin: 60, policy: DEFAULT_OT_POLICY, versions: [], policyFor: () => DEFAULT_OT_POLICY, times: new Map([['staff|PM', { start: '21:00', end: '09:00' }], ['staff|AM-12', { start: '12:00', end: '21:00' }]]) };
const clock = (kind: string, date: string, time: string, device = 'phone') => ({ employee_id: 'a', kind, clock_at: `${date}T${time}:00+08:00`, device });
const roster = ['2026-11-10', '2026-11-11'].map((work_date) => ({ employee_id: 'a', work_date, shift: 'PM', works: true }));
const data = { roster, clocks: [clock('in', '2026-11-10', '11:50'), clock('in', '2026-11-10', '12:00', 'hr'), clock('out', '2026-11-10', '21:00', 'request'), clock('out', '2026-11-11', '09:00', 'request'), clock('in', '2026-11-11', '20:59'), clock('out', '2026-11-12', '12:36')], leave: [], holidays: [], ot: [], credit: [] };
const build = (input: typeof data & { clockRequests?: any[] }) => buildDaysFrom(input, [person], '2026-11-10', '2026-11-11', rules).get('a')!;
assert.equal(build(data)[0].status, 'absent', 'Unassigned early phone clocks must not be silently attached to a night shift');

const clockRequests = [{ employee_id: 'a', status: 'approved', work_date: '2026-11-10', in_time: '11:50:00', out_time: '09:00:00' }, { employee_id: 'a', status: 'approved', work_date: '2026-11-10', in_time: '12:00:00', out_time: '21:00:00' }];
const [corrected, next] = build({ ...data, clockRequests });
assert.equal(corrected.status, 'present');
assert.equal(corrected.inAt, new Date('2026-11-10T11:50:00+08:00').toISOString());
assert.equal(corrected.outAt, new Date('2026-11-11T09:00:00+08:00').toISOString());
assert.equal(corrected.worked, 1270);
assert.equal(corrected.otCounted, 540, 'Pre-shift OT remains separate from the 12-hour regular shift');
assert.equal(corrected.lateCounted, 0);
assert.deepEqual(next, build(data)[1], 'The following night shift must not change');

const manual = { ...data, clocks: [clock('in', '2026-11-10', '12:00', 'hr:2026-11-10'), clock('out', '2026-11-11', '09:00', 'hr:2026-11-10')] };
assert.equal(build(manual)[0].status, 'present');
assert.equal(build(manual)[0].worked, 1260);
assert.equal(build(manual)[0].otCounted, 540);
assert.equal(build(manual)[1].status, 'absent', 'A clock assigned to yesterday must not fill today');
assert.equal(build({ ...manual, clocks: [manual.clocks[0]] })[0].status, 'missing-out');
assert.equal(build({ ...data, clocks: [clock('in', '2026-11-10', '20:50'), clock('out', '2026-11-11', '09:05')] })[0].status, 'present');
assert.equal(build({ ...manual, leave: [{ employee_id: 'a', start_date: '2026-11-11', end_date: '2026-11-11', leave_type: 'AL' }] })[1].status, 'leave');
const pending = { employee_id: 'a', work_date: '2026-11-10', in_time: '12:00:00', out_time: '09:00:00', reason: 'Forgot to clock in', status: 'pending' };
const pendingDay = build({ ...data, clockRequests: [pending] })[0];
assert.equal(pendingDay.status, 'clock-pending', 'A submitted correction is not absence');
assert.equal(pendingDay.inAt, null, 'Pending times must not become approved attendance');
assert.equal(pendingDay.worked, 0);
assert.equal(pendingDay.otCounted, 0, 'Pending corrections must not create payable OT');
assert.equal(build({ ...data, clockRequests: [{ ...pending, status: 'supervisor_approved' }] })[0].status, 'clock-pending');
assert.equal(build({ ...data, clockRequests: [{ ...pending, status: 'rejected' }] })[0].status, 'absent');
assert.equal(build({ ...data, clockRequests: [{ ...pending, status: 'cancelled' }] })[0].status, 'absent');
assert.equal(build({ ...data, clockRequests: [{ ...pending, reason: 'Overtime' }] })[0].status, 'absent', 'An OT application alone does not excuse missing attendance');
const hasInPendingOut = build({ ...data, clocks: [clock('in', '2026-11-10', '20:50')], clockRequests: [{ ...pending, reason: 'Forgot to clock out' }] })[0];
assert.equal(hasInPendingOut.status, 'clock-pending');
assert.ok(hasInPendingOut.inAt);
assert.equal(hasInPendingOut.outAt, null);
const overnightCorrection = { ...data, roster: [roster[0], { ...roster[1], works: false, shift: 'OFF' }], clocks: [clock('in', '2026-11-11', '01:00', 'hr:2026-11-10'), clock('out', '2026-11-11', '09:00', 'hr:2026-11-10')] };
assert.equal(build(overnightCorrection)[0].status, 'present');
assert.equal(build(overnightCorrection)[1].status, 'off', 'A dated correction after midnight must not also become work on the following day off');
for (const [device, expected] of [['hr', 'hr'], ['hr:2026-11-10', 'hr'], ['request', 'request'], ['request:2026-11-10', 'request'], ['infotech:2026-11-10', 'infotech'], ['phone-device-id', 'phone']]) assert.equal(clockSource(device), expected);

// Repeated HR clicks must not create another identical clock or another audit entry.
const stored: any[] = [];
let audits = 0;
const db = { from(table: string) {
  const filters: [string, any][] = [];
  const query = {
    select() { return query; },
    eq(key: string, value: any) { filters.push([key, value]); return query; },
    async maybeSingle() { return { data: null, error: null }; },
    async limit() { return { data: stored.filter((row) => filters.every(([key, value]) => row[key] === value)), error: null }; },
    async insert(row: any) { if (table === 'hr_attendance_clocks') stored.push({ ...row, id: 'clock-1' }); else if (table === 'hr_audit') audits++; return { error: null }; },
  };
  return query;
} };
let response: any;
const res = { status(code: number) { assert.equal(code, 200); return res; }, json(body: any) { response = body; return body; } };
const body = { id: 'a', date: '2026-11-10', time: '12:00', kind: 'in' };
await attendanceHrAction({ method: 'POST' }, res, db, 'attendance_clock_add', body, 'HR');
assert.equal(stored[0].device, 'hr:2026-11-10');
await attendanceHrAction({ method: 'POST' }, res, db, 'attendance_clock_add', body, 'HR');
assert.equal(response.duplicate, true);
assert.equal(stored.length, 1);
assert.equal(audits, 1);
console.log('Early OT, dated HR clocks, approved corrections and consecutive night-shift checks passed.');

// Leave with a lone clock in (came in, then went on leave) is a leave day, not a missing clock out.
{
  const leaveDay = (clocks: any[]) => buildDaysFrom({ ...data, clocks, leave: [{ employee_id: 'a', start_date: '2026-11-10', end_date: '2026-11-11', leave_type: 'ML' }] }, [person], '2026-11-10', '2026-11-11', rules).get('a')![0];
  assert.equal(leaveDay([clock('in', '2026-11-10', '20:55')]).status, 'leave');
  assert.equal(leaveDay([]).status, 'leave');
  assert.equal(leaveDay([clock('in', '2026-11-10', '20:55'), clock('out', '2026-11-11', '09:05')]).status, 'present', 'a whole shift worked on a leave day still counts as worked');
}
console.log('Leave with a lone clock in tests passed.');
