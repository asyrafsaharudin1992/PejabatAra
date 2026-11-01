import { useRef, useState } from 'react';
import { Download, FileText, Paperclip, X } from 'lucide-react';
import { openLeaveFile } from './LeaveAttachments';

// Documents on a staff profile (a copy of the IC, a certificate...). Used by staff in My Profile and by HR in a staff profile.
// PDF, PNG or JPG, each under 2 MB. A file is opened through a link that expires after a minute.
export type Doc = { id: string; kind: string; name: string; size: number; by: string; at: string };
export const DOCUMENT_KINDS = ['IC copy', 'Passport', 'Certificate', 'Driving licence', 'Other'];
const OK_EXT = ['pdf', 'png', 'jpg', 'jpeg'];
const MAX_BYTES = 2 * 1024 * 1024;
const kb = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const readBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('Unable to read the file.')); reader.readAsDataURL(file); });

export function DocumentsPanel({ docs, onUpload, getUrl, onRemove, canRemove, onError, tone = 'card' }: {
  docs: Doc[] | null; onUpload: (kind: string, name: string, data: string) => Promise<void>; getUrl: (id: string, download: boolean) => Promise<string>;
  onRemove: (doc: Doc) => Promise<void>; canRemove: (doc: Doc) => boolean; onError: (message: string) => void; tone?: 'card' | 'plain';
}) {
  const [kind, setKind] = useState(DOCUMENT_KINDS[0]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const choose = async (list: FileList | null) => {
    const file = list?.[0]; if (!file) return;
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
    if (!OK_EXT.includes(ext)) { onError(`${file.name}: attach a PDF, PNG or JPG file.`); if (input.current) input.current.value = ''; return; }
    if (file.size > MAX_BYTES) { onError(`${file.name}: the file must be smaller than 2 MB.`); if (input.current) input.current.value = ''; return; }
    setBusy(true);
    try { await onUpload(kind, file.name, await readBase64(file)); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to upload the file.'); }
    setBusy(false); if (input.current) input.current.value = '';
  };
  const open = (doc: Doc, download: boolean) => openLeaveFile(getUrl, doc.id, download).catch((cause: Error) => onError(cause.message));
  const remove = async (doc: Doc) => { if (!window.confirm(`Remove ${doc.name}?`)) return; setBusy(true); try { await onRemove(doc); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to remove the file.'); } setBusy(false); };
  return <div className={tone === 'card' ? 'rounded-2xl bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)]' : ''}>
    <p className="flex items-center gap-2 text-sm font-semibold text-[#14233b]"><Paperclip className="h-4 w-4 text-[#0b587b]" />Attached documents</p>
    {docs === null ? <p className="mt-2 text-sm text-slate-500">Loading…</p> : !docs.length ? <p className="mt-2 text-sm text-slate-500">No documents yet.</p> : <ul className="mt-2 space-y-1.5">{docs.map((doc) => <li key={doc.id} className="flex items-center gap-2 rounded-xl bg-[#f4f6fa] px-3 py-2 text-sm">
      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
      <button type="button" onClick={() => void open(doc, false)} className="min-w-0 flex-1 truncate text-left font-medium text-[#0b587b] hover:underline" title={doc.name}>{doc.name}</button>
      <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">{doc.kind} · {kb(doc.size)}{doc.by === 'hr' ? ' · HR' : ''}</span>
      <button type="button" onClick={() => void open(doc, true)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white hover:text-[#0b587b]" aria-label={`Download ${doc.name}`}><Download className="h-4 w-4" /></button>
      {canRemove(doc) && <button type="button" disabled={busy} onClick={() => void remove(doc)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-50" aria-label={`Remove ${doc.name}`}><X className="h-4 w-4" /></button>}
    </li>)}</ul>}
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Type of document" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">{DOCUMENT_KINDS.map((item) => <option key={item}>{item}</option>)}</select>
      <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 text-sm font-semibold text-[#0b587b] hover:bg-[#f3f9fc] ${busy ? 'pointer-events-none opacity-50' : ''}`}><Paperclip className="h-4 w-4" />{busy ? 'Working…' : 'Add document'}<input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => void choose(event.target.files)} className="hidden" /></label>
    </div>
    <p className="mt-1.5 text-[11px] text-slate-400">PDF, PNG or JPG, each under 2 MB.</p>
  </div>;
}
