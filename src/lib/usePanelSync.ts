import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// Google Drive sends changes to the server webhook; clients only subscribe to
// Supabase Realtime. There is deliberately no browser polling of Drive.
const realtimeEnabled = import.meta.env.VITE_PANEL_REALTIME_ENABLED !== 'false';
const originalIds = ['1xI8S_EOJxrGT3X74So9t7dbDTimSny45', '145h4ltrl8bw4dyQ9bMxrqbp3tw1zuRD_', '1FwlkKs6sRwqwOBwqfY8KBcfxX-PU0uWH', '10sUNL6G45RRhdNpQ6Z_7tDjCzNQPmT_f', '1x2Q7HlLAtm92MXzEcUaNeq9LNg9p1l9g'];

export type SyncedGuide = { id: string; name: string; url: string };
export type PanelNoticeState = { seen: string[]; alerts: SyncedGuide[] };
type State = PanelNoticeState & { files: SyncedGuide[]; checkedAt: string };

function normalise(value?: PanelNoticeState): PanelNoticeState {
  return { seen: Array.from(new Set([...(value?.seen || []), ...originalIds])), alerts: value?.alerts || [] };
}

export function usePanelSync(account: string | undefined, active: boolean, persisted: PanelNoticeState | undefined, onPersist: (next: PanelNoticeState) => void) {
  const persistedRef = useRef(normalise(persisted));
  const [state, setState] = useState<State>(() => ({ files: [], checkedAt: '', ...normalise(persisted) }));
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState(0);
  const [connected, setConnected] = useState(false);

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
    if (!account || !realtimeEnabled || !supabase) return;
    const channel = supabase.channel(`panel-guides-${account}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'panel_drive_files' }, () => setRevision((value) => value + 1))
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') setRevision((value) => value + 1);
      });
    return () => { setConnected(false); void supabase.removeChannel(channel); };
  }, [account]);

  useEffect(() => {
    setError('');
    setChecking(false);
    if (!account || (!active && !realtimeEnabled)) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      setChecking(true);
      try {
        if (!supabase) throw new Error('Realtime is not configured.');
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) throw new Error('Sign in with your staff account to receive live updates.');
        const result = await supabase.from('panel_drive_files').select('id,name,url').abortSignal(controller.signal);
        if (result.error) throw new Error('Unable to load live panel guides. Select Refresh to retry.');
        if (cancelled) return;
        const files = result.data as SyncedGuide[];
        const previous = persistedRef.current;
        const added = files.filter((file) => !previous.seen.includes(file.id));
        const notices = { seen: Array.from(new Set([...previous.seen, ...files.map((file) => file.id)])), alerts: [...previous.alerts, ...added] };
        setState({ files, checkedAt: new Date().toISOString(), ...notices });
        if (added.length) saveNotices(notices);
        setError('');
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Sync unavailable');
      } finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [account, active, revision, saveNotices]);

  const dismiss = useCallback((id: string) => {
    const next = { ...persistedRef.current, alerts: persistedRef.current.alerts.filter((file) => file.id !== id) };
    saveNotices(next);
  }, [saveNotices]);

  return { ...state, error, checking, connected, realtimeEnabled, dismiss, refresh: () => setRevision((value) => value + 1) };
}
