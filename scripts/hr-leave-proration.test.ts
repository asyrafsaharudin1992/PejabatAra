import assert from 'node:assert/strict';
import { resignationEarned } from '../src/lib/annualLeaveProration.js';

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
console.log('Annual leave resignation proration checks passed.');
