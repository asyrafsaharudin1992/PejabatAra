import { ChangeEvent, FormEvent, ReactNode, useEffect, useState } from 'react';
import { Copy, ExternalLink, FileDown, Image as ImageIcon, Link2, MessageCircle, NotebookPen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { card } from './AssessmentStaff';

// Office HR > Miscellaneous: important links, posters HR can share straight to WhatsApp (a service poster, for example) and notes. HR adds and removes everything here.
const API = '/api/status?resource=hr';
type Item = { id: string; kind: 'link' | 'poster' | 'note'; title: string; url: string; body: string; fileName: string; contentType: string; sizeBytes: number; createdBy: string; createdAt: string };
const field = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0b587b]';
const button = 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-50';
const whatsapp = (text: string) => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
const MAX_POSTER = 3 * 1024 * 1024;

async function call(query: string, body?: unknown) {
  const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}
const toBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read the file.')); reader.readAsDataURL(file); });
const fileOf = (base64: string, name: string, type: string) => { const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)); return new File([bytes], name, { type }); };

export function HRMisc({ onError }: { onError: (message: string) => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [edit, setEdit] = useState<{ id?: string; kind: 'link' | 'note'; title: string; url: string; body: string } | null>(null);
  const [poster, setPoster] = useState<{ title: string; body: string; file: File | null } | null>(null);
  const load = () => call('action=misc_list').then((result) => { setItems(result.items); setNotSetUp(Boolean(result.notSetUp)); }).catch((cause: Error) => { setItems([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);

  const run = async (work: () => Promise<unknown>, done = '') => {
    setBusy(true); setNotice('');
    try { await work(); if (done) setNotice(done); await load(); return true; }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); return false; }
    finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!edit) return;
    if (await run(() => call('action=misc_save', edit), 'Saved.')) setEdit(null);
  };
  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!poster?.file) { onError('Choose the poster image.'); return; }
    if (poster.file.size > MAX_POSTER) { onError('The poster must be smaller than 3 MB. Reduce the image size and try again.'); return; }
    const file = poster.file;
    if (await run(async () => call('action=misc_poster_upload', { title: poster.title, body: poster.body, fileName: file.name, base64: await toBase64(file) }), 'Poster added.')) setPoster(null);
  };
  const remove = (item: Item) => { if (window.confirm(`Delete "${item.title}"?`)) void run(() => call('action=misc_delete', { id: item.id }), 'Deleted.'); };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setNotice('Copied.'); } catch { onError('Unable to copy. Select the text and copy it instead.'); } };

  const links = (items || []).filter((item) => item.kind === 'link');
  const posters = (items || []).filter((item) => item.kind === 'poster');
  const notes = (items || []).filter((item) => item.kind === 'note');
  const header = (icon: ReactNode, title: string, hint: string, onAdd: () => void, label: string) => <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-lg font-semibold">{icon}{title}</h3><p className="mt-1 text-sm text-slate-500">{hint}</p></div><button onClick={onAdd} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4c6a]"><Plus className="h-4 w-4" />{label}</button></div>;

  return <div className="mx-auto max-w-[1100px] space-y-5">
    <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Miscellaneous</h2><p className="mt-2 max-w-xl text-sm text-white/75">Important links, posters to share on WhatsApp and notes, kept in one place.</p></section>
    {notSetUp && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">This page is not set up yet. System Admin needs to run the latest database migration first.</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</p>}
    {items === null && <p className="text-sm text-slate-500">Loading…</p>}

    {items && <>
      <section className={`${card} space-y-4`}>
        {header(<Link2 className="h-5 w-5 text-[#0b587b]" />, 'Important links', 'Websites and forms HR uses often. Add your own.', () => setEdit({ kind: 'link', title: '', url: '', body: '' }), 'Add link')}
        {links.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No links yet.</p> : <ul className="divide-y divide-slate-100">{links.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1"><a href={item.url} target="_blank" rel="noopener noreferrer" className="block truncate font-semibold text-[#0b587b] hover:underline">{item.title}</a><p className="truncate text-xs text-slate-500">{item.url}</p>{item.body && <p className="mt-0.5 text-xs text-slate-500">{item.body}</p>}</div>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={button}><ExternalLink className="h-3.5 w-3.5" />Open</a>
          <button onClick={() => void copy(item.url)} className={button}><Copy className="h-3.5 w-3.5" />Copy</button>
          <button onClick={() => whatsapp(`${item.title}\n${item.url}`)} className={button}><MessageCircle className="h-3.5 w-3.5" />WhatsApp</button>
          <button onClick={() => setEdit({ id: item.id, kind: 'link', title: item.title, url: item.url, body: item.body })} className={button} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => remove(item)} disabled={busy} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </li>)}</ul>}
      </section>

      <section className={`${card} space-y-4`}>
        {header(<ImageIcon className="h-5 w-5 text-[#0b587b]" />, 'Posters', 'Service posters and other images. Share straight to WhatsApp (on a phone the share sheet offers WhatsApp; on a computer the image is saved so you can attach it).', () => setPoster({ title: '', body: '', file: null }), 'Add poster')}
        {posters.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No posters yet.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{posters.map((item) => <PosterCard key={item.id} item={item} busy={busy} onDelete={() => remove(item)} onError={onError} onNotice={setNotice} />)}</div>}
      </section>

      <section className={`${card} space-y-4`}>
        {header(<NotebookPen className="h-5 w-5 text-[#0b587b]" />, 'Notes', 'Short notes, wording you reuse, reminders for HR.', () => setEdit({ kind: 'note', title: '', url: '', body: '' }), 'Add note')}
        {notes.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No notes yet.</p> : <ul className="space-y-3">{notes.map((item) => <li key={item.id} className="rounded-2xl bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold">{item.title}</p><span className="flex flex-wrap gap-2">
            <button onClick={() => void copy(item.body)} className={button}><Copy className="h-3.5 w-3.5" />Copy</button>
            <button onClick={() => whatsapp(`${item.title}\n${item.body}`)} className={button}><MessageCircle className="h-3.5 w-3.5" />WhatsApp</button>
            <button onClick={() => setEdit({ id: item.id, kind: 'note', title: item.title, url: '', body: item.body })} className={button} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => remove(item)} disabled={busy} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete"><Trash2 className="h-4 w-4" /></button></span></div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.body || '—'}</p>
        </li>)}</ul>}
      </section>
    </>}

    {edit && <Dialog title={`${edit.id ? 'Edit' : 'Add'} ${edit.kind === 'link' ? 'link' : 'note'}`} onClose={() => setEdit(null)}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm font-semibold text-slate-600">Title<input required value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} maxLength={120} className={`${field} mt-1.5`} /></label>
        {edit.kind === 'link' && <label className="block text-sm font-semibold text-slate-600">Link<input required type="url" value={edit.url} onChange={(event) => setEdit({ ...edit, url: event.target.value })} placeholder="https://" className={`${field} mt-1.5`} /></label>}
        <label className="block text-sm font-semibold text-slate-600">{edit.kind === 'link' ? 'Description (optional)' : 'Note'}<textarea rows={edit.kind === 'note' ? 6 : 2} required={edit.kind === 'note'} value={edit.body} onChange={(event) => setEdit({ ...edit, body: event.target.value })} maxLength={5000} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0b587b]" /></label>
        <div className="flex justify-end"><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Dialog>}
    {poster && <Dialog title="Add poster" onClose={() => setPoster(null)}>
      <form onSubmit={upload} className="space-y-3">
        <label className="block text-sm font-semibold text-slate-600">Title<input required value={poster.title} onChange={(event) => setPoster({ ...poster, title: event.target.value })} maxLength={120} className={`${field} mt-1.5`} /></label>
        <label className="block text-sm font-semibold text-slate-600">Message sent with it on WhatsApp (optional)<textarea rows={3} value={poster.body} onChange={(event) => setPoster({ ...poster, body: event.target.value })} maxLength={2000} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0b587b]" /></label>
        <label className="block text-sm font-semibold text-slate-600">Image (PNG, JPG or WebP, up to 3 MB)<input required type="file" accept="image/png,image/jpeg,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => setPoster({ ...poster, file: event.target.files?.[0] || null })} className="mt-1.5 block w-full text-sm" /></label>
        <div className="flex justify-end"><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50">{busy ? 'Uploading…' : 'Add poster'}</button></div>
      </form>
    </Dialog>}
  </div>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-4" onClick={onClose}>
    <div role="dialog" aria-label={title} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3><button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      {children}
    </div>
  </div>;
}

