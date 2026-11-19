import { useEffect, useState } from 'react';
import { Eye, Pencil, Printer, X } from 'lucide-react';
import { card } from './AssessmentStaff';
import { ASSISTANT_ITEMS, ASSISTANT_OUTCOMES } from './lib/assistantReview';
import { AREAS, LEVELS, ReviewFull, reviewApi } from './lib/performanceReview';
import { applyFormText, changesOnly, cleanFormText, currentFormText, formName, useFormText, type FormText } from './lib/reviewFormText';
import { ReviewDocument, ReviewSheet, useReviewPrint } from './ReviewSheet';
import { ReportPreviewFrame } from './ReportPreviewFrame';
import { templateMax, type ReviewTemplate } from './lib/reviewTemplate';

// Office HR: the two review forms as blank samples, to see what the supervisor fills in and to print an empty copy.
const blank = (formType: 'standard' | 'assistant' | 'custom', template: ReviewTemplate | null = null): ReviewFull => ({ formType, template, id: '', status: 'pending', staffName: '', employeeCode: '', position: '', department: '', assessorName: '', periodLabel: '', periodStart: null, periodEnd: null, assignRemarks: '', totalScore: null, overall: '', pip: 'not_required', hrReceivedOn: null, createdAt: '', submittedAt: null, ratings: {}, assistant: undefined, improvement: '', training: '', employeeComments: '', pipRemarks: '', pipStart: null, hodName: '', hrReceivedBy: '', hrRemarks: '' } as unknown as ReviewFull);

