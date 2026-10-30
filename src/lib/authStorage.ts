type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Some Safari sessions accept localStorage writes but subsequently return null.
// Keep a tab-scoped copy so a successful login survives that storage failure.
// These are still ordinary Supabase tokens: expiry, refresh and server-side
// account verification continue to apply.
export function createAuthStorage(local: () => SessionStorage, tab: () => SessionStorage) {
  const memory = new Map<string, string>();
  const read = (storage: () => SessionStorage, key: string) => {
    try { return storage().getItem(key); } catch { return null; }
  };
  const write = (storage: () => SessionStorage, key: string, value: string) => {
    try { storage().setItem(key, value); } catch { /* The other stores remain available. */ }
  };
  const remove = (storage: () => SessionStorage, key: string) => {
    try { storage().removeItem(key); } catch { /* Also clear the other stores. */ }
  };
  return {
    getItem(key: string) { return read(local, key) ?? read(tab, key) ?? memory.get(key) ?? null; },
    setItem(key: string, value: string) {
      memory.set(key, value);
      write(tab, key, value);
      write(local, key, value);
    },
    removeItem(key: string) {
      memory.delete(key);
      remove(tab, key);
      remove(local, key);
    },
  };
}
