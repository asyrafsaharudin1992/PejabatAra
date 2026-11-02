import assert from 'node:assert/strict';
import { buildHrCalendar, defaultCalendarConfig, validateCalendarRule, validateCalendarSettings, calendarEventOverdue, type CalendarPerson, type CalendarRule } from '../src/lib/hrCalendar';
const ca: CalendarPerson = { id: 'a', name: 'CA A', code: 'A', company: 'KJ', designation: 'CLINIC ASSISTANT', joinDate: '2026-10-20', confirmDate: null };
const dr: CalendarPerson = { ...ca, id: 'b', name: 'Doctor B', code: 'B', designation: 'DR RESIDENT', joinDate: '2026-10-25' };
const config = { ...defaultCalendarConfig(), probation: { a: 'probation' as const, b: 'probation' as const } };
let result = buildHrCalendar('2026-11', [ca, dr], config);
assert.equal(result.events.filter(e => e.category === 'payroll').length, 1);
const payroll = result.events.find(e => e.category === 'payroll')!;
assert.equal(payroll.start, '2026-11-15'); assert.equal(payroll.date, '2026-11-15');
assert.equal(calendarEventOverdue(payroll, '2026-11-15'), false);
assert.equal(calendarEventOverdue(payroll, '2026-11-16'), true);
assert.equal(result.events.filter(e => e.employeeId === 'a').length, 1); // Merges first CA evaluation + probation check.
assert.equal(result.events.find(e => e.employeeId === 'a')!.date, '2026-11-03');
assert.equal(result.events.find(e => e.employeeId === 'b')!.date, '2026-11-08');
assert.ok(!result.events.some(e => e.employeeId === 'b' && e.category === 'evaluation'));
result = buildHrCalendar('2026-12', [ca], config);
assert.equal(result.events.find(e => e.category === 'evaluation')!.date, '2026-12-03'); // Monthly from first 14-day evaluation.
result = buildHrCalendar('2027-01', [ca], config);
assert.equal(result.events.find(e => e.category === 'evaluation')!.date, '2027-01-03');
assert.ok(!result.events.some(e => e.category === 'probation')); // No separate third-month CA reminder.
assert.ok(!buildHrCalendar('2027-02', [ca], config).events.some(e => e.category === 'evaluation'));
result = buildHrCalendar('2027-01', [{ ...ca, confirmDate: '2026-12-01' }], config);
assert.ok(!result.events.some(e => e.category === 'probation')); // Already confirmed.
const rule: CalendarRule = { id: 'manual-one', title: 'Contract renewal', category: 'contract', employeeId: 'a', company: 'KJ', anchor: 'date', date: '2026-01-31', offsetMonths: 0, offsetDays: 0, repeat: 'monthly', every: 1, notes: 'Check T&C', enabled: true };
result = buildHrCalendar('2026-02', [ca], { ...config, rules: [rule] });
assert.equal(result.events.find(e => e.ruleId === rule.id)!.date, '2026-02-28');
result = buildHrCalendar('2026-03', [ca], { ...config, rules: [rule] });
assert.equal(result.events.find(e => e.ruleId === rule.id)!.date, '2026-03-31'); // No drift after a short month.
result = buildHrCalendar('2026-02', [ca], { ...config, rules: [{ ...rule, every: 2 }] });
assert.ok(!result.events.some(e => e.ruleId));
result = buildHrCalendar('2026-03', [ca], { ...config, rules: [{ ...rule, every: 2 }] });
assert.equal(result.events.find(e => e.ruleId)!.date, '2026-03-31');
const confirmed = { ...ca, confirmDate: '2026-10-15' };
result = buildHrCalendar('2027-10', [confirmed], { ...config, rules: [{ ...rule, category: 'appraisal', anchor: 'confirmation', date: '', offsetMonths: 12, repeat: 'none' }] });
assert.equal(result.events.find(e => e.ruleId)!.date, '2027-10-15');
result = buildHrCalendar('2026-11', [ca], { ...config, rules: [{ ...rule, anchor: 'confirmation', date: '' }] });
assert.ok(result.missingDates.some(message => message.includes('confirmation')));
result = buildHrCalendar('2026-11', [], { ...config, rules: [rule] });
assert.ok(!result.events.some(e => e.ruleId)); // Inactive/missing staff not shown.
const gift = { ...rule, employeeId: '', category: 'birthday' as const, date: '2024-02-29', offsetDays: -7, repeat: 'yearly' as const };
result = buildHrCalendar('2026-02', [], { ...config, rules: [gift] });
assert.equal(result.events.find(e => e.ruleId)!.date, '2026-02-21');
result = buildHrCalendar('2026-03', [ca], { ...config, rules: [{ ...rule, offsetMonths: 1 }] });
assert.equal(result.events.find(e => e.ruleId)!.date, '2026-03-31');
// A completed dated review satisfies its matching CA reminder and is not duplicated.
const reviews = [{ id: 'review-a', employeeId: 'a', due: '2026-11-03', label: 'First evaluation', status: 'submitted' }];
result = buildHrCalendar('2026-11', [ca], config, {}, reviews);
assert.equal(result.events.find(e => e.category === 'evaluation')!.state, 'done');
assert.equal(result.events.filter(e => e.reviewId === 'review-a').length, 1);
const event = result.events.find(e => e.category === 'evaluation')!;
result = buildHrCalendar('2026-11', [ca], config, { [event.id]: { state: 'skipped', at: '', by: 'HR' } }, reviews);
assert.equal(result.events.find(e => e.id === event.id)!.state, 'done'); // Actual review completion wins.
const payrollKey = payroll.id;
assert.equal(buildHrCalendar('2026-11', [], config, { [payrollKey]: { state: 'done', at: '', by: 'HR' } }).events.find(e => e.category === 'payroll')!.state, 'done');
assert.equal(buildHrCalendar('2026-12', [], config, { [payrollKey]: { state: 'done', at: '', by: 'HR' } }).events.find(e => e.category === 'payroll')!.state, 'open'); // Monthly completion never leaks.
assert.equal(buildHrCalendar('2026-11', [], { settings: { statutoryPayments: false, shareForecast: false, payroll: false, probationWeeks: false, probationMonths: false, caEvaluation: false, appraisal: false, birthdays: false, payrollDay: 15, forecastDay: 7, statutoryDay: 15, probationDays: 14, confirmMonths: 3 }, rules: [], probation: {} }).events.length, 0);
assert.throws(() => validateCalendarRule({ ...rule, date: '2026-02-30' }));
assert.throws(() => validateCalendarRule({ ...rule, every: 0 }));
assert.throws(() => validateCalendarRule({ ...rule, anchor: 'join', employeeId: '' }));
assert.throws(() => validateCalendarSettings({ ...config.settings, payroll: 'true' }));
assert.throws(() => buildHrCalendar('2026-13', [], config));
assert.deepEqual(validateCalendarRule(rule), rule);
console.log('HR calendar tests passed: payroll window, date-based milestones, CA cadence, confirmation, month-end recurrence, manual contracts/appraisals/gifts, review matching and occurrence isolation.');

