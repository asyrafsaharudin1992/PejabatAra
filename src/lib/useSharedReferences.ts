import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { KnowledgeResource } from '../portalData';

const SAVE_DELAY = 600;

// Official memos shared by every office's Reference Hub. Data reloads when the
// view opens and whenever the window regains focus, so an edit made in one
// office shows up in the others without a manual refresh. Only administrators
// can save; the API enforces the same rule.
export function useSharedReferences(defaults: KnowledgeResource[], account?: string, isAdmin = false, onSaveResult?: (saved: boolean, message: string) => void) {
  const initial = useRef(defaults);
  const [resources, setResources] = useState<KnowledgeResource[]>(defaults);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<KnowledgeResource[] | null>(null);
  const timer = useRef<number | null>(null);
  const token = useRef('');
  const lastDrive = useRef<{ added: number; error: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingMemos, setPendingMemos] = useState<KnowledgeResource[]>([]);
  const onResult = useRef(onSaveResult);
  onResult.current = onSaveResult;

  const request = useCallback(async (method: 'GET' | 'PUT' | 'POST', next?: KnowledgeResource[], query = '') => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error('Please sign in again.');
    token.current = session.session.access_token;
    const response = await fetch(`/api/references${query}`, {
      method,
      headers: { Authorization: `Bearer ${session.session.access_token}`, ...(next ? { 'Content-Type': 'application/json' } : {}) },
      ...(next ? { body: JSON.stringify({ payload: { resources: next } }) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to reach shared references.');
    lastDrive.current = result.drive || null;
    return result as { payload?: { resources?: KnowledgeResource[] }; pendingMemos?: KnowledgeResource[]; drive?: { added?: number; error?: string } };
  }, []);

  const load = useCallback(async () => {
    if (!account || !supabase || pending.current) return;
    try {
      const result = await request('GET');
      const saved = Array.isArray(result.payload?.resources) ? result.payload.resources : null;
      if (pending.current) return;
      if (saved) setResources(saved);
      else if (isAdmin) {
        const created = await request('PUT', initial.current);
        setResources(Array.isArray(created.payload?.resources) ? created.payload.resources : initial.current);
      }
      setPendingMemos(result.pendingMemos || []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load shared references.');
    } finally {
      setReady(true);
    }
  }, [account, isAdmin, request]);

  useEffect(() => {
    void load();
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const flush = useCallback(async () => {
    timer.current = null;
    const next = pending.current;
    if (!next) return true;
    try {
      const result = await request('PUT', next);
      setPendingMemos(result.pendingMemos || []);
      setError('');
      onResult.current?.(true, 'Memo details saved');
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to save shared references.';
      setError(message);
      onResult.current?.(false, `Not saved: ${message}`);
      return false;
    } finally {
      // A newer edit may have arrived while this one was saving.
      if (pending.current === next) pending.current = null;
    }
  }, [request]);

  // Inline fields save on every keystroke, so batch them into one request.
  const update = useCallback((updated: KnowledgeResource) => {
    if (!isAdmin) return;
    setResources((current) => {
      const next = current.map((resource) => resource.id === updated.id ? updated : resource);
      pending.current = next;
      return next;
    });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY);
  }, [flush, isAdmin]);

  // Save straight away when a field loses focus instead of waiting for the delay.
  const saveNow = useCallback(() => {
    if (!timer.current) return;
    window.clearTimeout(timer.current);
    void flush();
  }, [flush]);

  useEffect(() => () => saveNow(), [saveNow]);

  // A normal request is cancelled when the page unloads, so send any unsaved
  // edit with keepalive using the token from the last successful request.
  useEffect(() => {
    const onLeave = () => {
      if (!pending.current || !token.current) return;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      void fetch('/api/references', {
        method: 'PUT',
        keepalive: true,
        headers: { Authorization: `Bearer ${token.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { resources: pending.current } }),
      });
      pending.current = null;
    };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, []);

  // Pull memos newly added to the Drive folder without waiting for the
  // server's periodic check.
  const syncDrive = useCallback(async () => {
    if (!isAdmin) return;
    saveNow();
    setSyncing(true);
    try {
      const result = await request('POST', undefined, '?action=sync');
      if (Array.isArray(result.payload?.resources)) setResources(result.payload.resources);
      setPendingMemos(result.pendingMemos || []);
      const added = lastDrive.current?.added || 0;
      onResult.current?.(true, added ? `${added} new memo${added === 1 ? '' : 's'} ready for review` : 'Already up to date with Drive');
    } catch (cause) {
      onResult.current?.(false, cause instanceof Error ? cause.message : 'Drive sync failed.');
    } finally {
      setSyncing(false);
    }
  }, [isAdmin, request, saveNow]);

  const approvePendingMemo = useCallback((resource: KnowledgeResource) => {
    if (!isAdmin) return;
    setResources((current) => {
      const next = [resource, ...current.filter((item) => item.id !== resource.id)];
      pending.current = next;
      return next;
    });
    if (timer.current) window.clearTimeout(timer.current);
    void flush();
  }, [flush, isAdmin]);

  return { resources, ready, error, update, saveNow, syncDrive, syncing, pendingMemos, approvePendingMemo };
}
