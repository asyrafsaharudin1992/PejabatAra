import assert from 'node:assert/strict';
import { ceoTasksAction } from '../api/_ceo-tasks';
import { CEO_TASKS, periodKey } from '../src/lib/ceoTasks';
import { malaysiaToday } from '../src/lib/reviewReminders';
const tables: Record<string, any[]> = { branches: [], portal_state: [] };
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
async function call(action: string, body: any = {}, method = action === 'ceo_tasks' ? 'GET' : 'POST') {
  let output: any;
  const res = { status(code: number) { assert.equal(code, 200); return this; }, json(value: any) { output = value; return this; } };
  await ceoTasksAction({ method }, res, db, { id: 'ceo-user' }, action, body);
  return output;
}
let result = await call('ceo_tasks');
assert.deepEqual(result.tasks, CEO_TASKS);
assert.equal(result.custom, false);
assert.equal(tables.branches.length, 0); // GET cannot write.
const daily = CEO_TASKS[0];
const period = periodKey(daily.frequency, malaysiaToday());
result = await call('ceo_task_toggle', { id: daily.id, period, done: true, version: null });
assert.equal(result.done[daily.id], period);
assert.equal((await call('ceo_tasks')).done[daily.id], period);
assert.equal(tables.branches[0].name, 'AraOffice CEO Private');
assert.equal(tables.portal_state[0].updated_by, 'ceo-user');
await assert.rejects(() => call('ceo_task_toggle', { id: daily.id, period, done: false, version: null }), { status: 409 });
await assert.rejects(() => call('ceo_task_toggle', { id: daily.id, period: '1900-01-01', done: true, version: result.version }), { status: 400 });
await assert.rejects(() => call('ceo_task_toggle', { id: 'unknown', period, done: true, version: result.version }), { status: 400 });
await assert.rejects(() => call('ceo_tasks_save', { tasks: [{ ...daily, title: '' }], version: result.version }), { status: 400 });
await assert.rejects(() => call('ceo_tasks_save', { tasks: [daily, daily], version: result.version }), { status: 400 });
result = await call('ceo_tasks_save', { tasks: [{ ...daily, title: 'Edited task' }], version: result.version });
assert.equal(result.custom, true);
assert.equal(result.done[daily.id], period); // Wording edits preserve the tick.
assert.equal((await call('ceo_tasks')).tasks[0].title, 'Edited task');
result = await call('ceo_tasks_save', { tasks: [{ ...daily, frequency: 'monthly' }], version: result.version });
assert.equal(result.done[daily.id], undefined); // Frequency changes start fresh.
result = await call('ceo_tasks_save', { tasks: [], version: result.version });
assert.deepEqual((await call('ceo_tasks')).tasks, []);
result = await call('ceo_tasks_save', { reset: true, version: result.version });
assert.deepEqual(result.tasks, CEO_TASKS);
assert.equal(result.custom, false);
await assert.rejects(() => call('ceo_tasks', {}, 'POST'), { status: 405 });
assert.equal(periodKey('weekly', '2027-01-03'), '2026-W53');
assert.equal(periodKey('monthly', '2026-12-31'), '2026-12');
assert.equal(periodKey('quarterly', '2026-12-31'), '2026-Q4');
console.log('CEO tasks passed: read-only GET, private persistence, ticks, edits, frequency changes, empty lists, reset, stale writes, period validation and ISO year rollover.');
