import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// The server reads the Panel Training Drive folder (cached, refreshed at most
// every few minutes). The list reloads when the page opens and when the window
// regains focus, so new guides appear without anyone pressing Sync.
const originalIds = ['1xI8S_EOJxrGT3X74So9t7dbDTimSny45', '145h4ltrl8bw4dyQ9bMxrqbp3tw1zuRD_', '1FwlkKs6sRwqwOBwqfY8KBcfxX-PU0uWH', '10sUNL6G45RRhdNpQ6Z_7tDjCzNQPmT_f', '1x2Q7HlLAtm92MXzEcUaNeq9LNg9p1l9g'];

export type SyncedGuide = { id: string; name: string; url: string };
export type PanelNoticeState = { seen: string[]; alerts: SyncedGuide[] };
type State = PanelNoticeState & { files: SyncedGuide[]; checkedAt: string };

function normalise(value?: PanelNoticeState): PanelNoticeState {
  return { seen: Array.from(new Set([...(value?.seen || []), ...originalIds])), alerts: value?.alerts || [] };
}

export function usePanelSync(account: string | undefined, active: boolean, persisted: PanelNoticeState | undefined, onPersist: (next: PanelNoticeState) => void, isAdmin = false) {
  const persistedRef = useRef(normalise(persisted));
  const [state, setState] = useState<State>(() => ({ files: [], checkedAt: '', ...normalise(persisted) }));
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState(0);
  const [connected, setConnected] = useState(false);
  const force = useRef(false);

  useEffect(() => {
    const next = normalise(persisted);
    persistedRef.current = next;
    setState((current) => ({ ...current, ...next }));
  }, [persisted]);

  const saveNotices = useCallback((next: PanelNoticeState) => {
    persistedRef.current = next;
    setState((current) => ({ ...current, ...next }));
    onPersist(next);
  }, [onPersist]);

  useEffect(() => {
    if (!active) return;
    const onVisible = () => { if (document.visibilityState === 'visible') setRevision((value) => value + 1); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);

  useEffect(() => {
    setError('');
    setChecking(false);
    if (!account || !active) return;
    let cancelled = false;
    const controller = new AbortController();
    const forced = force.current;
    force.current = false;
    void (async () => {
      setChecking(true);
      try {
        if (!supabase) throw new Error('Supabase is not configured.');
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) throw new Error('Sign in with your staff account to receive guide updates.');
        const response = await fetch(`/api/panel-files${forced ? '?action=sync' : ''}`, {
          method: forced ? 'POST' : 'GET',
          headers: { Authorization: `Bearer ${session.session.access_token}` },
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load panel guides. Select Refresh to retry.');
        if (cancelled) return;
        const files = result.files as SyncedGuide[];
        const previous = persistedRef.current;
        const added = files.filter((file) => !previous.seen.includes(file.id));
        const notices = { seen: Array.from(new Set([...previous.seen, ...files.map((file) => file.id)])), alerts: [...previous.alerts, ...added] };
        setState({ files, checkedAt: result.syncedAt || new Date().toISOString(), ...notices });
        if (added.length) saveNotices(notices);
        setConnected(true);
        setError(result.error || '');
      } catch (cause) {
        if (!cancelled) { setConnected(false); setError(cause instanceof Error ? cause.message : 'Sync unavailable'); }
      } finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [account, active, revision, saveNotices]);

  const dismiss = useCallback((id: string) => {
    const next = { ...persistedRef.current, alerts: persistedRef.current.alerts.filter((file) => file.id !== id) };
    saveNotices(next);
  }, [saveNotices]);

  // Admins pull straight from Drive; everyone else reloads the cached list.
  const refresh = useCallback(() => {
    force.current = isAdmin;
    setRevision((value) => value + 1);
  }, [isAdmin]);

  return { ...state, error, checking, connected, dismiss, refresh };
}
