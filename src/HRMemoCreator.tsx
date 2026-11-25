import { useEffect, useRef, useState } from 'react';
import { Eye, PencilLine, RotateCcw } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { PrintMenu } from './PrintMenu';
import { downloadBlob } from './lib/downloadBlob';
import { printPdfBlob } from './lib/savePdf';
import { pdfPageImages } from './lib/pdfPages';
import { memoDocPdf } from './lib/memoDocPdf';
import { HRMemoEditor, MEMO_TEMPLATES, type MemoEditorHandle } from './HRMemoEditor';

// Office HR > Miscellaneous > Create Memo: HR types the memo straight onto the A4 page (like in Word) on the department letterhead, then prints it or saves it as a PDF.
// The memo being written and the letterhead chosen are kept in this browser.
const DOC_KEY = 'ara-memo-doc', SENDER_KEY = 'ara-memo-sender';
type Dept = { id: string; label: string; email: string; phone: string };
type Sender = { dept: string; email: string; phone: string };
const API = '/api/status?resource=hr';
const read = (key: string) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* the browser may not allow it */ } };
const loadSender = (): Sender => { try { const saved = JSON.parse(read(SENDER_KEY) || 'null'); return { dept: saved?.dept || '', email: saved?.email || '', phone: saved?.phone || '' }; } catch { return { dept: '', email: '', phone: '' }; } };

