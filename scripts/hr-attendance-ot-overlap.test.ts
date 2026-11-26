import assert from 'node:assert/strict';
import { amPm, likelyPm, needsOtHours } from '../src/lib/attendanceRequests.ts';
import { awayBetween, awayMinutes, ownClocks, shiftArrival, daySessions, missedClash, newClocks, shiftEndFor, stillOpen } from '../api/_attendance.ts';

const at = (day: string, time: string) => Date.parse(`2026-11-${day}T${time}:00+08:00`);
const clock = (kind: string, day: string, time: string) => ({ kind, at: at(day, time) });
const row = (kind: string, day: string, time: string) => ({ kind, clock_at: new Date(at(day, time)).toISOString() });
const kinds = (existing: ReturnType<typeof clock>[], rows: ReturnType<typeof row>[], day: string) => newClocks(existing, rows, at(day, '00:00')).map((item) => item.kind);

// The request repeats what the phone already recorded: nothing is added.
assert.deepEqual(kinds([clock('in', '22', '20:54'), clock('out', '23', '09:10')], [row('in', '22', '20:54'), row('out', '23', '09:10')], '22'), []);
// A shift 12:00-21:07, then OT on until the next morning: only the morning clock out is missing.
assert.deepEqual(kinds([clock('in', '04', '11:54'), clock('out', '04', '21:07')], [row('in', '04', '21:00'), row('out', '05', '09:00')], '04'), ['out']);
// More work the next day (a day off) starting when last night ended: both are added.
assert.deepEqual(kinds([clock('in', '04', '11:54'), clock('out', '05', '09:00')], [row('in', '05', '09:00'), row('out', '05', '12:00')], '05'), ['in', 'out']);
// No clocks at all: both are added.
assert.deepEqual(kinds([], [row('in', '07', '12:00'), row('out', '07', '21:00')], '07'), ['in', 'out']);
// Coming back hours after the shift ended is a separate stretch of work.
assert.deepEqual(kinds([clock('in', '10', '08:00'), clock('out', '10', '12:00')], [row('in', '10', '20:00'), row('out', '10', '23:00')], '10'), ['in', 'out']);
console.log('OT request clock overlap checks passed.');

// A clock in left open is only asked about between 14 and 30 hours.
const open = { kind: 'in', clock_at: new Date(at('04', '12:00')).toISOString() };
assert.equal(stillOpen(open, at('05', '00:00')), false);
assert.equal(stillOpen(open, at('05', '07:00')), true);
assert.equal(stillOpen(open, at('05', '19:00')), false);
assert.equal(stillOpen({ ...open, kind: 'out' }, at('05', '07:00')), false);
console.log('Open clock in question checks passed.');

// In 1 / Out 1 / In 2 / Out 2.
const stamp = (items: { kind: string; at: number; workDate?: string; added?: boolean; asked?: boolean }[], days: [string, string?, string?][]) => daySessions(items, days.map(([day, from, to]) => ({ date: `2026-11-${day}`, inAt: from ? new Date(at(day, from)).toISOString() : null, outAt: to ? new Date(to.includes('+') ? at(String(Number(day) + 1).padStart(2, '0'), to.slice(1)) : at(day, to)).toISOString() : null })));
// A shift, then OT until the next morning: two pairs on the first day, and the next day keeps its own.
const long = stamp([clock('in', '04', '11:54'), { ...clock('in', '04', '21:00'), workDate: '2026-11-04' }, clock('out', '04', '21:07'), { ...clock('out', '05', '09:00'), workDate: '2026-11-04' }, { ...clock('in', '05', '09:00'), workDate: '2026-11-05' }, { ...clock('out', '05', '12:00'), workDate: '2026-11-05' }], [['04', '11:54', '+09:00'], ['05', '09:00', '12:00']]);
assert.deepEqual(long.get('2026-11-04'), [{ in: at('04', '11:54'), out: at('04', '21:07') }, { in: at('04', '21:00'), out: at('05', '09:00') }]);
assert.deepEqual(long.get('2026-11-05'), [{ in: at('05', '09:00'), out: at('05', '12:00') }]);
// The same clocks twice (phone and request): one pair.
assert.deepEqual(stamp([clock('in', '22', '20:54'), clock('in', '22', '20:54'), clock('out', '23', '09:10')], [['22', '20:54', '+09:10']]).get('2026-11-22'), [{ in: at('22', '20:54'), out: at('23', '09:10') }]);
// Home and back again.
assert.equal(stamp([clock('in', '10', '08:00'), clock('out', '10', '17:00'), clock('in', '10', '20:00'), clock('out', '10', '23:00')], [['10', '08:00', '23:00']]).get('2026-11-10')!.length, 2);
console.log('Session column checks passed.');

// A request's clock out before the person's own later clock out, with no clock in between: only the real one is shown.
assert.deepEqual(stamp([clock('in', '18', '20:59'), { ...clock('out', '19', '09:00'), workDate: '2026-11-18', added: true, asked: true }, { ...clock('out', '19', '10:43'), workDate: undefined }], [['18', '20:59', '+10:43']]).get('2026-11-18'), [{ in: at('18', '20:59'), out: at('19', '10:43') }]);
console.log('Request clock out before the real one check passed.');

