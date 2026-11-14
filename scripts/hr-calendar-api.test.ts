import assert from 'node:assert/strict';
import { hrCalendarAction } from '../api/_hr-calendar';
import type { CalendarRule } from '../src/lib/hrCalendar';
// In-memory Supabase-shaped fixture: these tests never open a network connection.
const tables: Record<string, any[]> = { branches: [], portal_state: [], hr_employees: [{ id: 'a', full_name: 'CA A', employee_code: 'A', company: 'KJ', designation: 'CLINIC ASSISTANT', join_date: '2026-10-20', confirm_date: '2025-11-15', date_of_birth: '1994-11-07', status: 'Active' }], hr_reviews: [], hr_misc_items: [] };
class Query {
  filters: ((row: any) => boolean)[] = []; cap = Infinity; mode = 'read'; value: any; counted = false;
  constructor(public table: string) {}
  select(_fields?: string, options?: { count?: string }) { this.counted = Boolean(options?.count); return this; }
  eq(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this; }
  in(key: string, values: any[]) { this.filters.push(row => values.includes(row[key])); return this; }
  gte(key: string, value: string) { this.filters.push(row => row[key] >= value); return this; }
  lte(key: string, value: string) { this.filters.push(row => row[key] <= value); return this; }
  lt(key: string, value: string) { this.filters.push(row => row[key] < value); return this; }
  order(_key: string) { return this; }
  limit(value: number) { this.cap = value; return this; }
  insert(value: any) { this.mode = 'insert'; this.value = structuredClone(value); return this; }
  update(value: any) { this.mode = 'update'; this.value = structuredClone(value); return this; }
  execute(single = false) {
    const store = tables[this.table]; let rows = store.filter(row => this.filters.every(filter => filter(row)));
    if (this.mode === 'insert') {
      const duplicate = store.some(row => this.table === 'branches' ? row.name === this.value.name : row.branch_id === this.value.branch_id && row.state_key === this.value.state_key);
      if (duplicate) return { data: null, error: { code: '23505' } };
      const row = { id: `${this.table}-${store.length + 1}`, ...this.value }; store.push(row); rows = [row];
    }
    if (this.mode === 'update') for (const row of rows) Object.assign(row, this.value);
    const count = rows.length; rows = rows.slice(0, this.cap);
    return { data: structuredClone(single ? rows[0] || null : rows), error: null, count: this.counted ? count : null };
  }
  async maybeSingle() { return this.execute(true); }
  async single() { return this.execute(true); }
  then(resolve: any, reject: any) { return Promise.resolve(this.execute()).then(resolve, reject); }
}
const db = { from: (table: string) => new Query(table) };
async function call(action: string, body: any = {}, month = '2026-11', through?: string) {
  const out = { code: 0, body: null as any };
  const res = { status(code: number) { out.code = code; return this; }, json(payload: any) { out.body = payload; return this; } };
  await hrCalendarAction({ method: ['calendar_month', 'calendar_projection'].includes(action) ? 'GET' : 'POST', query: { month, ...(through ? { through } : {}) } }, res, db, { id: 'hr-user' }, action, { month, ...body });
  return out;
}
let response = await call('calendar_month');
assert.equal(response.code, 200); assert.equal(response.body.configVersion, null);
assert.equal(response.body.people[0].birthday, undefined);
assert.ok(!JSON.stringify(response.body).includes('1994-11-07'));
assert.ok(response.body.events.some((e: any) => e.category === 'birthday'));
assert.equal(tables.branches.length, 0); assert.equal(tables.portal_state.length, 0); // GET is read-only.
tables.hr_employees.push({ ...tables.hr_employees[0], id: 'left-ca', status: 'Inactive', resign_date: '2026-10-02', basic_salary: 9999, ic_no: 'private-ic' });
const projected = await call('calendar_projection');
assert.equal(projected.body.people.length, 2); // Include dated departures for historical projection.
assert.equal(projected.body.people[1].resignDate, '2026-10-02');
assert.ok(!JSON.stringify(projected.body).includes('private-ic'));
assert.ok(!JSON.stringify(projected.body).includes('9999'));
assert.ok(!JSON.stringify(projected.body).includes('1994-11-07'));
assert.equal(tables.branches.length, 0); assert.equal(tables.portal_state.length, 0);
tables.hr_employees.pop();
const rule: CalendarRule = { id: 'test-rule', title: 'Renew contract', category: 'contract', employeeId: 'a', company: 'SK', anchor: 'date', date: '2026-11-15', offsetMonths: 0, offsetDays: 0, repeat: 'monthly', every: 1, notes: '', enabled: true };
response = await call('calendar_rule_save', { rule, version: null });
const firstVersion = response.body.version;
assert.equal(tables.branches[0].name, 'AraOffice HR Private');
assert.equal(tables.portal_state[0].updated_by, 'hr-user');
assert.equal(tables.portal_state[0].payload.rules[0].company, 'KJ'); // Staff's real clinic takes precedence.
await call('calendar_rule_save', { rule: { ...rule, title: 'Edited renewal' }, version: firstVersion });
await assert.rejects(() => call('calendar_rule_save', { rule: { ...rule, title: 'Stale overwrite' }, version: firstVersion }), { status: 409 });
assert.equal(tables.portal_state[0].payload.rules[0].title, 'Edited renewal');
response = await call('calendar_month');
const event = response.body.events.find((e: any) => e.ruleId === rule.id);
assert.ok(event);
await call('calendar_state', { id: event.id, state: 'done', version: null });
response = await call('calendar_month');
assert.equal(response.body.events.find((e: any) => e.id === event.id).state, 'done');
const doneVersion = response.body.stateVersion;
await assert.rejects(() => call('calendar_state', { id: event.id, state: 'skipped', version: null }), { status: 409 });
response = await call('calendar_month', {}, '2026-12');
assert.equal(response.body.events.find((e: any) => e.ruleId === rule.id).state, 'open');
await call('calendar_state', { id: event.id, state: 'open', version: doneVersion });
response = await call('calendar_month');
assert.equal(response.body.events.find((e: any) => e.id === event.id).state, 'open');
await assert.rejects(() => call('calendar_state', { id: 'manual:test-rule:2026-12-15', state: 'done', version: null }), { status: 400 });
await assert.rejects(() => call('calendar_rule_save', { rule: { ...rule, employeeId: 'inactive' }, version: response.body.configVersion }), { status: 400 });
await assert.rejects(() => call('calendar_month', {}, '2026-13'), { status: 400 });
const realPeople = tables.hr_employees;
tables.hr_employees = Array.from({ length: 501 }, (_, i) => ({ ...realPeople[0], id: `staff-${i}` }));
await assert.rejects(() => call('calendar_month'), { status: 422 });
await assert.rejects(() => call('calendar_projection'), { status: 422 });
tables.hr_employees = realPeople;
response = await call('calendar_month');
await call('calendar_rule_delete', { id: rule.id, version: response.body.configVersion });
assert.equal((await call('calendar_month')).body.config.rules.length, 0);
console.log('HR calendar API tests passed: read-only GET, private shared persistence, clinic validation, save/reload, concurrent edits, completion/reopen, month isolation, bounds and schedule deletion.');

