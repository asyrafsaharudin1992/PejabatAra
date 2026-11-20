// Run with node --import tsx; install @electric-sql/pglite in a temporary folder and set
// ARAOFFICE_PGLITE_MODULE to its dist/index.js to avoid adding an app dependency.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.ARAOFFICE_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`create table public.hr_employees (id uuid primary key, join_date date, resign_date date);
    insert into public.hr_employees values ('00000000-0000-0000-0000-000000000001','2020-03-15','2026-12-15');`);
  await db.exec(await readFile(new URL('../supabase/migrations/202610280003_leave_balances.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into public.hr_leave_balances (employee_id,leave_group,year,eligible,earn,total,taken,balance)
    values ('00000000-0000-0000-0000-000000000001','AL',2026,12,0,12,7,5),
           ('00000000-0000-0000-0000-000000000001','ML',2026,18,0,0,13,5),
           ('00000000-0000-0000-0000-000000000001','AL',2025,12,0,12,2,10);`);
  await db.exec(await readFile(new URL('../supabase/migrations/202611200001_resignation_leave_proration.sql', import.meta.url), 'utf8'));
  const balance = async () => (await db.query("select * from public.hr_leave_balances where leave_group='AL' and year=2026")).rows[0];
  const check = async (earned, total, left) => {
    const b = await balance();
    assert.equal(b.resignation_earned === null ? null : Number(b.resignation_earned), earned);
    assert.equal(Number(b.total), total);
    assert.equal(Number(b.balance), left);
    assert.equal(Number(b.earn), 0, 'original earned amount must be preserved');
  };
  await check(11, 11, 4); // Existing rows are corrected by migration.
  assert.equal(Number((await db.query("select balance from public.hr_leave_balances where leave_group='ML'")).rows[0].balance), 5);
  assert.equal(Number((await db.query("select balance from public.hr_leave_balances where year=2025")).rows[0].balance), 10);
  await db.exec("update public.hr_employees set resign_date='2026-01-15'");
  await check(0, 0, -7); // Zero must never fall back to 12 eligible days.
  await db.exec("update public.hr_employees set resign_date='2026-11-30'");
  await check(11, 11, 4);
  await db.exec("update public.hr_leave_balances set brought_forward=2, credit=1, forfeit=1, advance=0.5 where leave_group='AL' and year=2026");
  await check(11, 13, 6.5);
  await db.exec("update public.hr_leave_balances set taken=8, balance=999 where leave_group='AL' and year=2026");
  await check(11, 13, 5.5); // Approval/deletion paths cannot overwrite proration.
  await db.exec("update public.hr_employees set join_date='2026-03-15'");
  await check(8, 10, 2.5);
  await db.exec("update public.hr_employees set resign_date=null");
  await check(null, 14, 6.5);
  await db.exec("update public.hr_leave_balances set earn=9,total=11,balance=3.5 where leave_group='AL' and year=2026");
  await db.exec("update public.hr_employees set resign_date='2026-11-30'");
  assert.equal(Number((await balance()).earn), 9);
  assert.equal(Number((await balance()).resignation_earned), 8);
  await db.exec("update public.hr_employees set resign_date=null");
  assert.equal(Number((await balance()).total), 11);
  assert.equal(Number((await balance()).balance), 3.5);
  await db.exec("update public.hr_leave_balances set earn=0,total=14,balance=6.5 where leave_group='AL' and year=2026");
  await db.exec("update public.hr_employees set resign_date='2027-06-15'");
  await check(null, 14, 6.5); // A later resignation does not reduce the preceding year.
  await db.exec(`insert into public.hr_leave_balances(employee_id,leave_group,year,eligible)
    values ('00000000-0000-0000-0000-000000000001','AL',2027,12);`);
  const next = (await db.query("select resignation_earned,total,balance from public.hr_leave_balances where year=2027")).rows[0];
  assert.deepEqual(Object.values(next).map(Number), [5, 5, 5]);
  // Both implementations must agree across month lengths and leap years.
  const { resignationEarned } = await import('../src/lib/annualLeaveProration.ts');
  for (const year of [2024, 2026]) {
    for (const joined of [`${year}-01-01`, `${year}-01-31`, `${year}-02-29`.replace('2026-02-29', '2026-02-28'), `${year}-03-15`]) {
      for (let offset = 0; offset < 366; offset++) {
        const date = new Date(`${year}-01-01T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + offset);
        const last = date.toISOString().slice(0, 10);
        const expected = resignationEarned(18, year, joined, last);
        const actual = (await db.query('select public.hr_resignation_earned(18,$1,$2,$3) as earned', [year, joined, last])).rows[0].earned;
        assert.equal(actual === null ? null : Number(actual), expected, `${joined} to ${last}`);
      }
    }
  }
  console.log('Migration, balance triggers, reversals and SQL/TypeScript parity checks passed.');
} finally {
  await db.close();
}
