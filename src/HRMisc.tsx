import { ChangeEvent, FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Award, CalendarClock, Check, Copy, ExternalLink, FileDown, Image as ImageIcon, Link2, MessageCircle, NotebookPen, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { shrinkPoster } from './ManagedServices';
import { card } from './AssessmentStaff';
import { HRSotm } from './HRSotm';

// Office HR > Miscellaneous: four cards. Important links, posters HR shares on WhatsApp, notes (optionally with a due date that shows on the HR calendar) and
// things HR prints often. Each card opens its own page; HR adds and removes everything here.
const API = '/api/status?resource=hr';
type Kind = 'link' | 'poster' | 'note' | 'print';
type Item = { id: string; kind: Kind; title: string; url: string; body: string; fileName: string; contentType: string; sizeBytes: number; createdBy: string; createdAt: string; dueOn: string | null; done: boolean };
const field = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0b587b]';
const button = 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-50';
const whatsapp = (text: string) => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
const MAX_FILE = 3 * 1024 * 1024;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const dmy = (date: string) => date.split('-').reverse().join('/');
const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);

async function call(query: string, body?: unknown) {
  const response = await officeFetch(`${API}&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}
const toBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read the file.')); reader.readAsDataURL(file); });
const fileOf = (base64: string, name: string, type: string) => { const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)); return new File([bytes], name, { type }); };
// Sends a file to the printer: an image prints from a hidden frame; a PDF opens in a new tab, where the browser's own viewer prints it.
function printFile(file: File) {
  const url = URL.createObjectURL(file);
  if (file.type.startsWith('image/')) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.srcdoc = `<img src="${url}" style="max-width:100%" onload="setTimeout(function(){window.focus();window.print();},150)">`;
    document.body.appendChild(frame);
    window.setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
  } else { window.open(url, '_blank', 'noopener'); window.setTimeout(() => URL.revokeObjectURL(url), 60000); }
}

const SECTIONS: { kind: Kind; title: string; hint: string; icon: typeof Link2; tone: string; add: string }[] = [
  { kind: 'link', title: 'Important links', hint: 'Websites and forms HR uses often.', icon: Link2, tone: 'bg-sky-50 text-sky-600', add: 'Add link' },
  { kind: 'poster', title: 'Posters', hint: 'Service posters to share straight to WhatsApp.', icon: ImageIcon, tone: 'bg-emerald-50 text-emerald-600', add: 'Add poster' },
  { kind: 'note', title: 'Notes', hint: 'Notes and wording you reuse. Add a due date to get a reminder.', icon: NotebookPen, tone: 'bg-amber-50 text-amber-600', add: 'Add note' },
  { kind: 'print', title: 'To print', hint: 'Forms and files HR prints often.', icon: Printer, tone: 'bg-violet-50 text-violet-600', add: 'Add to print' },
];

export function HRMisc({ onError }: { onError: (message: string) => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const [section, setSection] = useState<Kind | null>(null);
  const [sotm, setSotm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [edit, setEdit] = useState<{ id?: string; kind: 'link' | 'note' | 'print'; title: string; url: string; body: string; dueOn: string } | null>(null);
  const [upload, setUpload] = useState<{ id?: string; kind: 'poster' | 'print'; title: string; body: string; file: File | null } | null>(null);
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
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!upload) return;
    // A new file is needed when adding; when editing it is only needed to replace the old one.
    if (!upload.file && !upload.id) { onError('Choose the file.'); return; }
    const file = upload.file, current = upload;
    // Images are shrunk first (longest side 1600px) so every card loads fast; PDFs go as they are.
    const prepared = async (chosen: File) => {
      if (!chosen.type.startsWith('image/')) return { fileName: chosen.name, base64: await toBase64(chosen), size: chosen.size };
      const small = await shrinkPoster(chosen, 1600, 0.85);
      return { fileName: small.name, base64: `data:${small.type};base64,${small.base64}`, size: small.size };
    };
    const work = async () => {
      const sent = file ? await prepared(file) : null;
      if (sent && sent.size > MAX_FILE) throw new Error('The file must be smaller than 3 MB. Reduce its size and try again.');
      return current.id
        ? call('action=misc_file_update', { id: current.id, title: current.title, body: current.body, ...(sent ? { fileName: sent.fileName, base64: sent.base64 } : {}) })
        : call('action=misc_poster_upload', { kind: current.kind, title: current.title, body: current.body, fileName: sent!.fileName, base64: sent!.base64 });
    };
    if (await run(work, current.id ? 'Saved.' : 'Added.')) setUpload(null);
  };
  const remove = (item: Item) => { if (window.confirm(`Delete "${item.title}"?`)) void run(() => call('action=misc_delete', { id: item.id }), 'Deleted.'); };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setNotice('Copied.'); } catch { onError('Unable to copy. Select the text and copy it instead.'); } };

  const of = (kind: Kind) => (items || []).filter((item) => item.kind === kind);
  const dueNotes = of('note').filter((note) => note.dueOn && !note.done && daysUntil(note.dueOn) <= 7);
  const current = SECTIONS.find((entry) => entry.kind === section);

  return <div className="mx-auto max-w-[1100px] space-y-5">
    <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Miscellaneous</h2><p className="mt-2 max-w-xl text-sm text-white/75">Links, posters, notes and files to print, kept in one place.</p></section>
    {notSetUp && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">This page is not set up yet. System Admin needs to run the latest database migration first.</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</p>}
    {items === null && <p className="text-sm text-slate-500">Loading…</p>}

    {sotm && <>
      <button onClick={() => setSotm(false)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b] hover:underline"><ArrowLeft className="h-4 w-4" />Miscellaneous</button>
      <HRSotm onError={onError} />
    </>}

    {items && !current && !sotm && <>
      {dueNotes.length > 0 && <button onClick={() => setSection('note')} className="flex w-full items-center gap-3 rounded-2xl bg-amber-50 p-4 text-left text-sm text-amber-900 hover:bg-amber-100"><CalendarClock className="h-5 w-5 shrink-0" /><span><strong>{dueNotes.length} {dueNotes.length === 1 ? 'note is' : 'notes are'} due</strong> in the next 7 days or overdue. Open Notes to see them.</span></button>}
      <div className="grid gap-4 sm:grid-cols-2">{SECTIONS.map((entry) => { const Icon = entry.icon; const count = of(entry.kind).length; return <button key={entry.kind} onClick={() => setSection(entry.kind)} className="group flex flex-col rounded-[26px] border border-black/[0.045] bg-white p-6 text-left shadow-[0_2px_8px_rgba(0,0,0,0.025)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(11,88,123,0.12)]">
        <span className="flex items-start justify-between"><span className={`grid h-12 w-12 place-items-center rounded-2xl ${entry.tone}`}><Icon className="h-6 w-6" /></span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{count}</span></span>
        <span className="mt-5 text-lg font-semibold">{entry.title}</span><span className="mt-1 text-sm text-slate-500">{entry.hint}</span>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b]">Open<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
      </button>; })}
        <button onClick={() => setSotm(true)} className="group flex flex-col rounded-[26px] border border-black/[0.045] bg-white p-6 text-left shadow-[0_2px_8px_rgba(0,0,0,0.025)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(11,88,123,0.12)]">
          <span className="flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600"><Award className="h-6 w-6" /></span></span>
          <span className="mt-5 text-lg font-semibold">SOTM</span><span className="mt-1 text-sm text-slate-500">Staff of the Month poster: choose the staff, add a face photo, download.</span>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b]">Open<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
        </button></div>
    </>}

    {items && current && <section className={`${card} space-y-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><button onClick={() => { setSection(null); setNotice(''); }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b] hover:underline"><ArrowLeft className="h-4 w-4" />Miscellaneous</button><h3 className="mt-2 text-xl font-semibold">{current.title}</h3><p className="text-sm text-slate-500">{current.hint}</p></div>
        <button onClick={() => current.kind === 'poster' ? setUpload({ kind: 'poster', title: '', body: '', file: null }) : current.kind === 'print' ? setUpload({ kind: 'print', title: '', body: '', file: null }) : setEdit({ kind: current.kind as 'link' | 'note', title: '', url: '', body: '', dueOn: '' })} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4c6a]"><Plus className="h-4 w-4" />{current.add}</button>
      </div>

      {current.kind === 'link' && (of('link').length === 0 ? <Empty text="No links yet." /> : <ul className="divide-y divide-slate-100">{of('link').map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1"><a href={item.url} target="_blank" rel="noopener noreferrer" className="block truncate font-semibold text-[#0b587b] hover:underline">{item.title}</a><p className="truncate text-xs text-slate-500">{item.url}</p>{item.body && <p className="mt-0.5 text-xs text-slate-500">{item.body}</p>}</div>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={button}><ExternalLink className="h-3.5 w-3.5" />Open</a>
        <button onClick={() => void copy(item.url)} className={button}><Copy className="h-3.5 w-3.5" />Copy</button>
        <button onClick={() => whatsapp(`${item.title}\n${item.url}`)} className={button}><MessageCircle className="h-3.5 w-3.5" />WhatsApp</button>
        <button onClick={() => setEdit({ id: item.id, kind: 'link', title: item.title, url: item.url, body: item.body, dueOn: '' })} className={button} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => remove(item)} disabled={busy} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
      </li>)}</ul>)}

      {current.kind === 'poster' && (of('poster').length === 0 ? <Empty text="No posters yet." /> : <>
        <p className="text-sm text-slate-500">On a phone, Share to WhatsApp opens the share sheet with the image. On a computer the image is saved and WhatsApp opens with the message, so you attach the image yourself.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{of('poster').map((item) => <FileCard key={item.id} item={item} busy={busy} onEdit={() => setUpload({ id: item.id, kind: item.kind === 'print' ? 'print' : 'poster', title: item.title, body: item.body, file: null })} onDelete={() => remove(item)} onError={onError} onNotice={setNotice} mode="share" />)}</div></>)}

      {current.kind === 'note' && (of('note').length === 0 ? <Empty text="No notes yet." /> : <ul className="space-y-3">{of('note').map((item) => { const left = item.dueOn ? daysUntil(item.dueOn) : null; const state = item.done ? 'done' : left === null ? '' : left < 0 ? 'overdue' : left === 0 ? 'today' : left <= 7 ? 'soon' : 'later'; const tone = state === 'overdue' ? 'bg-rose-50 text-rose-700' : state === 'today' || state === 'soon' ? 'bg-amber-50 text-amber-800' : state === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'; return <li key={item.id} className={`rounded-2xl p-4 ${item.done ? 'bg-slate-50/60' : 'bg-slate-50'}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><p className={`font-semibold ${item.done ? 'text-slate-400 line-through' : ''}`}>{item.title}</p>{item.dueOn && <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone}`}><CalendarClock className="h-3 w-3" />{item.done ? `Done · was due ${dmy(item.dueOn)}` : state === 'overdue' ? `Overdue · ${dmy(item.dueOn)}` : state === 'today' ? 'Due today' : `Due ${dmy(item.dueOn)}`}</span>}</div>
          <span className="flex flex-wrap gap-2">
            {item.dueOn && <button onClick={() => void run(() => call('action=misc_note_done', { id: item.id, done: !item.done }))} disabled={busy} className={button}><Check className="h-3.5 w-3.5" />{item.done ? 'Not done' : 'Mark done'}</button>}
            <button onClick={() => void copy(item.body)} className={button}><Copy className="h-3.5 w-3.5" />Copy</button>
            <button onClick={() => whatsapp(`${item.title}\n${item.body}`)} className={button}><MessageCircle className="h-3.5 w-3.5" />WhatsApp</button>
            <button onClick={() => setEdit({ id: item.id, kind: 'note', title: item.title, url: '', body: item.body, dueOn: item.dueOn || '' })} className={button} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => remove(item)} disabled={busy} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete"><Trash2 className="h-4 w-4" /></button></span></div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.body || '—'}</p>
      </li>; })}</ul>)}

      {current.kind === 'print' && (of('print').length === 0 ? <Empty text="Nothing to print yet. Add a form or file HR prints often." /> : <div className="grid gap-4 sm:grid-cols-2">{of('print').map((item) => item.fileName ? <FileCard key={item.id} item={item} busy={busy} onEdit={() => setUpload({ id: item.id, kind: item.kind === 'print' ? 'print' : 'poster', title: item.title, body: item.body, file: null })} onDelete={() => remove(item)} onError={onError} onNotice={setNotice} mode="print" /> : <div key={item.id} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4 text-violet-500" />{item.title}</p><p className="mt-1 truncate text-xs text-slate-500">{item.url}</p>{item.body && <p className="mt-1 text-xs text-slate-500">{item.body}</p>}
        <div className="mt-3 flex flex-wrap gap-2"><a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"><Printer className="h-3.5 w-3.5" />Open to print</a>
          <button onClick={() => setEdit({ id: item.id, kind: 'print', title: item.title, url: item.url, body: item.body, dueOn: '' })} className={button} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => remove(item)} disabled={busy} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>)}
      {current.kind === 'print' && <button onClick={() => setEdit({ kind: 'print', title: '', url: '', body: '', dueOn: '' })} className="text-sm font-semibold text-[#0b587b] hover:underline">Or add a link to print instead of a file</button>}
    </section>}

    {edit && <Dialog title={`${edit.id ? 'Edit' : 'Add'} ${edit.kind === 'note' ? 'note' : edit.kind === 'print' ? 'print link' : 'link'}`} onClose={() => setEdit(null)}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm font-semibold text-slate-600">Title<input required value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} maxLength={120} className={`${field} mt-1.5`} /></label>
        {edit.kind !== 'note' && <label className="block text-sm font-semibold text-slate-600">Link<input required type="url" value={edit.url} onChange={(event) => setEdit({ ...edit, url: event.target.value })} placeholder="https://" className={`${field} mt-1.5`} /></label>}
        <label className="block text-sm font-semibold text-slate-600">{edit.kind === 'note' ? 'Note' : 'Description (optional)'}<textarea rows={edit.kind === 'note' ? 6 : 2} required={edit.kind === 'note'} value={edit.body} onChange={(event) => setEdit({ ...edit, body: event.target.value })} maxLength={5000} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0b587b]" /></label>
        {edit.kind === 'note' && <label className="block text-sm font-semibold text-slate-600">Due date (optional)<input type="date" value={edit.dueOn} onChange={(event) => setEdit({ ...edit, dueOn: event.target.value })} className={`${field} mt-1.5`} /><span className="mt-1 block text-xs font-normal text-slate-400">A note with a due date shows on the HR calendar until you mark it done.</span></label>}
        <div className="flex justify-end"><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Dialog>}
    {upload && <Dialog title={`${upload.id ? 'Edit' : 'Add'} ${upload.kind === 'poster' ? 'poster' : 'file to print'}`} onClose={() => setUpload(null)}>
      <form onSubmit={send} className="space-y-3">
        <label className="block text-sm font-semibold text-slate-600">Title<input required value={upload.title} onChange={(event) => setUpload({ ...upload, title: event.target.value })} maxLength={120} className={`${field} mt-1.5`} /></label>
        <label className="block text-sm font-semibold text-slate-600">{upload.kind === 'poster' ? 'Message sent with it on WhatsApp (optional)' : 'Note (optional)'}<textarea rows={3} value={upload.body} onChange={(event) => setUpload({ ...upload, body: event.target.value })} maxLength={2000} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0b587b]" /></label>
        <label className="block text-sm font-semibold text-slate-600">{upload.kind === 'poster' ? 'Image (PNG, JPG or WebP, up to 3 MB)' : 'File (PDF, PNG, JPG or WebP, up to 3 MB)'}{upload.id && <span className="block text-xs font-normal text-slate-400">Leave empty to keep the current file.</span>}<input required={!upload.id} type="file" accept={upload.kind === 'poster' ? 'image/png,image/jpeg,image/webp' : 'application/pdf,image/png,image/jpeg,image/webp'} onChange={(event: ChangeEvent<HTMLInputElement>) => setUpload({ ...upload, file: event.target.files?.[0] || null })} className="mt-1.5 block w-full text-sm" /></label>
        <div className="flex justify-end"><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4c6a] disabled:opacity-50">{busy ? 'Saving…' : upload.id ? 'Save' : 'Add'}</button></div>
      </form>
    </Dialog>}
  </div>;
}

