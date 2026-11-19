import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2, ArrowDown, ArrowUp, Upload, X } from 'lucide-react';
import { card } from './AssessmentStaff';
import { reviewApi } from './lib/performanceReview';
import { isChoice, templateMax, validateTemplate, type ReviewTemplate } from './lib/reviewTemplate';

// Office HR: the review templates HR makes itself. A template is a list of items. An item is either marked (the supervisor types a mark up to a full mark)
// or "choose one" (a few choices, each with its own score, like an interview rubric). It can have results to choose from (e.g. Ambil / Tolak / KIV), a table of
// grades for the total, and can be for a candidate instead of a staff member. Once saved it can be assigned, it shows in Review samples, and it prints with the clinic letterhead.
const field = 'w-full rounded-xl border border-[#dce4ed] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';
const label = 'block text-sm font-semibold text-slate-600';
const num = (value: number) => String(Math.round(value * 100) / 100);

type DraftItem = { kind: 'marks' | 'choice'; name: string; points: string; max: string; options: { label: string; score: string }[] };
type Draft = { id?: string; name: string; description: string; subject: 'staff' | 'candidate'; items: DraftItem[]; outcomes: string; grades: { min: string; label: string }[] };
const blankItem = (): DraftItem => ({ kind: 'marks', name: '', points: '', max: '5', options: [] });
const blankOptions = () => [{ label: '', score: '1' }, { label: '', score: '2' }];
const blank = (): Draft => ({ name: '', description: '', subject: 'staff', items: [blankItem()], outcomes: '', grades: [] });
const toDraft = (template: ReviewTemplate): Draft => ({
  id: template.id, name: template.name, description: template.description, subject: template.subject === 'candidate' ? 'candidate' : 'staff', outcomes: template.outcomes.join('\n'),
  items: template.items.map((item) => isChoice(item) ? { kind: 'choice', name: item.name, points: item.points.join('\n'), max: String(item.max), options: item.options!.map((option) => ({ label: option.label, score: String(option.score) })) } : { kind: 'marks', name: item.name, points: item.points.join('\n'), max: String(item.max), options: [] }),
  grades: (template.grades || []).map((grade) => ({ min: String(grade.min), label: grade.label })),
});
const toPayload = (draft: Draft) => ({
  id: draft.id, name: draft.name, description: draft.description, subject: draft.subject, outcomes: draft.outcomes.split('\n'),
  items: draft.items.map((item) => item.kind === 'choice' ? { name: item.name, points: item.points.split('\n'), options: item.options.map((option) => ({ label: option.label, score: Number(option.score) })) } : { name: item.name, points: item.points.split('\n'), max: Number(item.max) }),
  grades: draft.grades.map((grade) => ({ min: Number(grade.min), label: grade.label })),
});
const draftTotal = (draft: Draft) => draft.items.reduce((sum, item) => sum + (item.kind === 'choice' ? Math.max(0, ...item.options.map((option) => Number(option.score) || 0)) : Number(item.max) || 0), 0);

