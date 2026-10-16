import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type PrintForm = { id: string; title: string; group: string; file: string; size?: number };
export type Voucher = { id: string; label: string; company: string[]; sections: { title: string; lines: string[] }[] };
// Cash vouchers are printed from the app; until an admin saves them, the built-in KJ voucher is used.
export type PrintFormList = { forms: PrintForm[]; vouchers?: Voucher[] };
export type PrintFormFile = { name: string; type: string; base64: string };

const fileRoot = import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/print-forms` : '';
export const printFormUrl = (file: string) => file ? `${fileRoot}/${file}` : '';

// Each office keeps its own list: 'forms' is the CA office, 'clinical_forms' the Clinical Admin office.
export type PrintFormScope = 'forms' | 'clinical_forms';

// Kept for the whole page load, like the procedure list: it only changes when an
// admin saves it, and saving returns the new list.
const cached: Partial<Record<PrintFormScope, PrintFormList>> = {};

async function request(scope: PrintFormScope, payload?: PrintFormList, upload?: { file: PrintFormFile; formId: string }) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Please sign in again.');
  const response = await fetch(`/api/ca-state?scope=${scope}`, {
    method: payload ? 'PUT' : 'GET',
    headers: { Authorization: `Bearer ${session.session.access_token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify({ payload, ...(upload ? { file: upload.file, fileFor: upload.formId } : {}) }) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || (response.status === 413 ? 'That PDF is too large to upload.' : 'Unable to load print forms.'));
  return (result.payload as PrintFormList | null) || { forms: [] };
}

export function usePrintForms(active: boolean, scope: PrintFormScope = 'forms') {
  const [list, setList] = useState<PrintFormList | null>(cached[scope] || null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active || cached[scope]) return;
    let live = true;
    request(scope).then((result) => { cached[scope] = result; if (live) setList(result); }).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : 'Unable to load print forms.'); });
    return () => { live = false; };
  }, [active]);

  // A PDF, when given, is uploaded with the save and attached to that form.
  const save = useCallback(async (next: PrintFormList, upload?: { file: PrintFormFile; formId: string }) => {
    try {
      const saved = await request(scope, next, upload);
      cached[scope] = saved; setList(saved); setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save print forms.');
      return false;
    }
  }, [scope]);

  return { list, loading: active && !list && !error, error, save };
}

// Safari will not print a PDF from a hidden frame, so it opens the PDF in a new tab instead
// (staff press ⌘P there). Other browsers print straight away. Either way the PDF comes from
// the browser cache after the first time.
const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
let printFrame: HTMLIFrameElement | null = null;

export async function printPdf(url: string) {
  if (isSafari) { window.open(url, '_blank', 'noopener'); return; }
  const blob = await fetch(url).then((response) => { if (!response.ok) throw new Error('The form could not be downloaded.'); return response.blob(); });
  if (printFrame) { URL.revokeObjectURL(printFrame.src); printFrame.remove(); }
  const frame = document.createElement('iframe');
  // Kept 1px and transparent rather than hidden: Chrome's PDF viewer will not print a hidden frame.
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  frame.src = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  frame.onload = () => window.setTimeout(() => { try { frame.contentWindow?.print(); } catch { window.open(url, '_blank', 'noopener'); } }, 150);
  document.body.appendChild(frame);
  printFrame = frame;
}