// One poster: the image is fetched when the card appears, and freed when it goes away.
function PosterCard({ item, busy, onDelete, onError, onNotice }: { key?: string; item: Item; busy: boolean; onDelete: () => void; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = '';
    let live = true;
    call(`action=misc_poster_get&id=${item.id}`).then((result) => { if (!live) return; const loaded = fileOf(result.base64, result.fileName, result.contentType); setFile(loaded); url = URL.createObjectURL(loaded); setSrc(url); }).catch((cause: Error) => { if (live) onError(cause.message); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [item.id]);
  const share = async () => {
    if (!file) return;
    const message = item.body || item.title;
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: item.title, text: message }); return; }
    } catch (cause) { if ((cause as Error)?.name === 'AbortError') return; }
    // No share sheet (a computer): save the image, then open WhatsApp with the message so the image can be attached.
    downloadBlob([file], file.name, file.type);
    whatsapp(message);
    onNotice('The poster was saved to your computer. Attach it in the WhatsApp chat that opened.');
  };
  return <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
    <div className="grid aspect-[4/5] place-items-center bg-slate-50">{src ? <img src={src} alt={item.title} className="h-full w-full object-contain" /> : <p className="text-xs text-slate-400">Loading…</p>}</div>
    <div className="space-y-2 p-3"><p className="truncate font-semibold">{item.title}</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void share()} disabled={!file} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><MessageCircle className="h-3.5 w-3.5" />Share to WhatsApp</button>
        <button onClick={() => file && downloadBlob([file], file.name, file.type)} disabled={!file} className={button}><FileDown className="h-3.5 w-3.5" />Save</button>
        <button onClick={onDelete} disabled={busy} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete poster"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  </div>;
}
