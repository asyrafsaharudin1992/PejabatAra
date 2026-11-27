import assert from 'node:assert/strict';
import { payslipLeave, unpaidByDate } from '../api/_leave-summary.ts';

// A made-up database: each table returns its rows, filtered by the date conditions the code asks for.
const fake = (tables: Record<string, any[]>) => ({ from: (name: string) => {
  let rows = tables[name] || [];
  const q: any = { select: () => q, eq: () => q, in: () => q, order: () => q,
    gte: (key: string, value: string) => { rows = rows.filter((row) => row[key] >= value); return q; },
    lte: (key: string, value: string) => { rows = rows.filter((row) => row[key] <= value); return q; },
    limit: () => q, then: (done: any, failed: any) => Promise.resolve({ data: rows, error: null }).then(done, failed) };
  return q;
} });
const leave = (start_date: string, end_date: string, days: number, leave_group = 'AL') => ({ leave_group, start_date, end_date, days });
const person = { work_days: [0, 1, 2, 3, 4, 5, 6], holiday_group: '' };
const run = (requests: any[], year: number, month: number, more: Record<string, any[]> = {}) => payslipLeave(fake({ hr_leave_requests: requests, hr_employees: [person], ...more }), 'x', year, month);

// Five days over the 19th: two on the December slip, three on the next.
const crossing = [leave('2026-12-18', '2026-12-22', 5)];
const balance = { hr_leave_balances: [{ leave_group: 'AL', balance: 4 }] };
assert.deepEqual((await run(crossing, 2026, 12, balance)).al, { period: 2, ytd: 2, balance: 7 });
// The January slip shows the December days; they are not part of the new year.
assert.deepEqual((await run(crossing, 2027, 1)).al, { period: 3, ytd: 0, balance: null });
// Leave wholly between 20 and 31 December is on the January slip.
assert.equal((await run([leave('2026-12-28', '2026-12-29', 2, 'ML')], 2027, 1)).ml.period, 2);
// Rest days are not given any of the days: Friday to Monday with a weekend off is one day each side of Friday the 19th.
const weekend = [leave('2027-03-19', '2027-03-22', 2)];
const office = { hr_employees: [{ work_days: [1, 2, 3, 4, 5], holiday_group: '' }] };
assert.equal((await run(weekend, 2027, 3, office)).al.period, 1);
assert.equal((await run(weekend, 2027, 4, office)).al.period, 1);
// The duty roster decides where there is one.
const roster = { hr_roster: [{ work_date: '2027-03-20', works: true, shift: 'AM' }, { work_date: '2027-03-22', works: false, shift: 'OFF' }] };
assert.equal((await run(weekend, 2027, 3, { ...office, ...roster })).al.period, 1);
assert.equal((await run(weekend, 2027, 4, { ...office, ...roster })).al.period, 1);
// Ordinary leave inside one period, with a half day.
assert.deepEqual((await run([leave('2026-11-02', '2026-11-02', 0.5), leave('2026-10-05', '2026-10-06', 2)], 2026, 11)).al, { period: 0.5, ytd: 2.5, balance: null });
// Unpaid leave for payroll: 18 to 22 December 2026 for Monday to Friday work is one day in December (Friday) and two in January (Monday, Tuesday).
const unpaid = [{ employee_id: 'x', start_date: '2026-12-18', end_date: '2026-12-22', days: 3 }];
const staffDb = fake({ hr_employees: [{ id: 'x', work_days: [1, 2, 3, 4, 5], holiday_group: '' }] });
assert.deepEqual(await unpaidByDate(staffDb, unpaid, '2026-11-20', '2026-12-19'), [{ employee_id: 'x', date: '2026-12-18', days: 1 }]);
assert.deepEqual((await unpaidByDate(staffDb, unpaid, '2026-12-20', '2027-01-19')).map((item) => [item.date, item.days]), [['2026-12-21', 1], ['2026-12-22', 1]]);
// A single date, whole or half, is taken as it is.
assert.deepEqual(await unpaidByDate(staffDb, [{ employee_id: 'x', start_date: '2026-12-20', end_date: '2026-12-20', days: 0.5 }], '2026-12-20', '2027-01-19'), [{ employee_id: 'x', date: '2026-12-20', days: 0.5 }]);
console.log('Payslip leave checks passed.');