// Appraisal remains annual from confirmation; birthdays use only the anniversary date.
const anniversaryPerson = { ...ca, joinDate: null, confirmDate: '2020-11-15', birthday: '1994-11-07' };
result = buildHrCalendar('2026-11', [anniversaryPerson], config);
assert.equal(result.events.find(e => e.category === 'appraisal')!.date, '2026-11-15');
assert.equal(result.events.find(e => e.category === 'birthday')!.date, '2026-11-07');
assert.ok(!result.events.find(e => e.category === 'birthday')!.notes.includes('1994'));
const annualReview = [{ id: 'annual', employeeId: 'a', due: '2026-11-15', label: 'Annual appraisal', status: 'submitted' }];
result = buildHrCalendar('2026-11', [anniversaryPerson], config, {}, annualReview);
assert.equal(result.events.find(e => e.category === 'appraisal')!.state, 'done');
assert.equal(result.events.filter(e => e.reviewId === 'annual').length, 1);
result = buildHrCalendar('2027-11', [anniversaryPerson], config, {}, annualReview);
assert.equal(result.events.find(e => e.category === 'appraisal')!.date, '2027-11-15');
result = buildHrCalendar('2020-11', [anniversaryPerson], config);
assert.ok(!result.events.some(e => e.category === 'appraisal')); // Not on confirmation day itself.
const leapPerson = { ...anniversaryPerson, birthday: '2000-02-29', confirmDate: '2024-02-29' };
result = buildHrCalendar('2026-02', [leapPerson], config);
assert.equal(result.events.find(e => e.category === 'birthday')!.date, '2026-02-28');
assert.equal(result.events.find(e => e.category === 'appraisal')!.date, '2026-02-28');
result = buildHrCalendar('2028-02', [leapPerson], config);
assert.equal(result.events.find(e => e.category === 'appraisal')!.date, '2028-02-29');
const birthdayGift = { ...rule, anchor: 'birthday' as const, category: 'birthday' as const, date: '', repeat: 'yearly' as const, offsetDays: -7 };
result = buildHrCalendar('2026-02', [leapPerson], { ...config, rules: [birthdayGift] });
assert.equal(result.events.find(e => e.ruleId)!.date, '2026-02-21');
assert.ok(buildHrCalendar('2026-11', [ca], config).missingDates.some(m => m.includes('birthday')));
console.log('Annual confirmation anniversaries, birthdays, leap years, birthday-based gift reminders and missing-date warnings passed.');

