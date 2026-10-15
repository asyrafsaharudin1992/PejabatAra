import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type ReadStaff = { id: string; name: string; branch?: string };
// announcement id → staff id → when they ticked Done
export type AnnouncementReads = Record<string, Record<string, string>>;

// Loaded once per page open; only a staff member ticking Done writes.
export function useAnnouncementReads(account?: string) {
  const [staff, setStaff] = useState<ReadStaff[]>([]);
  const [reads, setReads] = useState<AnnouncementReads>({});
  const [loaded, setLoaded] = useState(false);

  const request = useCallback(async (body?: { announcementId: string; staffId: string; unread?: boolean }) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error('Please sign in again.');
    const response = await fetch('/api/ca-state?scope=reads', {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${session.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load who has read the announcements.');
    setStaff(result.staff || []);
    setReads(result.reads || {});
  }, []);

  useEffect(() => {
    if (!account) return;
    setLoaded(false);
    request().catch(() => undefined).finally(() => setLoaded(true));
  }, [account, request]);

  const markRead = useCallback(async (announcementId: string, staffId: string, unread = false) => {
    try { await request({ announcementId, staffId, unread }); return ''; }
    catch (cause) { return cause instanceof Error ? cause.message : 'Unable to save. Please try again.'; }
  }, [request]);

  // Until the staff list loads, nothing counts as fully read.
  const allRead = useCallback((announcementId: string) => loaded && staff.length > 0 && staff.every((item) => reads[announcementId]?.[item.id]), [loaded, staff, reads]);

  return { staff, reads, loaded, markRead, allRead };
}
