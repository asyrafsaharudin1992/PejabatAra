import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

const realtimeEnabled = import.meta.env.VITE_PANEL_REALTIME_ENABLED === 'true';

export type SyncedGuide = { id: string; name: string; url: string };
const originalIds = ['1xI8S_EOJxrGT3X74So9t7dbDTimSny45', '145h4ltrl8bw4dyQ9bMxrqbp3tw1zuRD_', '1FwlkKs6sRwqwOBwqfY8KBcfxX-PU0uWH', '10sUNL6G45RRhdNpQ6Z_7tDjCzNQPmT_f', '1x2Q7HlLAtm92MXzEcUaNeq9LNg9p1l9g'];
type State = { files: SyncedGuide[]; seen: string[]; alerts: SyncedGuide[]; checkedAt: string };
function read(key: string): State {
  try { const data = JSON.parse(localStorage.getItem(key) || 'null'); if (data && Array.isArray(data.files) && Array.isArray(data.seen) && Array.isArray(data.alerts)) return data; } catch {}
  return { files: [], seen: originalIds, alerts: [], checkedAt: '' };
}

export function usePanelSync(account?: string, active = false) {
  const key = `ara_panel_sync_v1_${account || 'signed-out'}`;
  const [state, setState] = useState<State>(() => read(key));
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState(0);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!account || !realtimeEnabled || !supabase) return;
    const client = supabase;
    const channel = client.channel(`panel-guides-${account}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'panel_drive_files' }, () => setRevision((value) => value + 1))
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
        // One catch-up read on connection/reconnection covers missed events.
        if (status === 'SUBSCRIBED') setRevision((value) => value + 1);
      });
    return () => { setConnected(false); void client.removeChannel(channel); };
  }, [account]);
  useEffect(() => {
    setState(read(key));
    setError('');
    setChecking(false);
    if (!account || (!active && !realtimeEnabled)) return;
    let cancelled = false;
    let busy = false;
    const controller = new AbortController();
    const check = async () => {
      if (busy) return;
      busy = true;
      setChecking(true);
      try {
        let data: { files: SyncedGuide[]; checkedAt: string };
        if (realtimeEnabled) {
          if (!supabase) throw new Error('Realtime is not configured.');
          const { data: session } = await supabase.auth.getSession();
          if (!session.session) throw new Error('Sign in with your staff account to receive live updates.');
          const result = await supabase.from('panel_drive_files').select('id,name,url').abortSignal(controller.signal);
          if (result.error) throw new Error('Unable to load live panel guides. Select Check now to retry.');
          data = { files: result.data, checkedAt: new Date().toISOString() };
        } else {
          const response = await fetch('/api/panel-sync', { signal: controller.signal });
          if (!response.ok) throw new Error('Unable to check Drive. Select Check now to retry.');
          data = await response.json();
        }
        if (!Array.isArray(data.files) || !data.files.every((file: SyncedGuide) => /^[\w-]+$/.test(file.id) && typeof file.name === 'string' && file.url === `https://drive.google.com/file/d/${file.id}/preview`)) throw new Error('Invalid sync response.');
        if (cancelled) return;
        // Re-read before merging to preserve dismissals made in another tab.
        const current = read(key);
        const added = data.files.filter((file: SyncedGuide) => !current.seen.includes(file.id));
        const next = { files: data.files, seen: [...new Set([...current.seen, ...data.files.map((file: SyncedGuide) => file.id)])], alerts: [...current.alerts, ...added], checkedAt: data.checkedAt };
        localStorage.setItem(key, JSON.stringify(next));
        setState(next);
        setError('');
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Sync unavailable');
      } finally { busy = false; if (!cancelled) setChecking(false); }
    };
    void check();
    return () => { cancelled = true; controller.abort(); };
  }, [account, key, revision, active]);
  const dismiss = useCallback((id: string) => {
    const current = read(key);
    const next = { ...current, alerts: current.alerts.filter((file) => file.id !== id) };
    localStorage.setItem(key, JSON.stringify(next));
    setState(next);
  }, [key]);
  return { ...state, error, checking, connected, realtimeEnabled, dismiss, refresh: () => setRevision((value) => value + 1) };
}
