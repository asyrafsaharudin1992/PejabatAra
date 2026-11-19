import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { savePagesAsPdf } from './lib/savePdf';

// The two buttons at the top of every report: Print, and Download. Print opens the browser's print window straight away. Download opens a short list of formats
// to choose from: PDF (made from what is on the screen), and Excel or CSV when that report has them. Only the formats a report offers are listed.
export function PrintMenu({ onPrint, pdf, onPdf, onExcel, onCsv, items, disabled = false, onError, className = '' }: {
  onPrint?: () => void; pdf?: { scope: string; filename: string; landscape?: boolean }; onPdf?: () => void | Promise<void>; onExcel?: () => void; onCsv?: () => void; items?: { label: string; onClick: () => void }[]; disabled?: boolean; label?: string; onError?: (message: string) => void; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', escape); };
  }, [open]);
  const savePdf = async () => {
    setOpen(false);
    if (onPdf) { setBusy(true); try { await onPdf(); } catch (cause) { onError?.(cause instanceof Error ? cause.message : 'Unable to save the PDF.'); } setBusy(false); return; }
    if (!pdf) return;
    const area = document.querySelector(pdf.scope);
    if (!area) { onError?.('Open the report first.'); return; }
    setBusy(true);
    try { await savePagesAsPdf(area, pdf.filename, Boolean(pdf.landscape)); } catch (cause) { onError?.(cause instanceof Error ? cause.message : 'Unable to save the PDF.'); }
    setBusy(false);
  };
  const size = className || 'h-10 px-4';
  const item = 'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50';
  const hasDownload = Boolean(pdf || onPdf || onExcel || onCsv || items?.length);
  return <>
    {onPrint && <button type="button" disabled={disabled || busy} onClick={onPrint} className={`inline-flex items-center gap-2 rounded-xl bg-[#0b587b] text-sm font-semibold text-white disabled:opacity-50 ${size}`}><Printer className="h-4 w-4" />Print</button>}
    {hasDownload && <div ref={box} className="relative inline-block">
      <button type="button" disabled={disabled || busy} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-[#0b587b] disabled:opacity-50 ${size}`}><Download className="h-4 w-4" />{busy ? 'Saving…' : 'Download'}<ChevronDown className="h-4 w-4" /></button>
      {open && <div role="menu" className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
        {(pdf || onPdf) && <button type="button" role="menuitem" className={item} onClick={() => void savePdf()}><FileText className="h-4 w-4 text-[#0b587b]" />PDF</button>}
        {onExcel && <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onExcel(); }}><FileSpreadsheet className="h-4 w-4 text-[#0b587b]" />Excel</button>}
        {items?.map((entry) => <button key={entry.label} type="button" role="menuitem" className={item} onClick={() => { setOpen(false); entry.onClick(); }}><Download className="h-4 w-4 text-[#0b587b]" />{entry.label}</button>)}
        {onCsv && <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onCsv(); }}><Download className="h-4 w-4 text-[#0b587b]" />CSV</button>}
      </div>}
    </div>}
  </>;
}
