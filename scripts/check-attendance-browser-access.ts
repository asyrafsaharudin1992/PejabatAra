import assert from 'node:assert/strict';
import { attendanceStaffAction } from '../api/_attendance.js';

function fixture(options: { status?: string; recent?: boolean; otherCompanyOnly?: boolean } = {}) {
  const employee = { id: 'employee', company: 'KJ', employee_code: 'TEST', full_name: 'Test fixture', designation: '', work_days: [0, 1, 2, 3, 4, 5, 6], holiday_group: '', status: options.status || 'Active', clock_mode: 'places', clock_place_ids: [], clock_required: 'full', clock_device_hash: 'previous-browser-registration-must-not-block-this-clock' };
  const clocks: any[] = [{ employee_id: employee.id, kind: 'in', clock_at: new Date(Date.now() - (options.recent ? 30000 : 2 * 3600000)).toISOString() }];
  const inserts: any[] = [], updates: string[] = [];
  const db = { from(table: string) {
    let one = false, count: number | undefined;
    let descending = false;
    const query: any = {
      select() { return query; }, eq() { return query; }, in() { return query; }, gte() { return query; }, lte() { return query; },
      order(_column: string, order?: { ascending?: boolean }) { descending = order?.ascending === false; return query; },
      limit(value: number) { count = value; return query; }, maybeSingle() { one = true; return query; },
      insert(row: any) { assert.equal(table, 'hr_attendance_clocks'); inserts.push(row); clocks.push({ ...row, clock_at: new Date().toISOString() }); return Promise.resolve({ error: null }); },
      update() { updates.push(table); return query; },
      then(resolve: (result: any) => unknown, reject: (error: unknown) => unknown) {
        let rows: any[] = table === 'hr_employees' ? [employee] : table === 'hr_clock_places' ? [{ id: 'clinic', name: 'KJ clinic', company: options.otherCompanyOnly ? 'SK' : 'KJ', latitude: 3, longitude: 101, radius_m: 100 }] : table === 'hr_attendance_clocks' ? [...clocks].sort((a, b) => descending ? Date.parse(b.clock_at) - Date.parse(a.clock_at) : Date.parse(a.clock_at) - Date.parse(b.clock_at)) : [];
        if (count !== undefined) rows = rows.slice(0, count);
        return Promise.resolve({ data: one ? rows[0] || null : rows, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { db, inserts, updates };
}
async function clock(test: ReturnType<typeof fixture>, body: Record<string, unknown>) {
  let status = 0, data: any;
  const response = { status(value: number) { status = value; return response; }, json(value: any) { data = value; return value; } };
  await attendanceStaffAction({ method: 'POST', query: {} }, response, test.db, { id: 'login' }, 'attendance_clock', { deviceId: 'a-different-browser-identifier', lat: 3, lng: 101, accuracy: 10, ...body });
  return { status, data };
}
async function main() {
  for (const deviceId of ['safari-browser-identifier', 'chrome-browser-identifier']) {
    const test = fixture();
    const result = await clock(test, { deviceId });
    assert.equal(result.status, 200);
    assert.equal(result.data.kind, 'out', 'An earlier clock in must support clock out from a different browser.');
    assert.equal(test.inserts.length, 1);
    assert.equal(test.inserts[0].within_place, true);
    assert.equal(test.inserts[0].device.length, 12, 'Keep a browser audit identifier.');
    assert.deepEqual(test.updates, [], 'Do not bind the staff account to the new browser.');
  }
  for (const [options, body, status] of [
    [{}, { accuracy: 739 }, 400],
    [{}, { lat: 0, lng: 0 }, 403],
    [{}, { lat: null, lng: null }, 400],
    [{ status: 'Inactive' }, {}, 403],
    [{ recent: true }, {}, 429],
    [{ otherCompanyOnly: true }, {}, 400],
  ] as const) {
    const test = fixture(options);
    await assert.rejects(clock(test, body), (error: any) => error.status === status);
    assert.equal(test.inserts.length, 0, 'Invalid clock attempts must not be saved.');
  }
  console.log('Attendance browser checks passed: cross-browser clock out, no registration lock, GPS accuracy, workplace distance/access, active staff and duplicate-clock protection.');
}
void main();
