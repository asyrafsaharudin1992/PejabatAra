import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { createAuthStorage } from '../src/lib/authStorage.ts';

function store(discardWrites = false) {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem(key: string, value: string) { if (!discardWrites) values.set(key, value); }, removeItem(key: string) { values.delete(key); } };
}

async function main() {
  const local = store(true), tab = store();
  const key = 'test-auth-session';
  const user = { id: 'test-user', email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const storage = createAuthStorage(() => local, () => tab);
  const client = createClient('https://example.supabase.co', 'test-publishable-key', {
    realtime: { transport: WebSocket },
    auth: { storage, storageKey: key, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const url = String(input);
      if (url.includes('/token?grant_type=password')) return new Response(JSON.stringify({ access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }), { headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/logout?')) return new Response(null, { status: 204 });
      throw new Error(`Unexpected request: ${url}`);
    } },
  });
  await client.auth.initialize();
  const signedIn = await client.auth.signInWithPassword({ email: user.email, password: 'test-only' });
  assert.equal(signedIn.error, null);
  assert.equal(local.getItem(key), null, 'Reproduce Safari silently discarding the primary write');
  assert.equal((await client.auth.getSession()).data.session?.user.id, user.id);
  // A fresh adapter represents a page reload, with its memory cache gone.
  assert.equal(JSON.parse(createAuthStorage(() => local, () => tab).getItem(key)!).user.id, user.id);
  await client.auth.signOut({ scope: 'local' });
  assert.equal(storage.getItem(key), null);
  assert.equal(tab.getItem(key), null);
  const blocked = () => { throw new Error('Storage unavailable'); };
  const memory = createAuthStorage(blocked, blocked);
  memory.setItem(key, 'session'); assert.equal(memory.getItem(key), 'session');
  memory.removeItem(key); assert.equal(memory.getItem(key), null);
  const shared = store(), first = createAuthStorage(() => shared, () => store());
  first.setItem(key, 'first'); shared.setItem(key, 'refreshed-in-another-tab');
  assert.equal(first.getItem(key), 'refreshed-in-another-tab');
  first.removeItem(key); assert.equal(shared.getItem(key), null);
  console.log('Auth storage checks passed: SDK login with discarded local writes, reload recovery, sign-out, unavailable storage and shared refresh.');
}
void main();
