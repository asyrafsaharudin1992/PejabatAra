import { useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';

// Files attached to leave (a medical certificate and the like): choosing and uploading them, and opening them later through a
// link that expires after a minute. The same pieces are used by staff, approvers and HR.
export type Attached = { id: string; name: string; size: number };
export const MAX_FILES = 3;
export const MAX_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_REQUIRED_FOR = new Set(['ML']);   // only medical leave must have a file
const OK_EXT = ['pdf', 'png', 'jpg', 'jpeg'];
const kb = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const readBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('Unable to read the file.')); reader.readAsDataURL(file); });

// Opens a file: a new tab to view it, or a download. `getUrl` asks the server for the one-minute link.
export async function openLeaveFile(getUrl: (id: string, download: boolean) => Promise<string>, id: string, download: boolean) {
  const tab = download ? null : window.open('', '_blank');
  try {
    const url = await getUrl(id, download);
    if (download) window.location.assign(url); else if (tab) tab.location.href = url; else window.open(url, '_blank');
  } catch (cause) { tab?.close(); throw cause; }
}

export function AttachmentPicker({ files, onChange, upload, required, onError, label = 'Attachment' }: { files: Attached[]; onChange: (files: Attached[]) => void; upload: (name: string, data: string) => Promise<Attached>; required?: boolean; onError: (message: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const choose = async (list: FileList | null) => {
    if (!list?.length) return;
    const chosen = Array.from(list).slice(0, MAX_FILES - files.length);
    if (list.length > chosen.length) onError(`Up to ${MAX_FILES} files.`);
    setBusy(true);
    try {
      const added: Attached[] = [];
      for (const file of chosen) {
        const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
        if (!OK_EXT.includes(ext)) { onError(`${file.name}: attach a PDF, PNG or JPG file.`); continue; }
        if (file.size > MAX_BYTES) { onError(`${file.name}: the file must be smaller than 2 MB.`); continue; }
        added.push(await upload(file.name, await readBase64(file)));
      }
      if (added.length) onChange([...files, ...added]);
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to upload the file.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  return <div>
    <p className="text-sm font-semibold text-slate-600">{label}{required ? <span className="text-rose-600"> *</span> : <span className="font-normal text-slate-400"> (optional)</span>}</p>
    {files.length > 0 && <ul className="mt-1.5 space-y-1.5">{files.map((file) => <li key={file.id} className="flex items-center gap-2 rounded-xl bg-[#f4f6fa] px-3 py-2 text-sm"><FileText className="h-4 w-4 shrink-0 text-[#0b587b]" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-xs text-slate-400">{kb(file.size)}</span><button type="button" onClick={() => onChange(files.filter((item) => item.id !== file.id))} aria-label={`Remove ${file.name}`} className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-white hover:text-rose-600"><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
    {files.length < MAX_FILES && <label className={`mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-[#0b587b] hover:bg-slate-50 ${busy ? 'pointer-events-none opacity-60' : ''}`}><Paperclip className="h-4 w-4" />{busy ? 'Uploading…' : files.length ? 'Add another file' : 'Choose a file'}<input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" multiple className="hidden" onChange={(event) => void choose(event.target.files)} /></label>}
    <p className="mt-1 text-[11px] text-slate-400">PDF, PNG or JPG, up to {MAX_FILES} files, each under 2 MB.</p>
  </div>;
}

export function AttachmentLinks({ items, getUrl, canDownload = false, onError }: { items?: Attached[]; getUrl: (id: string, download: boolean) => Promise<string>; canDownload?: boolean; onError: (message: string) => void }) {
  if (!items?.length) return null;
  const open = (id: string, download: boolean) => openLeaveFile(getUrl, id, download).catch((cause: Error) => onError(cause.message));
  return <ul className="mt-1.5 flex flex-wrap gap-1.5">{items.map((file) => <li key={file.id} className="inline-flex items-center gap-1 rounded-full bg-sky-50 py-1 pl-2.5 pr-1.5 text-xs text-sky-800"><Paperclip className="h-3 w-3" /><button type="button" onClick={() => void open(file.id, false)} className="max-w-[160px] truncate font-semibold hover:underline" title={`Open ${file.name}`}>{file.name}</button>{canDownload && <button type="button" onClick={() => void open(file.id, true)} className="ml-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#0b587b] hover:bg-sky-100">Download</button>}</li>)}</ul>;
}
