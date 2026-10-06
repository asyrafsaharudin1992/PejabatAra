import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type PanelRecord = { id: string; name: string; availability: string[]; portal_url: string; active?: boolean };
export type PanelGuide = { id: string; drive_file_id: string; file_name: string; drive_url: string; panel_id: string | null; status: 'pending' | 'linked' | 'archived' };
type Payload = { panels: PanelRecord[]; guides: PanelGuide[] };

export function usePanelTraining(active: boolean, canEdit: boolean) {
  const [data, setData] = useState<Payload>({ panels: [], guides: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const request = useCallback(async (method: 'GET' | 'POST' | 'PUT', body?: unknown) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error('Sign in with your staff account to load Panel Training.');
    const response = await fetch('/api/panel-training', {
      method,
      headers: { Authorization: `Bearer ${session.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load Panel Training.');
    setData({ panels: result.panels || [], guides: result.guides || [] });
    return result;
  }, []);

  const refresh = useCallback(async (sync = false) => {
    if (!active) return;
    setLoading(true); setError('');
    try { await request(sync && canEdit ? 'POST' : 'GET'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load Panel Training.'); }
    finally { setLoading(false); }
  }, [active, canEdit, request]);

  useEffect(() => { void refresh(canEdit); }, [refresh, canEdit]);
  useEffect(() => {
    if (!active) return;
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(canEdit); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [active, canEdit, refresh]);

  const mutate = useCallback(async (body: unknown) => {
    setLoading(true); setError('');
    try { await request('PUT', body); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save Panel Training.'); return false; }
    finally { setLoading(false); }
  }, [request]);

  return { ...data, loading, error, refresh, mutate };
}