response = await call('calendar_month');
await assert.rejects(() => call('calendar_probation', { statuses: { a: 'probation' }, version: response.body.configVersion }), { status: 400 });
await assert.rejects(() => call('calendar_probation', { statuses: { missing: 'probation' }, version: response.body.configVersion }), { status: 400 });
tables.hr_employees.push({ ...realPeople[0], id: 'new-ca', full_name: 'New CA', confirm_date: null });
response = await call('calendar_month');
await call('calendar_probation', { statuses: { 'new-ca': 'probation' }, version: response.body.configVersion });
response = await call('calendar_month');
assert.equal(response.body.config.probation['new-ca'], 'probation');
assert.ok(response.body.events.some((e: any) => e.employeeId === 'new-ca' && e.category === 'evaluation'));
console.log('Probation list API validation and persistence passed; confirmed and inactive/missing staff cannot be marked probation.');

const employeeSnapshot = JSON.stringify(tables.hr_employees);
const projectionBefore = (await call('calendar_projection')).body;
const forecast = { rows: [{ id: 'planned-test', name: 'New CA', company: 'SK' }], cells: { 'a:2026-11': { status: 'probation', note: 'HR forecast' }, 'planned-test:2026-12': { status: 'contract', note: 'Expected join' } } };
await call('calendar_projection_save', { plan: forecast, version: projectionBefore.version });
const projectionSaved = (await call('calendar_projection')).body;
assert.deepEqual(projectionSaved.plan, forecast);
assert.equal(JSON.stringify(tables.hr_employees), employeeSnapshot); // Forecast never changes employment records.
assert.equal((await call('calendar_projection', {}, '2027-01')).body.plan.rows.length, 0);
await assert.rejects(() => call('calendar_projection_save', { plan: forecast, version: projectionBefore.version }), { status: 409 });
await assert.rejects(() => call('calendar_projection_save', { plan: { rows: [], cells: { 'missing:2026-11': { status: 'permanent', note: '' } } }, version: projectionSaved.version }), { status: 400 });
await assert.rejects(() => call('calendar_projection_save', { plan: forecast, version: null }, '2027-01'), { status: 400 });
await assert.rejects(() => call('calendar_projection_save', { plan: { rows: [{ id: 'planned-x', name: 'Bad branch', company: 'XX' }], cells: {} }, version: projectionSaved.version }), { status: 400 });
console.log('Projection API passed: shared save/reload, separate years, concurrent edits, validation and no employee mutations.');