// Forgot to clock: only the missing time may differ from what is recorded.
assert.equal(missedClash({ in: '09:15', out: '' }, { in: '09:15', out: '18:00' }), null);
assert.deepEqual(missedClash({ in: '09:15', out: '' }, { in: '09:00', out: '18:00' }), { kind: 'in', at: '09:15', asked: '09:00' });
assert.deepEqual(missedClash({ in: '20:59', out: '10:43' }, { in: '20:59', out: '09:00' }), { kind: 'out', at: '10:43', asked: '09:00' });
console.log('Forgot to clock checks passed.');

// OT hours are required for OT reasons; AM and PM are shown, and a likely mix-up is offered back.
assert.deepEqual(['Overtime', 'Worked on rest day / public holiday', 'Other'].map(needsOtHours), [true, true, false]);
assert.deepEqual(['06:02', '18:02', '00:15', '12:00'].map(amPm), ['6:02 AM', '6:02 PM', '12:15 AM', '12:00 PM']);
assert.equal(likelyPm('08:57', '06:02', '09:00', '18:00'), '18:02');
assert.equal(likelyPm('20:56', '09:00', '21:00', '09:00'), '', 'A night shift ends the next morning');
assert.equal(likelyPm('21:00', '09:00', '12:00', '21:00'), '', '9 PM would not be after the time in');
assert.equal(likelyPm('09:00', '18:00', '09:00', '18:00'), '');
console.log('OT hours and AM/PM checks passed.');

// Time away: home at 17:00, back 20:00 to 23:00, is 3 hours of extra time and not 6.
const away = [clock('in', '10', '08:00'), clock('out', '10', '17:00'), clock('in', '10', '20:00'), clock('out', '10', '23:00')];
assert.equal(awayBetween(away, at('10', '08:00'), at('10', '23:00'), [[at('10', '17:00'), at('10', '23:00')]]), 180);
assert.equal(awayMinutes(away, at('10', '08:00'), at('10', '23:00')), 180);
// A gap of 30 minutes or less is work that carried on; overlapping clocks are not time away.
assert.equal(awayMinutes([clock('in', '10', '08:00'), clock('out', '10', '17:00'), clock('in', '10', '17:30'), clock('out', '10', '23:00')], at('10', '08:00'), at('10', '23:00')), 0);
assert.equal(awayMinutes([clock('in', '04', '11:54'), clock('in', '04', '21:00'), clock('out', '04', '21:07'), clock('out', '05', '09:00')], at('04', '11:54'), at('05', '09:00')), 0);
console.log('Time away checks passed.');

// OT through the night, then more work written for the next date starting when it ended: nothing was away.
const night: { kind: string; at: number; workDate?: string }[] = [clock('in', '04', '11:54'), clock('out', '04', '21:07'), { ...clock('in', '05', '09:00'), workDate: '2026-11-05' }, { ...clock('out', '05', '09:00'), workDate: '2026-11-04' }];
assert.equal(awayMinutes(ownClocks(night, '2026-11-04'), at('04', '11:54'), at('05', '09:00')), 0);
console.log('Next-date clock check passed.');

// Late is judged by the arrival for the shift, not by an earlier visit the same day.
const errand = [clock('in', '23', '09:00'), clock('out', '23', '10:00'), clock('in', '23', '21:30'), clock('out', '24', '09:00')];
assert.equal(shiftArrival(errand, at('23', '09:00'), at('23', '21:00')), at('23', '21:30'));
assert.equal(shiftArrival([clock('in', '10', '08:55'), clock('out', '10', '13:00'), clock('in', '10', '14:00'), clock('out', '10', '18:00')], at('10', '08:55'), at('10', '09:00')), at('10', '08:55'), 'A break during the shift is not a late arrival');
assert.equal(shiftArrival([clock('in', '10', '07:00'), clock('out', '10', '07:50'), clock('in', '10', '08:00'), clock('out', '10', '18:00')], at('10', '07:00'), at('10', '09:00')), at('10', '07:00'), 'A short gap is work that carried on');
console.log('Late arrival checks passed.');

// Left before the shift and the only later clock in is another day's: not this shift's arrival.
assert.equal(shiftArrival([clock('in', '14', '08:51'), clock('out', '14', '11:00'), clock('in', '15', '12:00')], at('14', '08:51'), at('14', '12:00')), at('14', '08:51'));
console.log('Other day clock in check passed.');

// A shift that ended more than two hours ago asks too, even within 14 hours.
const morning = { kind: 'in', clock_at: new Date(at('10', '09:00')).toISOString() };
const days = [{ start: new Date(at('10', '09:00')).toISOString(), end: new Date(at('10', '18:00')).toISOString() }];
assert.equal(shiftEndFor(days, at('10', '08:55')), at('10', '18:00'));
assert.equal(shiftEndFor(days, at('10', '20:00')), null, 'A clock in after the shift ended belongs to no shift');
assert.equal(stillOpen(morning, at('10', '19:30'), at('10', '18:00')), false, 'An ordinary late clock out is not asked about');
assert.equal(stillOpen(morning, at('10', '21:00'), at('10', '18:00')), true);
console.log('Past shift end question checks passed.');
