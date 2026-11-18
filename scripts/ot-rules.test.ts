// Run: npx tsx scripts/ot-rules.test.ts
import assert from 'node:assert/strict';
import { classifyDay, cleanPolicy, DEFAULT_OT_POLICY, netMinutes, otParts, otSummary, parseVersions, paySummary, pickPolicy } from '../api/_ot-rules';

const H = 60;
// Net hours: rest of 1 hour is taken off only on days off and public holidays, and only above 5 hours.
assert.equal(netMinutes('rest', 9 * H), 8 * H);
assert.equal(netMinutes('off', 5 * H), 5 * H);
assert.equal(netMinutes('off', 6 * H), 5 * H);
assert.equal(netMinutes('ph', 4 * H + 40), 4 * H);
assert.equal(netMinutes('normal', 3 * H), 3 * H);
// A long OT on a normal day (a whole extra shift after the shift) has the rest taken off too.
assert.equal(netMinutes('normal', 12 * H), 11 * H);
assert.equal(netMinutes('normal', 9 * H), 8 * H);
assert.equal(netMinutes('normal', 5 * H), 5 * H);

// Normal day, after the shift: 3 hours at 1.5x (9am-6pm shift, stayed until 9pm).
assert.deepEqual(otParts('normal', 3 * H + 20), [{ minutes: 3 * H, multiplier: 1.5 }]);
assert.deepEqual(otParts('normal', 12 * H), [{ minutes: 11 * H, multiplier: 1.5 }]);
assert.deepEqual(otParts('normal', 30), []);
// Off day: all hours at 1.5x, rest taken off.
assert.deepEqual(otParts('off', 9 * H), [{ minutes: 8 * H, multiplier: 1.5 }]);
// Rest day: up to 4 h = half day (4 h at 1.0), up to 8 h = a day (8 h at 1.0), then 2.0 beyond 8 h.
assert.deepEqual(otParts('rest', 3 * H), [{ minutes: 4 * H, multiplier: 1, flat: 'rest' }]);
assert.deepEqual(otParts('rest', 4 * H), [{ minutes: 4 * H, multiplier: 1, flat: 'rest' }]);
assert.deepEqual(otParts('rest', 5 * H), [{ minutes: 8 * H, multiplier: 1, flat: 'rest' }]);
assert.deepEqual(otParts('rest', 9 * H), [{ minutes: 8 * H, multiplier: 1, flat: 'rest' }]);      // 9 h worked, 8 h after rest, a day pay
assert.deepEqual(otParts('rest', 11 * H), [{ minutes: 8 * H, multiplier: 1, flat: 'rest' }, { minutes: 2 * H, multiplier: 2 }]);
// Public holiday: any time up to 8 h is 2 x ORP, a whole day; beyond 8 h at 3.0x.
assert.deepEqual(otParts('ph', 4 * H), [{ minutes: 8 * H, multiplier: 2, flat: 'ph' }]);
assert.deepEqual(otParts('ph', 8 * H), [{ minutes: 8 * H, multiplier: 2, flat: 'ph' }]);
assert.deepEqual(otParts('ph', 13 * H), [{ minutes: 8 * H, multiplier: 2, flat: 'ph' }, { minutes: 4 * H, multiplier: 3 }]);
assert.deepEqual(otParts('ph', 30), []);
// Pay in hours x rate for a public holiday of 4 hours equals 2 x ORP (16 HRP): 8 h x 2.0.
assert.equal(otParts('ph', 4 * H).reduce((sum, part) => sum + (part.minutes / H) * part.multiplier, 0), 16);
// Rest day 3 h = 0.5 x ORP (4 HRP): 4 h x 1.0. Rest day 8 h = 1 x ORP (8 HRP).
assert.equal(otParts('rest', 3 * H).reduce((sum, part) => sum + (part.minutes / H) * part.multiplier, 0), 4);
assert.equal(otParts('rest', 8 * H).reduce((sum, part) => sum + (part.minutes / H) * part.multiplier, 0), 8);

