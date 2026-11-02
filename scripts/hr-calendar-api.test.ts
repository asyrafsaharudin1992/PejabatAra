import assert from 'node:assert/strict';
import { hrCalendarAction } from '../api/_hr-calendar';
import type { CalendarRule } from '../src/lib/hrCalendar';
// In-memory Supabase-shaped fixture: these tests never open a network connection.
const tables: Record<string, any[]> = { branches: [], portal_state: [], hr_employees: [{ id: 'a', full_name: 'CA A', employee_code: 'A', company: 'KJ', designation: 'CLINIC ASSISTANT', join_date: '2026-10-20', confirm_date: '2025-11-15', date_of_birth: '1994-11-07', status: 'Active' }], hr_reviews: [] };
class Query {
  filters: ((row: any) => boolean)[] = []; cap = Infinity; mode = 'read'; value: any; counted = false;
  constructor(public table: string) {}
  select(_fields?: string, options?: { count?: string }) { this.counted = Boolean(options?.count); return this; }
  eq(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this; }
  in(key: string, values: any[]) { this.filters.push(row => values.includes(row[key])); return this; }
  gte(key: string, value: string) { this.filters.push(row => row[key] >= value); return this; }
  lte(key: string, value: string) { this.filters.push(row => row[key] <= value); return this; }
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
async function call(action: string, body: any = {}, month = '2026-11') {
  const out = { code: 0, body: null as any };
  const res = { status(code: number) { out.code = code; return this; }, json(payload: any) { out.body = payload; return this; } };
  await hrCalendarAction({ method: action === 'calendar_month' ? 'GET' : 'POST', query: { month } }, res, db, { id: 'hr-user' }, action, { month, ...body });
  return out;
}
let response = await call('calendar_month');
assert.equal(response.code, 200); assert.equal(response.body.configVersion, null);
assert.equal(response.body.people[0].birthday, undefined);
assert.ok(!JSON.stringify(response.body).includes('1994-11-07'));
assert.ok(response.body.events.some((e: any) => e.category === 'birthday'));
assert.equal(tables.branches.length, 0); assert.equal(tables.portal_state.length, 0); // GET is read-only.
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
tables.hr_employees = realPeople;
response = await call('calendar_month');
await call('calendar_rule_delete', { id: rule.id, version: response.body.configVersion });
assert.equal((await call('calendar_month')).body.config.rules.length, 0);
console.log('HR calendar API tests passed: read-only GET, private shared persistence, clinic validation, save/reload, concurrent edits, completion/reopen, month isolation, bounds and schedule deletion.');
