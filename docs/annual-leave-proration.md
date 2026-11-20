# Annual leave when a staff member resigns

Apply `supabase/migrations/202611200001_resignation_leave_proration.sql`
before deploying the application changes that read `resignation_earned`.
The migration recalculates existing Annual Leave balances for staff with a last
working day. It does not change Medical Leave.

Annual Leave uses completed months from the later of 1 January of the balance
year or the join date, through the last working day inclusive. Multiply the
annual entitlement by completed months / 12 and round to the nearest whole day
(halves round up). For example, an established employee with 12 days entitlement
and a last working day of 15 December earns 11 days; after 7 days taken the
balance is 4 days. This example does not establish Qamarina's employment dates.

In the year someone joins, with no last working day, the same rule runs from the join date to 31 December (15 days, joined
3 Feb 2026: 10 completed months, 15 x 10 / 12 = 12.5, so 13). Staff who joined in an earlier year have the whole entitlement.
So the entitlement is prorated from both ends: the join date and the last working day.

Brought-forward days, credit, forfeiture, taken days and advance retain their
existing roles. Zero prorated days is a valid result. A last day in a later year
does not reduce earlier years' entitlement. With no last day, existing leave
rules continue to apply.

Database triggers recalculate balances when employment dates or balance inputs
change, including approval and deletion updates. Original HR-entered `earn` is
preserved separately; clearing a last day restores the original earning rules.
Reports and staff views show the effective earned amount. The HR balance editor
explains the proration and calculates its preview from the employment dates.
Both staff applications and HR leave entry enforce the prorated annual limit.

Validation:

```sh
node --import tsx scripts/hr-leave-proration.test.ts
# Install @electric-sql/pglite in a temporary folder; point to its dist/index.js:
ARAOFFICE_PGLITE_MODULE=/path/to/pglite/dist/index.js node --import tsx scripts/hr-leave-proration-db.test.mjs
npm run lint
npm run build
```