// HR edits the words of a fixed form here: its name and its points (Review 1: the four areas and their points; Review 2: the name and points of each of the 19 items).
// Marks, weights and the number of items stay as they are. Reviews already filled keep their marks and show the new words.
function FormTextEditor({ kind, onClose, onSaved }: { key?: string; kind: 'standard' | 'assistant'; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(formName(kind));
  const [areas, setAreas] = useState(() => AREAS.map((area) => ({ key: String(area.key), label: String(area.label), criteria: [...area.criteria] as string[] })));
  const [items, setItems] = useState(() => ASSISTANT_ITEMS.map((item) => ({ name: item.name, lines: item.note.split(' · ').join('\n') })));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0b587b]';
  const save = async (reset: boolean) => {
    setBusy(true); setError('');
    try {
      const before: FormText = currentFormText();
      const next: FormText = { names: { ...before.names }, areas: before.areas, items: before.items };
      if (reset) { delete next.names![kind]; if (kind === 'standard') next.areas = undefined; else next.items = undefined; }
      else {
        if (!name.trim()) throw new Error('Write the name of the form.');
        next.names![kind] = name.trim();
        if (kind === 'standard') next.areas = Object.fromEntries(areas.map((area) => [area.key, { label: area.label, criteria: area.criteria }]));
        else next.items = items.map((item) => ({ name: item.name, note: item.lines.split('\n').map((point) => point.trim()).filter(Boolean).join(' · ') }));
      }
      const result = await reviewApi('action=hr_form_text_save', { text: changesOnly(next) });
      applyFormText(cleanFormText(result.text)); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setBusy(false);
  };
  return <div className="space-y-4 rounded-2xl border border-[#0b587b]/25 bg-sky-50/40 p-4">
    <div className="flex flex-wrap items-center gap-2"><h4 className="mr-auto font-semibold">Edit {kind === 'standard' ? 'Review 1' : 'Review 2'}</h4><button type="button" onClick={onClose} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600">Cancel</button><button type="button" disabled={busy} onClick={() => void save(true)} className="h-9 rounded-xl border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 disabled:opacity-50">Reset to original</button><button type="button" disabled={busy} onClick={() => void save(false)} className="h-9 rounded-xl bg-[#0b587b] px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button></div>
    <p className="text-xs text-slate-500">You change the words only. The marks, the weights and the number of items stay the same, and reviews already filled keep their marks and show the new words.</p>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <label className="block text-sm font-semibold text-slate-700">Name of the form<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className={`${field} mt-1`} /></label>
    {kind === 'standard' ? areas.map((area, index) => <div key={area.key} className="space-y-2 rounded-xl bg-white p-3"><label className="block text-sm font-semibold text-slate-700">Area {index + 1} <span className="text-xs font-normal text-slate-400">· {AREAS[index].weight}% of the total</span><input value={area.label} maxLength={60} onChange={(event) => setAreas(areas.map((row, at) => at === index ? { ...row, label: event.target.value } : row))} className={`${field} mt-1`} /></label>
      {area.criteria.map((point, at) => <input key={at} aria-label={`${area.label} point ${at + 1}`} value={point} maxLength={220} onChange={(event) => setAreas(areas.map((row, i) => i === index ? { ...row, criteria: row.criteria.map((value, j) => j === at ? event.target.value : value) } : row))} className={field} />)}</div>)
      : items.map((item, index) => <div key={index} className="space-y-2 rounded-xl bg-white p-3"><label className="block text-sm font-semibold text-slate-700">Item {index + 1} <span className="text-xs font-normal text-slate-400">· out of {ASSISTANT_ITEMS[index].max}</span><input value={item.name} maxLength={160} onChange={(event) => setItems(items.map((row, at) => at === index ? { ...row, name: event.target.value } : row))} className={`${field} mt-1`} /></label>
        <label className="block text-xs font-semibold text-slate-500">Points (one on each line)<textarea value={item.lines} rows={Math.min(8, Math.max(2, item.lines.split('\n').length))} onChange={(event) => setItems(items.map((row, at) => at === index ? { ...row, lines: event.target.value } : row))} className={`${field} mt-1 font-normal`} /></label></div>)}
    {kind === 'standard' && <p className="text-xs text-slate-400">Original wording stays available: Reset to original brings it back.</p>}
  </div>;
}

export function HRReviewSamples({ templates = [], onEditTemplate }: { templates?: ReviewTemplate[]; onEditTemplate?: (id: string) => void }) {
  useFormText();
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [, setVersion] = useState(0);
  const [which, setWhich] = useState<string>('standard');
  const template = which.startsWith('t:') ? templates.find((item) => `t:${item.id}` === which) || null : null;
  const [printing, setPrinting] = useState(false);
  useEffect(() => { setEditing(false); }, [which]);
  useReviewPrint(printing, template ? `${template.name} (sample)` : which === 'standard' ? `Review 1 - ${formName('standard')} (sample)` : `Review 2 - ${formName('assistant')} (sample)`, () => setPrinting(false));
  const total = ASSISTANT_ITEMS.reduce((sum, item) => sum + item.max, 0);
  return <section className={`${card} space-y-5`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-lg font-semibold">Review samples</h3><p className="text-sm text-slate-500">What the supervisor sees and fills in. Review 1 is assigned by HR; Review 2 is started by the Admin Klinikal.</p></div>
      <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => template ? onEditTemplate?.(template.id) : setEditing(!editing)} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4c6a]"><Pencil className="h-4 w-4" />Edit this form</button>
      <button type="button" onClick={() => setPreviewing(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#0b587b] hover:bg-slate-50"><Eye className="h-4 w-4" />Preview form</button>
      <button onClick={() => setPrinting(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#0b587b] hover:bg-slate-50"><Printer className="h-4 w-4" />Print blank form</button></div>
    </div>
    <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">{([['standard', `Review 1 · ${formName('standard')}`], ['assistant', `Review 2 · ${formName('assistant')}`]] as const).map(([key, text]) => <button key={key} onClick={() => setWhich(key)} className={`rounded-lg px-4 py-2 ${which === key ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500'}`}>{text}</button>)}{templates.map((item) => <button key={item.id} onClick={() => setWhich(`t:${item.id}`)} className={`rounded-lg px-3 py-2 ${which === `t:${item.id}` ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500'}`}>{item.name}</button>)}</div>
    {editing && !template && <FormTextEditor key={which} kind={which === 'assistant' ? 'assistant' : 'standard'} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setVersion((n) => n + 1); }} />}
    {template ? <div className="space-y-5">
      <p className="text-sm text-slate-600">{template.subject === 'candidate' ? 'For a candidate (interview form). ' : ''}{template.description ? `${template.description} ` : ''}{template.items.length} items marked out of {templateMax(template.items)}{template.outcomes.length ? ', then a result to choose' : ''}, the assessor's comments and digital signature. Assigned by HR to a supervisor.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="py-2 pr-3 font-semibold">No</th><th className="py-2 pr-3 font-semibold">Item</th><th className="py-2 pr-3 font-semibold">What to look for</th><th className="py-2 text-right font-semibold">Full mark</th></tr></thead>
        <tbody>{template.items.map((item, index) => <tr key={`${index}-${item.name}`} className="border-b border-slate-50"><td className="py-2 pr-3 text-slate-400">{index + 1}</td><td className="py-2 pr-3 font-medium">{item.name}</td><td className="py-2 pr-3 text-slate-600">{item.points.join(' · ')}{item.options?.length ? <ul className="mt-1 space-y-0.5 text-xs">{item.options.map((option, at) => <li key={at}>☐ {option.label} <strong className="text-slate-700">({option.score})</strong></li>)}</ul> : null}</td><td className="py-2 text-right tabular-nums font-semibold">{item.max}</td></tr>)}</tbody></table></div>
      {(template.grades || []).length > 0 && <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold">Grades</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{[...template.grades!].sort((x, y) => y.min - x.min).map((grade) => <li key={grade.label}>{grade.min} and above: {grade.label}</li>)}</ul></div>}
      {template.outcomes.length > 0 && <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold">Result</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{template.outcomes.map((option) => <li key={option}>{option}</li>)}</ul></div>}
    </div> : which === 'standard' ? <div className="space-y-5">
      <p className="text-sm text-slate-600">Four areas, each with four points rated 1 to 4. An area scores the average of its points, and the total weighs the areas by the percentage shown. Assigned by HR to a supervisor; includes comments, a Performance Improvement Plan and a part for HR.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{LEVELS.map((level) => <div key={level.value} className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${level.dot}`} /><span><strong>{level.value} · {level.label}</strong><br />{level.range}</span></div>)}</div>
      {AREAS.map((area) => <div key={area.key}><p className="text-sm font-semibold">{area.label} <span className="text-xs font-normal text-slate-400">{area.weight}%</span></p><ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-slate-600">{area.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></div>)}
    </div> : <div className="space-y-5">
      <p className="text-sm text-slate-600">19 items marked out of {total}, a result for a contract locum or a permanent staff member on probation, then the assessor's name and digital signature. Started by the Admin Klinikal of the branch.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="py-2 pr-3 font-semibold">Bil</th><th className="py-2 pr-3 font-semibold">Elemen penilaian</th><th className="py-2 pr-3 font-semibold">Penerangan</th><th className="py-2 text-right font-semibold">Markah penuh</th></tr></thead>
        <tbody>{ASSISTANT_ITEMS.map((item, index) => <tr key={item.name} className="border-b border-slate-50"><td className="py-2 pr-3 text-slate-400">{index + 1}</td><td className="py-2 pr-3 font-medium">{item.name}</td><td className="py-2 pr-3 text-slate-600">{item.points.join(' · ')}</td><td className="py-2 text-right font-semibold">{item.max}</td></tr>)}<tr><td colSpan={3} className="py-2 pr-3 text-right font-semibold">Jumlah</td><td className="py-2 text-right font-semibold">{total}</td></tr></tbody></table></div>
      <div className="grid gap-4 sm:grid-cols-2">{([['Prestasi lokum kontrak', 'locum'], ['Prestasi pekerja tetap percubaan', 'probation']] as const).map(([title, kind]) => <div key={kind} className="rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold">{title}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{ASSISTANT_OUTCOMES[kind].map((option) => <li key={option.value}>{option.label}{option.terms ? ` (${option.terms.join(' / ')}${option.customUnit ? ` / ___ ${option.customUnit}` : ''})` : ''}{option.dateOnly ? ' pada (pilih tarikh)' : ''}</li>)}</ul></div>)}</div>
    </div>}
    {previewing && <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-2 sm:p-6 print:hidden" onClick={() => setPreviewing(false)}>
      <div role="dialog" aria-label="Form preview" onClick={(event) => event.stopPropagation()} className="mx-auto flex h-full w-full max-w-[1000px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"><h3 className="mr-auto font-semibold">Preview <span className="text-xs font-normal text-slate-400">· the blank form as printed (with the wording as it is now)</span></h3>
          <button type="button" onClick={() => { setPreviewing(false); setPrinting(true); }} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0b587b] px-3 text-sm font-bold text-white"><Printer className="h-4 w-4" />Print</button>
          <button type="button" onClick={() => setPreviewing(false)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200"><X className="h-4 w-4" /></button></div>
        <div className="report-preview flex-1 overflow-auto bg-slate-100 p-3 sm:p-5"><ReportPreviewFrame portrait><ReviewDocument review={template ? blank('custom', template) : blank(which === 'assistant' ? 'assistant' : 'standard')} /></ReportPreviewFrame></div>
      </div>
    </div>}
    {printing && <ReviewSheet review={template ? blank('custom', template) : blank(which === 'assistant' ? 'assistant' : 'standard')} />}
  </section>;
}