// Unknown confirmation dates are not enough to infer probation.
const verified = { ...ca, confirmDate: null };
assert.ok(!buildHrCalendar('2026-11', [verified], defaultCalendarConfig()).events.some(e => e.category === 'evaluation'));
assert.ok(buildHrCalendar('2026-11', [verified], defaultCalendarConfig()).missingDates.some(m => m.includes('probation status needs HR verification')));
assert.ok(!buildHrCalendar('2026-11', [verified], { ...config, probation: { a: 'not-probation' } }).events.some(e => e.category === 'evaluation'));
const futureConfirmation = { ...ca, confirmDate: '2026-12-01' };
assert.ok(buildHrCalendar('2026-11', [futureConfirmation], config, {}, [], '2026-11-02').events.some(e => e.category === 'evaluation'));
assert.ok(!buildHrCalendar('2026-12', [futureConfirmation], config, {}, [], '2026-11-02').events.some(e => e.category === 'evaluation'));
assert.ok(!buildHrCalendar('2026-11', [futureConfirmation], config, {}, [], '2026-12-01').events.some(e => e.category === 'evaluation'));
assert.ok(!buildHrCalendar('2026-11', [{ ...ca, confirmDate: '2026-11-03' }], config, {}, [], '2026-11-02').events.some(e => e.category === 'evaluation'));
console.log('Probation-only CA evaluation tests passed: unknown status, HR verification, explicit non-probation and confirmation cutoff.');

const { calendarEventOnDate, occurrenceCompletedOn, isMonthlyHrTask } = await import('../src/lib/hrCalendar');
const monthly = buildHrCalendar('2026-11', [], config).events.filter(isMonthlyHrTask);
assert.equal(monthly.length, 3);
assert.equal(monthly.find((e) => e.category === 'forecast')!.date, '2026-11-07');
assert.equal(monthly.find((e) => e.category === 'payroll')!.date, '2026-11-15');
assert.equal(monthly.find((e) => e.category === 'statutory')!.date, '2026-11-15');
for (const event of monthly) {
  assert.equal(event.start, event.date);
  assert.equal(Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`).some((date) => calendarEventOnDate(event, date)), false); // Pending: side list only.
  const states = { [event.id]: { state: 'done' as const, at: '2026-11-02T17:10:00.000Z', by: 'HR' } };
  const done = buildHrCalendar('2026-11', [], config, states).events.find((e) => e.id === event.id)!;
  assert.equal(done.completedOn, '2026-11-03');
  assert.deepEqual(Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`).filter((date) => calendarEventOnDate(done, date)), ['2026-11-03']);
  assert.equal(calendarEventOverdue(done, '2026-11-20'), false);
  assert.equal(buildHrCalendar('2026-12', [], config, states).events.find((e) => e.category === event.category)!.state, 'open');
  assert.equal(calendarEventOnDate({ ...done, completedOn: '2026-12-03' }, event.date), true); // Legacy month remains visible.
}
assert.equal(monthly.find((e) => e.category === 'payroll')!.id, 'payroll:2026-11-23'); // Existing saved ticks retained despite new due dates.
assert.equal(monthly.find((e) => e.category === 'statutory')!.id, 'statutory:2026-11-14');
assert.equal(occurrenceCompletedOn({ state: 'done', at: 'bad', by: 'HR' }), undefined);
console.log('Monthly side tasks passed: forecast due 7, payroll/statutory due 15, pending hidden from calendar, Done only on completion day, saved ticks retained and next month fresh.');
