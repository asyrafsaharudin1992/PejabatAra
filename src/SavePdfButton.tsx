import { useState } from 'react';
import { Download } from 'lucide-react';
import { savePagesAsPdf } from './lib/savePdf';

// The Save button next to Preview: saves what the preview shows as a PDF file. `scope` is the selector of the preview area; every sheet in it is saved in order.
export function SavePdfButton({ scope, filename, landscape = false, disabled = false, onError, className = '' }: { scope: string; filename: string; landscape?: boolean; disabled?: boolean; onError?: (message: string) => void; className?: string }) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const area = document.querySelector(scope);
    if (!area) { onError?.('Open the preview first.'); return; }
    setBusy(true);
    try { await savePagesAsPdf(area, filename, landscape); }
    catch (cause) { onError?.(cause instanceof Error ? cause.message : 'Unable to save the PDF.'); }
    setBusy(false);
  };
  return <button type="button" disabled={disabled || busy} onClick={() => void save()} className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-[#0b587b] disabled:opacity-50 ${className || 'h-9 px-3'}`}><Download className="h-4 w-4" />{busy ? 'Saving…' : 'Save PDF'}</button>;
}