// Day kind. Week of 16 Nov 2026 (Monday) to 22 Nov. Works Mon-Fri, Sat and Sun off: Sunday is the rest day, Saturday an off day.
const monToFri = (date: string) => { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return day >= 1 && day <= 5; };
const none = () => false;
assert.equal(classifyDay('2026-11-16', monToFri, none), 'normal');
assert.equal(classifyDay('2026-11-21', monToFri, none), 'off');
assert.equal(classifyDay('2026-11-22', monToFri, none), 'rest');
// A public holiday of the group is a public holiday even when a shift is rostered that day (operation staff work the shift and claim it at the public holiday rate).
assert.equal(classifyDay('2026-11-16', monToFri, (date) => date === '2026-11-16'), 'ph');
assert.match(otSummary('ph', 12 * H), /11 h \(1 h rest not counted\) · 2 x ORP \+ 3 h at 3\.0x/);
assert.match(otSummary('rest', 12 * H), /1 x ORP \+ 3 h at 2\.0x/);
// A public holiday on a day off is a public holiday; the rest day is the last off day that is not a holiday.
assert.equal(classifyDay('2026-11-22', monToFri, (date) => date === '2026-11-22'), 'ph');
assert.equal(classifyDay('2026-11-21', monToFri, (date) => date === '2026-11-22'), 'rest');
// Rotating roster: works Mon, Tue, Sat; off Wed-Fri and Sun; the rest day is the last off day, Sunday.
const rota = (date: string) => ['2026-11-16', '2026-11-17', '2026-11-21'].includes(date);
assert.equal(classifyDay('2026-11-18', rota, none), 'off');
assert.equal(classifyDay('2026-11-22', rota, none), 'rest');
// A week with one day off: that day is the rest day.
const sixDays = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0;
assert.equal(classifyDay('2026-11-22', sixDays, none), 'rest');

assert.match(otSummary('rest', 9 * H), /Rest day.*8 h.*1 h rest not counted.*a day pay/);
// A policy HR edits: defaults fill what is missing, and bad values are refused with a message.
assert.deepEqual(cleanPolicy({}), DEFAULT_OT_POLICY);
assert.equal(cleanPolicy({ normalRate: '2' }).normalRate, 2);
assert.throws(() => cleanPolicy({ normalRate: 1.25 }), /1\.0, 1\.5, 2\.0 or 3\.0/);
assert.throws(() => cleanPolicy({ restHalfHours: 8, restFullHours: 8 }), /full day/);
assert.throws(() => cleanPolicy({ roundMinutes: 0 }), /OT block/);
const custom = cleanPolicy({ roundMinutes: 30, restMinutes: 30, restAfterMinutes: 360, normalRate: 2, phHours: 6 });
assert.equal(netMinutes('normal', 7 * H + 40, custom), 7 * H);                 // 7 h 40 -> blocks of 30 = 7 h 30, more than 6 h so 30 min rest off -> 7 h
assert.deepEqual(otParts('normal', 3 * H + 40, custom), [{ minutes: 3 * H + 30, multiplier: 2 }]);
assert.deepEqual(otParts('ph', 5 * H, custom), [{ minutes: 6 * H, multiplier: 2, flat: 'ph' }]);
assert.equal(otParts('ph', 5 * H, custom).reduce((sum, part) => sum + (part.minutes / H) * part.multiplier, 0), 12);
assert.match(otSummary('ph', 5 * H, custom), /Public holiday.*1\.5 x ORP/);          // 6 h at 2.0 = 12 HRP = 1.5 x ORP
assert.match(paySummary('rest', 8 * H, [{ minutes: 8 * H, multiplier: 1 }], true), /1 h rest not counted.*a day pay \(1 x ORP\)/);
assert.match(otSummary('rest', 3 * H), /half a day pay \(0\.5 x ORP\)/);
// Settings by date: nothing saved is the memo for every date; a saved change starts from its date.
assert.equal(pickPolicy(parseVersions(null, 60), '2026-11-01').normalRate, 1.5);
const versions = parseVersions([{ from: '2026-12-01', policy: { ...DEFAULT_OT_POLICY, normalRate: 2 } }], 60);
assert.equal(versions.length, 2);
assert.equal(pickPolicy(versions, '2026-11-30').normalRate, 1.5);
assert.equal(pickPolicy(versions, '2026-12-01').normalRate, 2);
assert.equal(pickPolicy(versions, '2027-03-01').normalRate, 2);
assert.equal(pickPolicy(parseVersions({ normalRate: 3 }, 60), '2026-01-01').normalRate, 3);       // an older single policy covers every date
assert.equal(parseVersions([{ from: 'x', policy: { normalRate: 9 } }], 45)[0].policy.minMinutes, 45); // a bad version is skipped, the base takes the smallest OT
console.log('ot-rules: all checks passed.');