export function HRMemoCreator({ onError }: { onError: (message: string) => void }) {
  const [initial] = useState(() => read(DOC_KEY) || MEMO_TEMPLATES[0].make());
  const [sender, setSender] = useState<Sender>(loadSender);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [editing, setEditing] = useState<Dept[] | null>(null);
  const [savingDepts, setSavingDepts] = useState(false);
  const [pages, setPages] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const editor = useRef<MemoEditorHandle | null>(null);
  const pagesRef = useRef<string[]>([]);
  useEffect(() => { write(SENDER_KEY, JSON.stringify(sender)); }, [sender]);
  // The department letterheads (e-mail and phone beside the company details) are shared by every HR officer; they are kept in the database, not in the code.
  useEffect(() => { void officeFetch(`${API}&action=memo_letterheads`).then((response) => response.json()).then((data) => { if (data.error) throw new Error(data.error); setDepts(data.departments || []); }).catch((cause: Error) => onError(cause.message || 'Unable to load the department letterheads.')); }, []);
  const chooseDept = (id: string) => { const found = depts.find((item) => item.id === id); setSender((current) => found ? { dept: id, email: found.email, phone: found.phone } : { ...current, dept: '' }); };
  const saveDepts = async () => {
    if (!editing) return; setSavingDepts(true);
    try {
      const response = await officeFetch(`${API}&action=memo_letterheads_save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ departments: editing }) });
      const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || 'Unable to save.');
      setDepts(data.departments); setEditing(null);
      const found = (data.departments as Dept[]).find((item) => item.id === sender.dept); if (found) setSender({ dept: found.id, email: found.email, phone: found.phone });
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setSavingDepts(false);
  };

  const pdf = async () => { if (!editor.current) throw new Error('The memo is still loading.'); return memoDocPdf(editor.current.json() as Parameters<typeof memoDocPdf>[0], sender); };
  const fileName = () => {
    const text = editor.current?.text() || '';
    const ref = /NO\.?\s*RUJ\s*:\s*([^\n]+)/i.exec(text)?.[1] || /PER\s*:\s*([^\n]+)/i.exec(text)?.[1] || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
    return `Memo ${ref.replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 60)}`;
  };
  const print = async () => { try { printPdfBlob(await pdf()); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to print the memo.'); } };
  const save = async () => { downloadBlob([await pdf()], `${fileName()}.pdf`, 'application/pdf'); };
  const closePreview = () => { pagesRef.current.forEach((url) => URL.revokeObjectURL(url)); pagesRef.current = []; setPages(null); };
  const preview = async () => {
    setBusy(true);
    try { const urls = await pdfPageImages(await pdf(), 1.6); pagesRef.current = urls; setPages(urls); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to show the preview.'); }
    setBusy(false);
  };
  useEffect(() => () => pagesRef.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const start = (html: string) => { closePreview(); if (editor.current && !editor.current.empty() && !window.confirm('Start again? What is on the page now will be replaced.')) return; editor.current?.replace(html); };
  const field = 'mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0b587b]';
  const label = 'block text-xs font-semibold text-slate-500';
  const plain = 'inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0b587b] disabled:opacity-50';

  return <div className="space-y-3">
    <section className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-semibold">Create Memo</h3><p className="mt-1 text-sm text-slate-500">Click on the page and type, like in Word. It comes out on the company letterhead.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => pages ? closePreview() : void preview()} className={plain}>{pages ? <><PencilLine className="h-4 w-4" />Back to writing</> : <><Eye className="h-4 w-4" />{busy ? 'Preparing…' : 'Preview PDF'}</>}</button>
          <PrintMenu onPrint={() => void print()} onPdf={save} onError={onError} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
        <label className={label}>Start from a template<select value="" onChange={(event) => { const template = MEMO_TEMPLATES.find((item) => item.id === event.target.value); if (template) start(template.make()); }} className={field}><option value="">Choose…</option>{MEMO_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className={label}>Letterhead (department)<select value={sender.dept} onChange={(event) => chooseDept(event.target.value)} className={field}><option value="">Other (type the e-mail and phone below)</option>{depts.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.email}</option>)}</select></label>
        <button type="button" onClick={() => start('<p></p>')} className={plain}><RotateCcw className="h-4 w-4" />New memo</button>
      </div>
      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-[#0b587b]">E-mail and phone on the letterhead</summary>
        <div className="mt-2 space-y-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>E-mail under the address<input value={sender.email} onChange={(event) => setSender({ ...sender, dept: '', email: event.target.value })} maxLength={80} className={field} /></label>
            <label className={label}>Phone under the address<input value={sender.phone} onChange={(event) => setSender({ ...sender, dept: '', phone: event.target.value })} maxLength={60} className={field} /></label>
          </div>
          {!editing ? <button type="button" onClick={() => setEditing(depts.length ? depts.map((item) => ({ ...item })) : [{ id: 'dept1', label: '', email: '', phone: '' }])} className="text-xs font-semibold text-[#0b587b] hover:underline">Edit the department letterheads (the same list for every HR officer)</button> : <div className="space-y-2 rounded-xl bg-[#f4fafd] p-3">
            {editing.map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.3fr_1.1fr_auto]">
              <input aria-label="Department" value={item.label} onChange={(event) => setEditing(editing.map((row, at) => at === index ? { ...row, label: event.target.value } : row))} placeholder="Department" maxLength={60} className={field} />
              <input aria-label="E-mail" value={item.email} onChange={(event) => setEditing(editing.map((row, at) => at === index ? { ...row, email: event.target.value } : row))} placeholder="E-mail" maxLength={80} className={field} />
              <input aria-label="Phone" value={item.phone} onChange={(event) => setEditing(editing.map((row, at) => at === index ? { ...row, phone: event.target.value } : row))} placeholder="Phone" maxLength={60} className={field} />
              <button type="button" aria-label="Remove department" onClick={() => setEditing(editing.filter((_, at) => at !== index))} className="h-10 rounded-xl px-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">Remove</button>
            </div>)}
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setEditing([...editing, { id: `dept${Date.now().toString(36)}`, label: '', email: '', phone: '' }])} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0b587b]">Add a department</button><button type="button" disabled={savingDepts} onClick={() => void saveDepts()} className="h-9 rounded-xl bg-[#0b587b] px-4 text-xs font-bold text-white disabled:opacity-50">{savingDepts ? 'Saving…' : 'Save'}</button><button type="button" onClick={() => setEditing(null)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">Cancel</button></div>
          </div>}
        </div>
      </details>
      <p className="text-xs text-slate-400">The memo being written is remembered on this computer only. The department letterheads are shared by every HR officer.</p>
    </section>
    {pages && <section className="space-y-3 rounded-2xl bg-slate-100 p-3">{pages.map((url, index) => <img key={url} src={url} alt={`Memo page ${index + 1}`} className="mx-auto w-full max-w-[794px] rounded bg-white shadow" />)}</section>}
    {/* The page stays loaded while the preview is open, so undo still works afterwards. */}
    <div className={pages ? 'hidden' : ''}><HRMemoEditor initial={initial} contact={sender} onChange={(html) => write(DOC_KEY, html)} handle={editor} /></div>
  </div>;
}