export function HRReviewTemplates({ templates, onReload, onError, openId = '', onOpened }: { templates: ReviewTemplate[] | null; onReload: () => Promise<void>; onError: (message: string) => void; openId?: string; onOpened?: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  // Asked to open one template (Edit this form in Review samples): its editor opens as soon as the list is read.
  useEffect(() => { if (!openId || !templates) return; const found = templates.find((item) => item.id === openId); if (found) setDraft(toDraft(found)); onOpened?.(); }, [openId, templates]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState('');
  const [importInfo, setImportInfo] = useState<{ file: string; notes: string[] } | null>(null);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); } }, [notice]);

  const setItem = (index: number, change: Partial<DraftItem>) => setDraft((current) => current && { ...current, items: current.items.map((row, at) => at === index ? { ...row, ...change } : row) });
  const setOption = (index: number, at: number, change: Partial<{ label: string; score: string }>) => setDraft((current) => current && { ...current, items: current.items.map((row, i) => i === index ? { ...row, options: row.options.map((option, o) => o === at ? { ...option, ...change } : option) } : row) });
  const move = (index: number, by: number) => setDraft((current) => { if (!current) return current; const items = [...current.items]; const target = index + by; if (target < 0 || target >= items.length) return current; [items[index], items[target]] = [items[target], items[index]]; return { ...current, items }; });
  const close = () => { setDraft(null); setProblem(''); setImportInfo(null); };

  // A form HR already has (Excel, CSV, Word or a PDF with real text) is read in the browser into a draft; HR checks it in the editor before saving.
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true); setNotice(''); setProblem('');
    try {
      const { importTemplateFile } = await import('./lib/templateFiles');
      const result = await importTemplateFile(file);
      setDraft({ ...blank(), name: result.name, items: result.items.map((item) => ({ kind: 'marks' as const, name: item.name, points: item.points.join('\n'), max: String(item.max), options: [] })) });
      setImportInfo({ file: file.name, notes: result.notes });
      window.scrollTo({ top: 0 });
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to read that file.'); }
    setImporting(false);
  };
  const save = async () => {
    if (!draft) return;
    setProblem('');
    try { validateTemplate(toPayload(draft)); } catch (cause) { setProblem(cause instanceof Error ? cause.message : 'Check the template.'); return; }
    setBusy(true);
    try { await reviewApi('action=hr_template_save', { template: toPayload(draft) }); setNotice(`Template "${draft.name.trim()}" saved.`); close(); await onReload(); }
    catch (cause) { setProblem(cause instanceof Error ? cause.message : 'Unable to save the template.'); }
    setBusy(false);
  };
  const remove = async (template: ReviewTemplate) => {
    setBusy(true);
    try { await reviewApi('action=hr_template_delete', { id: template.id }); setDeleting(''); setNotice(`"${template.name}" deleted. Reviews already given keep their copy.`); await onReload(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to delete the template.'); }
    setBusy(false);
  };
  const archive = async (template: ReviewTemplate, archived: boolean) => {
    setBusy(true);
    try { await reviewApi('action=hr_template_archive', { id: template.id, archived }); setNotice(archived ? `"${template.name}" archived. Reviews already given keep it.` : `"${template.name}" is available again.`); await onReload(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to change the template.'); }
    setBusy(false);
  };

  if (draft) {
    const total = draftTotal(draft);
    return <section className={`${card} space-y-5`}>
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{draft.id ? 'Edit template' : 'Add template'}</h3><p className="text-sm text-slate-500">Reviews already assigned keep the version they were given. Changes apply to reviews assigned from now on.</p></div><button type="button" onClick={close} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Cancel</button></div>
      {importInfo && <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Imported from {importInfo.file}: {draft.items.length} items, {num(total)} marks.</p><p className="mt-1">This is a draft read from the file. Check every item name, description and full mark against the form, then save. Results to choose from are not imported; add them below if the form has them.</p>{importInfo.notes.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5">{importInfo.notes.map((note) => <li key={note}>{note}</li>)}</ul>}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>Template name<input value={draft.name} maxLength={120} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Monthly Assessment - Dispensary Assistant" className={`${field} mt-1.5`} /></label>
        <label className={`${label} sm:col-span-2`}>Short description (optional)<input value={draft.description} maxLength={400} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Shown to the supervisor under the title" className={`${field} mt-1.5`} /></label>
        <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-slate-600">Who is assessed</legend><div className="mt-1.5 flex flex-wrap gap-2">{([['staff', 'A staff member'], ['candidate', 'A candidate (interview form)']] as const).map(([value, text]) => <label key={value} className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold ${draft.subject === value ? 'border-[#0b587b] bg-sky-50 text-[#0b587b]' : 'border-slate-200 text-slate-600'}`}><input type="radio" name="subject" checked={draft.subject === value} onChange={() => setDraft({ ...draft, subject: value })} className="h-4 w-4" />{text}</label>)}</div></fieldset>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="text-sm font-semibold">Items</h4><p className="text-xs text-slate-500">Total {num(total)} marks · {draft.items.length} items</p></div>
        <ul className="mt-2 space-y-3">{draft.items.map((item, index) => <li key={index} className="rounded-2xl bg-slate-50 p-3">
          <div className="flex items-start gap-2">
            <span className="w-6 shrink-0 pt-2.5 text-sm font-semibold text-slate-400">{index + 1}</span>
            <div className="grid min-w-0 flex-1 gap-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_190px]">
                <input value={item.name} maxLength={200} onChange={(event) => setItem(index, { name: event.target.value })} placeholder="Item name" aria-label={`Item ${index + 1} name`} className={field} />
                <select value={item.kind} onChange={(event) => { const kind = event.target.value as 'marks' | 'choice'; setItem(index, { kind, options: kind === 'choice' && !item.options.length ? blankOptions() : item.options }); }} aria-label={`Item ${index + 1} type`} className={field}><option value="marks">Type a mark</option><option value="choice">Choose one answer</option></select>
              </div>
              {item.kind === 'marks'
                ? <label className="flex items-center gap-2 text-sm text-slate-600"><span className="shrink-0">Full mark</span><input type="number" min={0.5} max={100} step={0.5} value={item.max} onChange={(event) => setItem(index, { max: event.target.value })} aria-label={`Item ${index + 1} full mark`} className={`${field} !w-24 !px-2 text-center`} /></label>
                : <div className="space-y-2"><p className="text-xs text-slate-500">The supervisor picks one. Each choice has its own score.</p>
                  {item.options.map((option, at) => <div key={at} className="flex items-start gap-2"><textarea rows={2} value={option.label} maxLength={300} onChange={(event) => setOption(index, at, { label: event.target.value })} placeholder={`Choice ${at + 1} text`} aria-label={`Item ${index + 1} choice ${at + 1} text`} className={`${field} min-w-0 flex-1`} /><label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">Score<input type="number" min={0} max={100} step={0.5} value={option.score} onChange={(event) => setOption(index, at, { score: event.target.value })} aria-label={`Item ${index + 1} choice ${at + 1} score`} className={`${field} !w-20 !px-2 text-center`} /></label><button type="button" onClick={() => setItem(index, { options: item.options.filter((_, o) => o !== at) })} disabled={item.options.length <= 2} aria-label="Remove choice" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-30"><X className="h-4 w-4" /></button></div>)}
                  <button type="button" onClick={() => setItem(index, { options: [...item.options, { label: '', score: '' }] })} disabled={item.options.length >= 8} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b587b] hover:underline disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Add choice</button></div>}
              <textarea rows={2} value={item.points} onChange={(event) => setItem(index, { points: event.target.value })} placeholder="What to look for, one point per line (optional)" aria-label={`Item ${index + 1} description`} className={field} />
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-white disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === draft.items.length - 1} aria-label="Move down" className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-white disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, at) => at !== index) })} disabled={draft.items.length === 1} aria-label="Remove item" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        </li>)}</ul>
        <button type="button" onClick={() => setDraft({ ...draft, items: [...draft.items, blankItem()] })} disabled={draft.items.length >= 60} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><Plus className="h-4 w-4" />Add item</button>
      </div>
      <label className={label}>Results to choose from (optional, one per line)<textarea rows={3} value={draft.outcomes} onChange={(event) => setDraft({ ...draft, outcomes: event.target.value })} placeholder={'e.g.\nAmbil\nTolak\nKIV'} className={`${field} mt-1.5`} /><span className="mt-1 block text-xs font-normal text-slate-400">If you add results, the supervisor must choose one. Leave empty if the review only needs marks and comments.</span></label>
      <div>
        <h4 className="text-sm font-semibold">Grades for the total score (optional)</h4>
        <p className="text-xs text-slate-500">The grade is shown from the total, e.g. 45 and above is Gred AA.</p>
        <ul className="mt-2 space-y-2">{draft.grades.map((grade, index) => <li key={index} className="flex items-center gap-2"><label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">From<input type="number" min={0} step={0.5} value={grade.min} onChange={(event) => setDraft({ ...draft, grades: draft.grades.map((row, at) => at === index ? { ...row, min: event.target.value } : row) })} aria-label={`Grade ${index + 1} minimum score`} className={`${field} !w-24 !px-2 text-center`} /></label><input value={grade.label} maxLength={120} onChange={(event) => setDraft({ ...draft, grades: draft.grades.map((row, at) => at === index ? { ...row, label: event.target.value } : row) })} placeholder="e.g. Gred AA (RM2,000.00)" aria-label={`Grade ${index + 1} name`} className={`${field} min-w-0 flex-1`} /><button type="button" onClick={() => setDraft({ ...draft, grades: draft.grades.filter((_, at) => at !== index) })} aria-label="Remove grade" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-rose-600"><X className="h-4 w-4" /></button></li>)}</ul>
        <button type="button" onClick={() => setDraft({ ...draft, grades: [...draft.grades, { min: '', label: '' }] })} disabled={draft.grades.length >= 12} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0b587b] hover:underline disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Add grade</button>
      </div>
      {problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{problem}</p>}
      <div className="flex justify-end gap-3"><button type="button" onClick={close} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button><button type="button" onClick={() => void save()} disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a4c6a] disabled:opacity-50">{busy ? 'Saving…' : 'Save template'}</button></div>
    </section>;
  }

  const active = (templates || []).filter((template) => !template.archived);
  const archived = (templates || []).filter((template) => template.archived);
  const row = (template: ReviewTemplate) => <li key={template.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-3.5">
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#14233b]">{template.name}{template.subject === 'candidate' && <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">Candidate</span>}</p><p className="text-xs text-slate-500">{template.items.length} items · {num(templateMax(template.items))} marks{template.items.some(isChoice) ? ' · has choose-one items' : ''}{template.outcomes.length ? ` · ${template.outcomes.length} results` : ''}{template.description ? ` · ${template.description}` : ''}</p></div>
    {deleting === template.id
      ? <><span className="text-xs font-semibold text-rose-700">Delete for good? Reviews already given keep their copy.</span><button type="button" disabled={busy} onClick={() => void remove(template)} className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-40">{busy ? 'Deleting…' : 'Yes, delete'}</button><button type="button" disabled={busy} onClick={() => setDeleting('')} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white">Cancel</button></>
      : template.archived
      ? <><button type="button" disabled={busy} onClick={() => void archive(template, false)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50 disabled:opacity-40"><ArchiveRestore className="h-4 w-4" />Restore</button><button type="button" disabled={busy} onClick={() => setDeleting(template.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"><Trash2 className="h-4 w-4" />Delete</button></>
      : <><button type="button" onClick={() => { setDraft(toDraft(template)); setProblem(''); window.scrollTo({ top: 0 }); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0b587b] hover:bg-slate-50"><Pencil className="h-4 w-4" />Edit</button><button type="button" disabled={busy} onClick={() => void archive(template, true)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Archive className="h-4 w-4" />Archive</button><button type="button" disabled={busy} onClick={() => setDeleting(template.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"><Trash2 className="h-4 w-4" />Delete</button></>}
  </li>;
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">Review templates</h3><p className="text-sm text-slate-500">Make your own review form. It can then be assigned to a supervisor, and it appears in Review samples to print blank.</p></div>
      <div className="flex flex-wrap gap-2"><label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-[#0b587b] hover:bg-slate-50 ${importing ? 'pointer-events-none opacity-50' : ''}`} title="Make a template from a form you already have: Excel, CSV, Word or a PDF with real text"><Upload className="h-4 w-4" />{importing ? 'Reading…' : 'Import template'}<input type="file" accept=".xlsx,.csv,.txt,.docx,.pdf,application/pdf" disabled={importing} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void importFile(file); }} className="hidden" /></label><button type="button" onClick={() => { setDraft(blank()); setProblem(''); setImportInfo(null); }} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a4c6a]"><Plus className="h-4 w-4" />Add template</button></div></div>
    {notice && <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">{notice}</p>}
    {templates === null ? <p className="text-sm text-slate-500">Loading…</p> : !active.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No templates yet. Press Add template to make the first one.</p> : <ul className="space-y-2">{active.map(row)}</ul>}
    {archived.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold text-slate-500">Archived ({archived.length})</summary><ul className="mt-2 space-y-2">{archived.map(row)}</ul></details>}
  </section>;
}
