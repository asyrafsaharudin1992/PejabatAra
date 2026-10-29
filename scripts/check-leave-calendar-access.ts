import assert from 'node:assert/strict';
import { calendarAccessFor, calendarPersonVisible } from '../api/_leave-calendar-access.js';
import { demoCalendar } from '../api/_local-leave-demo.js';

const staff = { id: 'me', company: 'KJ', department: 'OPERATION' };
const ordinary = calendarAccessFor(staff);
assert(calendarPersonVisible(ordinary, { ...staff, id: 'peer' }));
assert(!calendarPersonVisible(ordinary, { ...staff, id: 'doctor', department: 'DOCTOR' }));
assert(!calendarPersonVisible(ordinary, { ...staff, id: 'sk', company: 'SK' }));
const kj = calendarAccessFor({ ...staff, leave_calendar_companies: ['KJ', 'UNKNOWN', 'KJ'] });
assert.deepEqual(kj.companies, ['KJ']);
assert(calendarPersonVisible(kj, { ...staff, department: 'DOCTOR' }));
assert(!calendarPersonVisible(kj, { ...staff, company: 'SK' }));
assert.equal(calendarAccessFor({ ...staff, leave_calendar_companies: 'KJ,SK' }).scope, 'department');
const unassigned = calendarAccessFor({ ...staff, department: null });
assert.equal(unassigned.scope, 'self');
assert(!calendarPersonVisible(unassigned, { ...staff, id: 'peer', department: null }));
assert(calendarPersonVisible(unassigned, { ...staff, department: null }));
for (const [id, expected] of [['staff-kj', 2], ['admin-kj', 5], ['admin-sk', 2], ['admin-both', 7]] as const) {
  assert.equal(demoCalendar(id, '2026-10').items.length, expected);
}
assert(demoCalendar('admin-kj', '2026-10').items.every(person => person.company === 'KJ'));
assert(demoCalendar('admin-sk', '2026-10').items.every(person => person.company === 'SK'));
console.log('Calendar access checks passed: department, company, cross-company, invalid permissions, missing department and four demo accounts.');
