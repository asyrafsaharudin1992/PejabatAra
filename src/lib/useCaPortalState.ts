import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

type Scope = 'workspace' | 'personal';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function useCaPortalState<T extends Record<string, unknown>>(initialValue: T, account?: string, canSeed = false, scope: Scope = 'workspace') {
  const initial = useRef(clone(initialValue));
  const [data, setData] = useState<T>(initial.current);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveVersion = useRef(0);

  const request = useCallback(async (method: 'GET' | 'PUT', payload?: T) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error('Please sign in again.');
    const response = await fetch(`/api/ca-state?scope=${scope}`, {
      method,
      headers: { Authorization: `Bearer ${session.session.access_token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify({ payload }) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to reach the CA workspace.');
    return result as { payload: T | null };
  }, [scope]);

  useEffect(() => {
    let active = true;
    setReady(false);
    setError('');
    setData(initial.current);
    if (!account || !supabase) { setReady(true); return () => { active = false; }; }
    void (async () => {
      try {
        const result = await request('GET');
        if (!active) return;
        if (result.payload) setData(result.payload);
        else if (canSeed) {
          const seeded = await request('PUT', initial.current);
          if (active && seeded.payload) setData(seeded.payload);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load saved portal content.');
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, [account, canSeed, request]);

  const save = useCallback(async (next: T) => {
    setData(next);
    const version = ++saveVersion.current;
    let saved = false;
    const operation = saveQueue.current.catch(() => undefined).then(async () => {
      try {
        const result = await request('PUT', next);
        if (version === saveVersion.current && result.payload) setData(result.payload);
        if (version === saveVersion.current) setError('');
        saved = true;
      } catch (cause) {
        if (version === saveVersion.current) setError(cause instanceof Error ? cause.message : 'Unable to save portal content.');
      }
    });
    saveQueue.current = operation.then(() => undefined, () => undefined);
    await operation;
    return saved;
  }, [request]);

  return { data, ready, error, save, setData };
}