const Empty = ({ text }: { text: string }) => <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">{text}</p>;

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-4" onClick={onClose}>
    <div role="dialog" aria-label={title} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3><button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      {children}
    </div>
  </div>;
}

// A poster or a file to print. The file is fetched when the card appears (an image is shown) and freed when it goes away.
function FileCard({ item, busy, onEdit, onDelete, onError, onNotice, mode }: { key?: string; item: Item; busy: boolean; onEdit: () => void; onDelete: () => void; onError: (message: string) => void; onNotice: (message: string) => void; mode: 'share' | 'print' }) {
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState('');
  const image = item.contentType.startsWith('image/');
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  // The file is only fetched once the card scrolls into view.
  useEffect(() => {
    if (!box.current || seen) return;
    const watcher = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setSeen(true); watcher.disconnect(); } }, { rootMargin: '200px' });
    watcher.observe(box.current);
    return () => watcher.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!seen) return;
    let url = '';
    let live = true;
    call(`action=misc_poster_get&id=${item.id}`).then((result) => { if (!live) return; const loaded = fileOf(result.base64, result.fileName, result.contentType); setFile(loaded); if (loaded.type.startsWith('image/')) { url = URL.createObjectURL(loaded); setSrc(url); } }).catch((cause: Error) => { if (live) onError(cause.message); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [item.id, seen]);
  const share = async () => {
    if (!file) return;
    const message = item.body || item.title;
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: item.title, text: message }); return; } }
    catch (cause) { if ((cause as Error)?.name === 'AbortError') return; }
    // No share sheet (a computer): save the image, then open WhatsApp with the message so the image can be attached.
    downloadBlob([file], file.name, file.type);
    whatsapp(message);
    onNotice('The poster was saved to your computer. Attach it in the WhatsApp chat that opened.');
  };
  return <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
    <div ref={box} className="grid aspect-[4/5] place-items-center bg-slate-50">{image ? (src ? <img src={src} alt={item.title} className="h-full w-full object-contain" /> : <p className="text-xs text-slate-400">Loading…</p>) : <div className="text-center text-slate-400"><FileDown className="mx-auto h-10 w-10" /><p className="mt-2 text-xs">PDF</p></div>}</div>
    <div className="space-y-2 p-3"><p className="truncate font-semibold">{item.title}</p>{item.body && mode === 'print' && <p className="text-xs text-slate-500">{item.body}</p>}
      <div className="flex flex-wrap gap-2">
        {mode === 'share'
          ? <button onClick={() => void share()} disabled={!file} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><MessageCircle className="h-3.5 w-3.5" />Share to WhatsApp</button>
          : <button onClick={() => file && printFile(file)} disabled={!file} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"><Printer className="h-3.5 w-3.5" />Print</button>}
        <button onClick={() => file && downloadBlob([file], file.name, file.type)} disabled={!file} className={button}><FileDown className="h-3.5 w-3.5" />Save</button>
        <button onClick={onEdit} className={button} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={onDelete} disabled={busy} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  </div>;
}
