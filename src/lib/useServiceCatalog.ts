import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type ServiceFolder = { id: string; name: string; description: string };
export type ServiceCatalogItem = { id: string; folder_id: string | null; storage_path: string; title: string; summary: string };
export type ServiceFaq = { id: string; folder_id: string | null; service_id: string | null; question: string; answer: string };
type Catalog = { folders: ServiceFolder[]; services: ServiceCatalogItem[]; faqs: ServiceFaq[] };

export function useServiceCatalog(active: boolean) {
  const [data, setData] = useState<Catalog>({ folders: [], services: [], faqs: [] });
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const request = useCallback(async (body?: unknown) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data: session } = await supabase.auth.getSession(); if (!session.session) throw new Error('Sign in with your staff account to load services.');
    const response = await fetch('/api/panel-files?resource=services', { method: body ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${session.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to load services.');
    setData({ folders: result.folders || [], services: result.services || [], faqs: result.faqs || [] }); return result;
  }, []);
  const refresh = useCallback(async () => { if (!active) return; setLoading(true); setError(''); try { await request(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load services.'); } finally { setLoading(false); } }, [active, request]);
  useEffect(() => { void refresh(); }, [refresh]);
  const mutate = useCallback(async (body: unknown) => { setLoading(true); setError(''); try { await request(body); return true; } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save services.'); return false; } finally { setLoading(false); } }, [request]);
  return { ...data, loading, error, refresh, mutate };
}
