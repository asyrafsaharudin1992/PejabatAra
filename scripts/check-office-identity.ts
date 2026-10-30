import assert from 'node:assert/strict';
import { activeAccount } from '../api/_office-db.js';
import { accountHandler } from '../api/_account.js';
import { fetchOfficeIdentity, OfficeIdentityError } from '../src/lib/officeIdentity.js';

async function main() {
  const user = { id: 'account-id', email: 'admin@example.invalid', app_metadata: { office_access: ['hr'], home_office: 'hr' } };
  const profile = { id: user.id, full_name: 'System Admin', role: 'super_admin', status: 'active', department: '' };
  function db(overrides: { authError?: any; profileError?: any; profile?: any } = {}) {
    return { auth: { getUser: async (token: string) => { assert.equal(token, 'test-token'); return { data: { user }, error: overrides.authError || null }; } }, from(table: string) { assert.equal(table, 'profiles'); const query: any = { select() { return query; }, eq(key: string, value: string) { assert.equal(key, 'id'); assert.equal(value, user.id); return query; }, maybeSingle: async () => ({ data: overrides.profile === undefined ? profile : overrides.profile, error: overrides.profileError || null }) }; return query; } };
  }
  const req = { method: 'GET', headers: { authorization: 'Bearer test-token' } };
  assert.equal((await activeAccount(req, db())).profile.role, 'super_admin');
  await assert.rejects(activeAccount({ headers: {} }, db()), (error: any) => error.status === 401);
  await assert.rejects(activeAccount(req, db({ authError: { status: 401 } })), (error: any) => error.status === 401);
  await assert.rejects(activeAccount(req, db({ authError: { status: 503 } })), (error: any) => error.status === 503);
  await assert.rejects(activeAccount(req, db({ profileError: { message: 'connection unavailable' } })), (error: any) => error.status === 503);
  await assert.rejects(activeAccount(req, db({ profile: { ...profile, status: 'inactive' } })), (error: any) => error.status === 403);
  await assert.rejects(activeAccount(req, db({ profile: null })), (error: any) => error.status === 403);
  let result: any, status = 0;
  const headers: Record<string, string> = {};
  const response = { setHeader(key: string, value: string) { headers[key] = value; }, status(code: number) { status = code; return response; }, json(value: any) { result = value; return value; } };
  await accountHandler(req, response, async () => ({ db: db(), user, profile }));
  assert.equal(status, 200); assert.equal(result.role, 'super_admin'); assert.equal(headers['Cache-Control'], 'no-store');
  assert(!JSON.stringify(result).includes('test-token'));
  const request: typeof fetch = async (_url, init) => { assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token'); return new Response(JSON.stringify(result)); };
  assert.equal((await fetchOfficeIdentity('test-token', request)).id, user.id);
  await assert.rejects(fetchOfficeIdentity('', request), (error: any) => error instanceof OfficeIdentityError && error.status === 401);
  for (const code of [401, 403, 503]) await assert.rejects(fetchOfficeIdentity('test-token', async () => new Response(JSON.stringify({ error: 'Account check failed' }), { status: code })), (error: any) => error instanceof OfficeIdentityError && error.status === code);
  await assert.rejects(fetchOfficeIdentity('test-token', async () => { throw new Error('offline'); }), (error: any) => error.status === 503);
  await assert.rejects(fetchOfficeIdentity('test-token', async () => new Response('not-json')), (error: any) => error.status === 503);
  await accountHandler({ method: 'POST' }, response, async () => { throw new Error('Must not authenticate unsupported method'); });
  assert.equal(status, 405);
  console.log('Office identity checks passed: verified admin, missing/expired session, profile failures, inactive accounts, safe identity response and network errors.');
}
void main();
