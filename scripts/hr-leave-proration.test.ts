import assert from 'node:assert/strict';
import { joinYearEarned, resignationEarned } from '../src/lib/annualLeaveProration.js';

// 12 eligible, 11 completed months, 7 taken => 4 remaining.
assert.equal(resignationEarned(12, 2026, '2020-03-15', '2026-12-15'), 11);
assert.equal(resignationEarned(12, 2026, '2020-03-15', '2026-12-15')! - 7, 4);
assert.equal(resignationEarned(12, 2026, '2020-03-15', '2026-11-30'), 11);
assert.equal(resignationEarned(12, 2026, '2020-03-15', '2026-11-29'), 10);
assert.equal(resignationEarned(12, 2026, '2020-03-15', '2026-12-31'), 12);
assert.equal(resignationEarned(12, 2026, '2026-03-15', '2026-11-14'), 8);
assert.equal(resignationEarned(12, 2026, '2026-03-15', '2026-11-13'), 7);
assert.equal(resignationEarned(12, 2026, '2026-01-01', '2026-01-15'), 0);
assert.equal(resignationEarned(12, 2026, null, '2026-01-15'), 0);
assert.equal(resignationEarned(12, 2026, '2020-01-01', '2025-12-31'), 0);
assert.equal(resignationEarned(12, 2026, '2027-01-01', '2026-12-31'), 0);
assert.equal(resignationEarned(12, 2026, '2020-01-01', null), null);
assert.equal(resignationEarned(12, 2026, '2020-01-01', '2027-01-15'), null);
assert.equal(resignationEarned(18, 2026, '2020-01-01', '2026-01-31'), 2);
assert.equal(resignationEarned(12, 2024, '2020-01-01', '2024-02-29'), 2);
assert.equal(resignationEarned(12, 2024, '2024-01-31', '2024-02-28'), 0);
// The year someone joins: completed months from the join date to 31 December.
assert.equal(joinYearEarned(15, 2026, '2026-02-03'), 13, 'Joined 3 Feb: 10 completed months');
assert.equal(joinYearEarned(15, 2026, '2026-02-01'), 14, 'Joined 1 Feb: 11 completed months');
assert.equal(joinYearEarned(15, 2026, '2026-01-01'), 15, 'Joined 1 Jan: the whole year');
assert.equal(joinYearEarned(15, 2026, '2026-12-20'), 0);
assert.equal(joinYearEarned(15, 2026, '2025-02-03'), null, 'Joined in an earlier year: the whole entitlement');
assert.equal(joinYearEarned(15, 2026, null), null);
console.log('Annual leave resignation proration checks passed.');
