import assert from 'node:assert/strict';
import { individualPreviewAdmin } from '../api/_individual-preview';

const atikah = { staff_code: 'ARA0035', active: true, password_hash: 'existing-password-hash' };
let reads = 0;
let profile: any = { id: 'system-admin', email: 'arasihat@gmail.com', role: 'super_admin', status: 'active' };
const db = { from(table: string) {
  assert.equal(table, 'profiles'); reads++;
  return { select() { return this; }, eq(key: string, email: string) { assert.equal(key, 'email'); assert.equal(email, 'arasihat@gmail.com'); return this; }, async maybeSingle() { return { data: profile, error: null }; } };
} };
assert.equal(await individualPreviewAdmin(db, { ...atikah, staff_code: 'ARA0001' }, true), null);
assert.equal(await individualPreviewAdmin(db, { ...atikah, active: false }, true), null);
assert.equal(await individualPreviewAdmin(db, { ...atikah, password_hash: null }, true), null);
assert.equal(await individualPreviewAdmin(db, atikah, false), null);
assert.equal(reads, 0); // Other staff and inactive/unset-password accounts never look up the admin account.
assert.deepEqual(await individualPreviewAdmin(db, atikah, true), { id: 'system-admin', email: 'arasihat@gmail.com' });
profile = { ...profile, role: 'staff' };
assert.equal(await individualPreviewAdmin(db, atikah, true), null);
profile = { ...profile, role: 'super_admin', status: 'inactive' };
assert.equal(await individualPreviewAdmin(db, atikah, true), null);
profile = null;
assert.equal(await individualPreviewAdmin(db, atikah, true), null);
console.log('Individual layout preview passed: only the linked, active System Admin with a configured password qualifies; ordinary staff, inactive records, missing profiles and revoked admin rights are denied.');
