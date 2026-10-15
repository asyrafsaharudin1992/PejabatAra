import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Procedure = { id: string; title: string; items: string[]; steps: string[]; notes: string[]; photo: string };
export type ProcedureGuide = { title: string; procedures: Procedure[] };
export type ProcedurePhoto = { name: string; type: string; base64: string };

const photoRoot = import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/procedure-photos` : '';
export const procedurePhotoUrl = (photo: string) => photo ? `${photoRoot}/${photo}` : '';

// Kept for the whole page load: the list only changes when an admin saves it,
// and saving returns the new list, so there is nothing to poll for.
let cached: ProcedureGuide | null = null;

async function request(payload?: ProcedureGuide, photo?: { file: ProcedurePhoto; procedureId: string }) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Please sign in again.');
  const response = await fetch('/api/ca-state?scope=procedures', {
    method: payload ? 'PUT' : 'GET',
    headers: { Authorization: `Bearer ${session.session.access_token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify({ payload, ...(photo ? { photo: photo.file, photoFor: photo.procedureId } : {}) }) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Unable to load clinical procedures.');
  return (result.payload as ProcedureGuide | null) || { title: '', procedures: [] };
}

export function useProcedures(active: boolean) {
  const [guide, setGuide] = useState<ProcedureGuide | null>(cached);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active || cached) return;
    let live = true;
    request().then((result) => { cached = result; if (live) setGuide(result); }).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : 'Unable to load clinical procedures.'); });
    return () => { live = false; };
  }, [active]);

  // A photo, when given, is uploaded with the save and attached to that procedure.
  const save = useCallback(async (next: ProcedureGuide, photo?: { file: ProcedurePhoto; procedureId: string }) => {
    try {
      const saved = await request(next, photo);
      cached = saved; setGuide(saved); setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save clinical procedures.');
      return false;
    }
  }, []);

  return { guide, loading: active && !guide && !error, error, save };
}
