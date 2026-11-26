import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Download, FileText, Send, Trash2, Upload, Wand2 } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { pdfPageImages } from './lib/pdfPages';
import { filledPdf } from './pdfForm/export';
import { FormBuilder } from './pdfForm/FormBuilder';
import { FormFill } from './pdfForm/FormFill';
import { blobOf, pagesOf, readBase64 } from './pdfForm/loadPdf';
import { detectFields } from './pdfForm/detect';
import { pdfWords } from './pdfForm/pdfWords';
import { activeRoles, DEFAULT_ROLES, keyOf, type Answers, type Field, type PdfForm, type Role } from './pdfForm/model';

// Office HR > Miscellaneous > Staff communication: each imported PDF form is a card beside the fixed forms. Import, place the fields, save; then assign it,
// follow the answers and download. `children` are the fixed forms' cards, shown first.
type Summary = { id: string; title: string; fileName: string; open: number; completed: number; forHr?: number };
type Part = { id: string; label: string; signer: string; done: { at: string; by: string } | null };
type Case = { id: string; name: string; code: string; status: string; dueOn: string | null; sentAt: string; parts: Part[] };
type Staff = { id: string; fullName: string; employeeCode: string; company: string; designation: string; status: string; resignDate?: string | null };
// Active staff, and those who left in the last 90 days (an exit form is often filled after the last day).
const assignable = (item: Staff) => item.status === 'Active' || Boolean(item.resignDate && Date.now() - Date.parse(item.resignDate) < 90 * 86400000);
type Editing = { id: string; base64: string; fileName: string; pages: string[]; form: PdfForm; dirty: boolean };
type Viewing = { id: string; title: string; roles: Role[]; fields: Field[]; answers: Answers; pages: string[]; parts: Part[]; name: string };
const call = async (query: string, body?: unknown) => {
  const response = await officeFetch(`/api/status?resource=hr&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json(); if (result.error) throw new Error(result.error); return result;
};
const button = 'inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0b587b] disabled:opacity-50';
const primary = 'inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white disabled:opacity-50';
const dmy = (date: string) => date.slice(0, 10).split('-').reverse().join('/');

export function HRPdfForms({ onError, children }: { onError: (message: string) => void; children?: ReactNode }) {
  const [forms, setForms] = useState<Summary[] | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [tab, setTab] = useState<'fields' | 'send' | 'answers'>('fields');
  const [cases, setCases] = useState<Case[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [signers, setSigners] = useState<Record<string, string>>({});
  const [due, setDue] = useState('');
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const run = async (work: () => Promise<void>) => { setBusy(true); setNote(''); try { await work(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Something went wrong.'); } setBusy(false); };
  const load = () => call('action=pdfform_list').then((result) => { setForms(result.forms); setNotSetUp(Boolean(result.notSetUp)); }).catch((cause: Error) => { setForms([]); onError(cause.message); });
  useEffect(() => { void load(); }, []);
  const importPdf = (file?: File) => file && run(async () => {
    if (file.size > 3 * 1024 * 1024) throw new Error('The PDF must be 3 MB or smaller.');
    const pages = await pdfPageImages(file, 2);
    setEditing({ id: '', base64: await readBase64(file), fileName: file.name, pages, form: { title: file.name.replace(/\.pdf$/i, ''), roles: DEFAULT_ROLES, fields: [] }, dirty: true }); setTab('fields'); setChosen([]); setSigners({}); setCases(null);
  });
  const openForm = (id: string) => run(async () => { const data = await call(`action=pdfform_get&id=${id}`); setEditing({ id, base64: data.base64, fileName: '', pages: await pagesOf(data.base64), form: { title: data.title, roles: data.roles, fields: data.fields }, dirty: false }); setTab('fields'); setChosen([]); setSigners({}); setCases(null); });
  const save = () => editing && run(async () => {
    const { form } = editing;
    if (editing.id) await call('action=pdfform_save', { id: editing.id, ...form });
    else { const result = await call('action=pdfform_create', { ...form, base64: editing.base64, fileName: editing.fileName }); editing.id = result.id; }
    setEditing({ ...editing, dirty: false }); setNote('Saved.'); await load();
  });
  const auto = () => editing && run(async () => {
    if (editing.form.fields.length && !window.confirm('Replace the boxes already on this form?')) return;
    const fields = (await pdfWords(blobOf(editing.base64))).flatMap((words, page) => detectFields(words, page));
    if (!fields.length) throw new Error('No place to fill was found (a scanned PDF has no text to read). Place the boxes yourself.');
    setEditing({ ...editing, dirty: true, form: { ...editing.form, fields } });
    setNote(`${fields.length} boxes placed. Check each page, move or delete what is wrong, add what is missing, then Save.`);
  });
  const loadCases = (id: string) => call(`action=pdfform_cases&formId=${id}`).then((result) => setCases(result.cases)).catch((cause: Error) => { setCases([]); onError(cause.message); });
  const goTo = (next: 'fields' | 'send' | 'answers') => {
    setTab(next); setNote('');
    if (next === 'send' && !staff.length) void call('action=employees').then((result) => setStaff((result.employees || []).filter(assignable).sort((a: Staff, b: Staff) => a.fullName.localeCompare(b.fullName)))).catch((cause: Error) => onError(cause.message));
    if (next === 'answers' && editing) void loadCases(editing.id);
  };
  const send = () => editing && run(async () => {
    const result = await call('action=pdfform_send', { id: editing.id, employeeIds: chosen, signers, dueOn: due });
    setChosen([]); setNote(`Sent for ${result.sent} staff.${result.skipped ? ` ${result.skipped} skipped (already waiting, or not active).` : ''}${result.noLogin?.length ? ` These staff cannot sign in to answer: ${result.noLogin.join(', ')}.` : ''}`); await load();
  });
  const view = (id: string) => run(async () => { const data = await call(`action=pdfform_case&id=${id}`); setViewing({ ...data, pages: await pagesOf(data.base64) }); });
  const download = () => viewing && run(async () => { downloadBlob([await filledPdf(viewing.pages, { title: viewing.title, roles: viewing.roles, fields: viewing.fields }, viewing.answers)], `${viewing.title} - ${viewing.name}.pdf`, 'application/pdf'); });
  const hrPart = (submit: boolean) => viewing && run(async () => {
    const mine = Object.fromEntries(viewing.fields.filter((field) => field.who === 'hr').map((field) => [keyOf(field), viewing.answers[keyOf(field)] || '']));
    await call('action=pdfform_hr_part', { id: viewing.id, answers: mine, submit }); setNote(submit ? 'HR part submitted.' : 'HR part saved.'); if (submit) setViewing(null); if (editing) await loadCases(editing.id);
  });
  const change = (action: 'pdfform_return' | 'pdfform_cancel', id: string, role?: string) => editing && run(async () => { await call(`action=${action}`, { id, role }); await loadCases(editing.id); await load(); });

  if (viewing) {
    // HR's turn comes after the staff member has submitted.
    const pending = viewing.parts.find((part) => !part.done), hrOpen = pending?.id === 'hr';
    const waitingNote = !hrOpen && pending && viewing.parts.some((part) => part.id === 'hr' && !part.done) ? `Waiting for ${pending.signer || pending.label} to fill and submit. Your part opens after that.` : '';
    return <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setViewing(null)} className={button}><ArrowLeft className="h-4 w-4" />Back</button><h3 className="mr-auto font-semibold">{viewing.title} · {viewing.name}</h3>
        {hrOpen && <><button type="button" disabled={busy} onClick={() => void hrPart(false)} className={button}>Save HR part</button><button type="button" disabled={busy} onClick={() => void hrPart(true)} className={primary}>Submit HR part</button></>}
        <button type="button" disabled={busy} onClick={() => void download()} className={button}><Download className="h-4 w-4" />Download PDF</button></div>
      {note && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{note}</p>}
      {waitingNote && <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{waitingNote}</p>}
      {hrOpen && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Check what was filled, then tap your own <b className="text-amber-700">yellow</b> boxes and press <b>Submit HR part</b>. If something is wrong, go back and press <b>Send back</b>.</p>}
      <div className="mx-auto max-w-[800px]"><FormFill pages={viewing.pages} form={{ title: viewing.title, roles: viewing.roles, fields: viewing.fields }} who={hrOpen ? 'hr' : ''} answers={viewing.answers} onChange={(answers) => setViewing({ ...viewing, answers })} /></div>
    </div>;
  }
  if (editing) {
    const roles = activeRoles(editing.form).filter((role) => !['staff', 'hr'].includes(role.id));
    const shown = staff.filter((item) => `${item.fullName} ${item.employeeCode} ${item.company} ${item.designation}`.toLowerCase().includes(query.trim().toLowerCase()));
    return <div className="space-y-3">
      <section className={`${card} flex flex-wrap items-center gap-2`}>
        <button type="button" onClick={() => { if (!editing.dirty || window.confirm('Leave without saving the changes?')) { setEditing(null); setNote(''); } }} className={button}><ArrowLeft className="h-4 w-4" />Staff communication</button>
        <input aria-label="Form title" value={editing.form.title} maxLength={120} onChange={(event) => setEditing({ ...editing, dirty: true, form: { ...editing.form, title: event.target.value } })} className="h-10 min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
        <div className="inline-flex rounded-xl bg-slate-200 p-1 text-sm font-semibold">{([['fields', '1. Fields'], ['send', '2. Assign'], ['answers', '3. Answers']] as const).map(([id, label]) => <button key={id} type="button" disabled={id !== 'fields' && (!editing.id || editing.dirty)} title={id !== 'fields' && (!editing.id || editing.dirty) ? 'Save the form first' : ''} onClick={() => goTo(id)} className={`rounded-lg px-3 py-1.5 disabled:opacity-40 ${tab === id ? 'bg-white text-[#0b587b]' : 'text-slate-600'}`}>{label}</button>)}</div>
        <button type="button" disabled={busy || !editing.dirty} onClick={() => void save()} className={primary}>{editing.dirty ? 'Save' : 'Saved'}</button>
      </section>
      {note && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{note}</p>}
      {tab === 'fields' && <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-indigo-50 p-3"><button type="button" disabled={busy} onClick={() => void auto()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><Wand2 className="h-4 w-4" />{busy ? 'Reading…' : 'Place boxes for me'}</button><p className="text-sm text-indigo-900">The system finds the lines, tick boxes, number scales and Ya / Tidak. Check the result before saving.</p></div>}
      {tab === 'fields' && <FormBuilder pages={editing.pages} form={editing.form} onChange={(form) => setEditing((current) => current && { ...current, form, dirty: true })} />}
      {tab === 'send' && <section className={`${card} space-y-4`}>
        {activeRoles(editing.form).some((role) => role.id === 'staff') && <label className="block max-w-md text-sm font-semibold text-slate-600">Who fills the form?<select value={signers.staff || ''} onChange={(event) => setSigners({ ...signers, staff: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3"><option value="">Each staff member ticked below (about themselves)</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.employeeCode}</option>)}</select></label>}
        {roles.map((role) => <label key={role.id} className="block max-w-md text-sm font-semibold text-slate-600">Who fills “{role.label}”?<select value={signers[role.id] || ''} onChange={(event) => setSigners({ ...signers, [role.id]: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3"><option value="">Choose…</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.employeeCode}</option>)}</select></label>)}
        <label className="block max-w-md text-sm font-semibold text-slate-600">Answer by (optional)<input type="date" value={due} onChange={(event) => setDue(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3" /></label>
        <p className="text-sm font-semibold text-slate-600">{signers.staff ? 'Which staff is the form about? Their name and details are filled in.' : 'Assign this form to'}</p>
        <div className="flex flex-wrap items-center gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, branch (KJ, SK) or position" className="h-10 min-w-[240px] flex-1 rounded-xl border border-slate-200 px-3 text-sm" /><button type="button" onClick={() => setChosen([...new Set([...chosen, ...shown.map((item) => item.id)])])} className={button}>Tick all shown ({shown.length})</button><button type="button" onClick={() => setChosen([])} className={button}>Clear</button></div>
        <ul className="max-h-[45vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">{shown.map((item) => <li key={item.id}><label className="flex items-center gap-3 px-3 py-2 text-sm"><input type="checkbox" checked={chosen.includes(item.id)} onChange={(event) => setChosen(event.target.checked ? [...chosen, item.id] : chosen.filter((id) => id !== item.id))} className="h-4 w-4" /><span className="min-w-0 flex-1"><b className="block truncate font-semibold">{item.fullName}</b><span className="text-xs text-slate-500">{item.company} · {item.employeeCode} · {item.designation}{item.status !== 'Active' && item.resignDate ? <b className="text-rose-600"> · left {dmy(item.resignDate)}</b> : null}</span></span></label></li>)}</ul>
        <button type="button" disabled={busy || !chosen.length} onClick={() => void send()} className={primary}><Send className="h-4 w-4" />Assign ({chosen.length} staff)</button>
      </section>}
      {tab === 'answers' && <section className={`${card} space-y-2`}>
        {!cases ? <p className="text-sm text-slate-500">Loading…</p> : !cases.length ? <p className="text-sm text-slate-500">Not assigned to anyone yet.</p> : cases.map((item) => <div key={item.id} className="rounded-xl border border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2"><p className="mr-auto text-sm font-semibold">{item.name} <span className="font-normal text-slate-400">{item.code} · sent {dmy(item.sentAt)}{item.dueOn ? ` · by ${dmy(item.dueOn)}` : ''}</span></p><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.status === 'completed' ? 'Completed' : (() => { const next = item.parts.find((part) => !part.done); return next?.id === 'hr' ? 'For HR to check' : `Waiting for ${next?.id === 'staff' ? 'staff' : next?.label || ''}`; })()}</span><button type="button" disabled={busy} onClick={() => void view(item.id)} className={button}>Open</button><button type="button" disabled={busy} onClick={() => { if (window.confirm(`Cancel this form for ${item.name}?`)) void change('pdfform_cancel', item.id); }} className="h-10 rounded-xl px-3 text-sm font-semibold text-rose-700">Cancel</button></div>
          <ul className="mt-1.5 flex flex-wrap gap-2">{item.parts.map((part) => <li key={part.id} className={`rounded-lg px-2.5 py-1 text-xs ${part.done ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>{part.done ? '✓' : '…'} {part.label}: {part.signer || '—'}{part.done && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Send the part "${part.label}" back to be changed?`)) void change('pdfform_return', item.id, part.id); }} className="ml-2 font-semibold text-[#0b587b] underline">Send back</button>}</li>)}</ul>
        </div>)}
      </section>}
    </div>;
  }
  const tile = 'group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(11,88,123,0.12)]';
  return <section className={`${card} space-y-4`}>
    <div><h3 className="text-xl font-semibold">Staff communication</h3><p className="text-sm text-slate-500">Forms HR asks staff to answer. Open a card to assign it, see the answers and print them. Import a PDF to add a new card.</p></div>
    {notSetUp && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Imported forms are not set up yet. System Admin needs to run the latest database migration first.</p>}
    {busy && <p role="status" className="text-sm font-semibold text-amber-700">Please wait…</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      {children}
      {(forms || []).map((form) => <div key={form.id} className="relative">
        <button type="button" disabled={busy} onClick={() => void openForm(form.id)} className={`${tile} h-full w-full`}>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><FileText className="h-5 w-5" /></span>
          <span className="mt-4 text-base font-semibold">{form.title}</span><span className="mt-1 text-sm text-slate-500">{form.open || form.completed ? `${form.open} waiting · ${form.completed} completed` : 'Not assigned yet'}</span>{Boolean(form.forHr) && <span className="mt-2 self-start rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white">{form.forHr} for HR to check</span>}
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b]">Open<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
        </button>
        <button type="button" aria-label={`Remove ${form.title}`} disabled={busy} onClick={() => { if (window.confirm(`Remove "${form.title}" from this page? Forms already assigned are kept.`)) void run(async () => { await call('action=pdfform_archive', { id: form.id }); await load(); }); }} className="absolute right-3 top-3 rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
      </div>)}
      <label className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-5 text-center text-[#0b587b] hover:bg-slate-50 ${busy || notSetUp ? 'pointer-events-none opacity-50' : ''}`}>
        <Upload className="h-6 w-6" /><span className="text-base font-semibold">Import PDF form</span><span className="text-sm text-slate-500">PDF up to 3 MB. It becomes a new card.</span>
        <input type="file" accept="application/pdf" className="hidden" onChange={(event) => { void importPdf(event.target.files?.[0]); event.target.value = ''; }} />
      </label>
    </div>
    {!forms && <p className="text-sm text-slate-500">Loading your forms…</p>}
  </section>;
}