const beforeRollover = JSON.stringify(tables.portal_state);
const rollingProjection = (await call('calendar_projection', {}, '2026-02', '2027-01')).body;
assert.deepEqual(Object.keys(rollingProjection.plans), ['2026', '2027']);
assert.deepEqual(rollingProjection.plan.cells['a:2026-11'], forecast.cells['a:2026-11']);
assert.equal(JSON.stringify(tables.portal_state), beforeRollover); // Hiding old months is a read-only operation.
await assert.rejects(() => call('calendar_projection', {}, '2026-01', '2027-01'), { status: 400 });
assert.deepEqual((await call('calendar_projection', {}, '2026-01')).body.plan, projectionSaved.plan);
console.log('Projection window API passed: two-year reads, no deletion or mutation when hiding months, old years recoverable.');

const departureVersion = (await call('calendar_projection')).body.version;
await call('calendar_projection_save', { version: departureVersion, plan: { rows: [], cells: { 'a:2026-11': { status: 'resigned', note: 'Last day 25/11' } } } });
const futureProjection = (await call('calendar_projection', {}, '2028-01', '2028-12')).body;
assert.equal(futureProjection.historyPlan.cells['a:2026-11'].status, 'resigned');
assert.equal(Object.keys(futureProjection.plans).includes('2026'), false); // History is read-only context, never a writable future-year plan.
console.log('Resignation history API passed: prior departure retained even when only a later year is displayed.');

const shareMonth = (await call('calendar_month')).body;
const shareTask = shareMonth.events.find((e: any) => e.category === 'forecast');
assert.equal(shareTask.id, 'share-forecast:2026-11-07');
const tickSaved = await call('calendar_state', { id: shareTask.id, state: 'done', version: shareMonth.stateVersion });
assert.equal(tickSaved.body.occurrence.state, 'done');
assert.equal(tickSaved.body.occurrence.by, 'hr-user');
assert.ok(tickSaved.body.occurrence.at);
const shared = (await call('calendar_month')).body;
assert.equal(shared.events.find((e: any) => e.id === shareTask.id).state, 'done');
assert.equal(shared.events.find((e: any) => e.id === shareTask.id).completedOn, new Date(tickSaved.body.occurrence.at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }));
assert.equal((await call('calendar_month', {}, '2026-12')).body.events.find((e: any) => e.category === 'forecast').state, 'open');
await call('calendar_state', { id: shareTask.id, state: 'open', version: shared.stateVersion });
console.log('Share Forecast API passed: tick saved/reloaded, task retained, next month unaffected, reopen supported.');

const statutoryMonth = (await call('calendar_month')).body;
const statutoryTask = statutoryMonth.events.find((e: any) => e.category === 'statutory');
assert.equal(statutoryTask.id, 'statutory:2026-11-14');
assert.equal(statutoryTask.start, '2026-11-15'); assert.equal(statutoryTask.date, '2026-11-15');
const paid = await call('calendar_state', { id: statutoryTask.id, state: 'done', version: statutoryMonth.stateVersion });
assert.equal(paid.body.occurrence.state, 'done');
assert.equal((await call('calendar_month')).body.events.find((e: any) => e.id === statutoryTask.id).state, 'done');
assert.equal((await call('calendar_month', {}, '2026-12')).body.events.find((e: any) => e.category === 'statutory').state, 'open');
console.log('Statutory task API passed: shared Done state saved/reloaded and isolated by month.');
