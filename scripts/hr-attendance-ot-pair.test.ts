import assert from 'node:assert/strict';
import { buildDaysFrom } from '../api/_attendance.js';
import { DEFAULT_OT_POLICY } from '../api/_ot-rules.js';

const person = { id: 'a', company: 'SK', employee_code: 'TEST', full_name: 'Test', designation: 'CLINIC ASSISTANT', work_days: [-1], holiday_group: null };
const rules: any = { lateGrace: 15, earlyGrace: 15, countEarly: false, otMin: 60, policy: DEFAULT_OT_POLICY, versions: [], policyFor: () => DEFAULT_OT_POLICY, times: new Map([['staff|AM-12', { start: '09:00', end: '21:00' }], ['staff|PM', { start: '21:00', end: '09:00' }]]) };
const clock = (kind: string, date: string, time: string, device = 'phone') => ({ employee_id: 'a', kind, clock_at: `${date}T${time}:00+08:00`, device });
const build = (clocks: any[], roster: string[]) => buildDaysFrom({ roster: roster.map((shift, i) => ({ employee_id: 'a', work_date: `2026-11-1${i}`, shift, works: true })), clocks, leave: [], holidays: [], ot: [], credit: [] } as any, [person], '2026-11-10', '2026-11-11', rules).get('a')!;

// Shift 9am to 9pm, then clock out and clock in again and work until 9am: the second pair is OT.
const twice = [clock('in', '2026-11-10', '08:58'), clock('out', '2026-11-10', '21:00'), clock('in', '2026-11-10', '21:02'), clock('out', '2026-11-11', '09:00')];
const [day] = build(twice, ['AM-12']);
assert.equal(day.status, 'present');
assert.equal(day.inAt, new Date('2026-11-10T08:58:00+08:00').toISOString());
assert.equal(day.outAt, new Date('2026-11-10T21:00:00+08:00').toISOString());
assert.equal(day.ot2InAt, new Date('2026-11-10T21:02:00+08:00').toISOString());
assert.equal(day.ot2OutAt, new Date('2026-11-11T09:00:00+08:00').toISOString());
assert.equal(day.ot, 720, 'Two minutes early plus the 718 minute second pair');
assert.equal(day.worked, 722, 'The shift itself is not stretched');

// One pair a day (almost everyone) is unchanged and has no OT pair.
const [single] = build([clock('in', '2026-11-10', '08:58'), clock('out', '2026-11-10', '21:05')], ['AM-12']);
assert.equal(single.ot2InAt ?? null, null);
assert.equal(single.ot2OutAt ?? null, null);
assert.equal(single.ot, 7);

// A clock in just after a night shift that is really the next day's day shift is not an OT pair.
const [night, nextDay] = build([clock('in', '2026-11-10', '20:58'), clock('out', '2026-11-11', '09:00'), clock('in', '2026-11-11', '09:02'), clock('out', '2026-11-11', '21:00')], ['PM', 'AM-12']);
assert.equal(night.ot2InAt ?? null, null);
assert.equal(nextDay.status, 'present');
assert.equal(nextDay.inAt, new Date('2026-11-11T09:02:00+08:00').toISOString());

// A clock in with no clock out yet shows the OT in and counts nothing extra.
const [open] = build(twice.slice(0, 3), ['AM-12']);
assert.equal(open.ot2OutAt ?? null, null);
assert.equal(open.ot, 2);
console.log('OT pair after the shift checks passed.');
