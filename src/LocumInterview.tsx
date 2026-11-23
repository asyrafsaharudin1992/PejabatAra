import { useEffect, useState } from 'react';
import { ArrowLeft, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { downloadBlob } from './lib/downloadBlob';
import { dmy, knowledgeText, locumInterviewPdf } from './lib/locumInterviewPdf';

// Locum Medical Officer Interview Assessment. Nobody assigns it: HR (Office HR > Miscellaneous) and Dr Atikah (Individual Sign In) open it when they interview
// a locum doctor, fill it in, save it and print it as a PDF. Both see the same list. `api` talks to the right endpoint for whoever is signed in.
export type Interview = {
  id: string; name: string; mmc: string; phone: string; branch: string; workplace: string; interviewer: string; date: string; timeStart: string; timeEnd: string;
  experience: string; skills: string; strength?: string; weakness?: string; marks: number | null; outOf: number | null; suggestion: string; savedBy: string; updatedAt: string;
};
type Draft = Omit<Interview, 'id' | 'marks' | 'outOf' | 'savedBy' | 'updatedAt'> & { id?: string; marks: string; outOf: string };
const field = 'mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';
const label = 'block text-sm font-semibold text-slate-600';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const blank = (interviewer: string): Draft => ({ name: '', mmc: '', phone: '', branch: '', workplace: '', interviewer, date: today(), timeStart: '', timeEnd: '', experience: '', skills: '', strength: '', weakness: '', marks: '', outOf: '14', suggestion: '' });
const toDraft = (item: Interview): Draft => ({ ...item, marks: item.marks === null ? '' : String(item.marks), outOf: item.outOf === null ? '' : String(item.outOf) });
const toPayload = (draft: Draft) => ({ ...draft, marks: draft.marks.trim() === '' ? null : Number(draft.marks), outOf: draft.outOf.trim() === '' ? null : Number(draft.outOf) });

export default function LocumInterview({ api, interviewer, onError }: { api: (action: string, body?: unknown) => Promise<any>; interviewer: string; onError?: (message: string) => void }) {
  const [problem, setProblem] = useState('');
  const report = (message: string) => { setProblem(message); onError?.(message); };
  const [items, setItems] = useState<Interview[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false), [busy, setBusy] = useState('');
  const load = () => api('locum_interviews').then((data) => setItems(data.items || [])).catch((cause) => { setItems([]); report(cause instanceof Error ? cause.message : 'Unable to load the interviews.'); });
  useEffect(() => { void load(); }, []);
  const set = (key: keyof Draft, value: string) => setDraft((old) => old && { ...old, [key]: value });

  const save = async () => {
    if (!draft) return;
    setSaving(true); report('');
    try { await api('locum_interview_save', toPayload(draft)); setDraft(null); await load(); }
    catch (cause) { report(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setSaving(false);
  };
  const pdf = async (item: Interview | Draft) => {
    const key = 'id' in item && item.id ? item.id : 'draft';
    setBusy(key); report('');
    try {
      const data = 'marks' in item && typeof item.marks === 'string' ? toPayload(item as Draft) : item as Interview;
      downloadBlob([await locumInterviewPdf(data)], `Locum interview - ${data.name || 'doctor'}${data.date ? ` ${data.date}` : ''}.pdf`, 'application/pdf');
    } catch (cause) { report(cause instanceof Error ? cause.message : 'Unable to make the PDF.'); }
    setBusy('');
  };
  const remove = async (item: Interview) => {
    if (!window.confirm(`Delete the interview of ${item.name}?`)) return;
    try { await api('locum_interview_delete', { id: item.id }); await load(); } catch (cause) { report(cause instanceof Error ? cause.message : 'Unable to delete.'); }
  };

  const alert = problem ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{problem}</p> : null;
  if (draft) {
    const percent = knowledgeText({ marks: draft.marks.trim() === '' ? null : Number(draft.marks), outOf: draft.outOf.trim() === '' ? null : Number(draft.outOf) });
    return <div className="space-y-4">
      {alert}
      <button type="button" onClick={() => setDraft(null)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b587b] hover:underline"><ArrowLeft className="h-4 w-4" />Locum interviews</button>
      <div><h3 className="text-xl font-semibold text-[#14233b]">Locum Medical Officer Interview Assessment</h3><p className="text-sm text-slate-500">Klinik Ara 24 Jam · HSO Healthcare Sdn. Bhd.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Name<input value={draft.name} onChange={(e) => set('name', e.target.value)} className={field} autoComplete="off" /></label>
        <label className={label}>Interviewer<input value={draft.interviewer} onChange={(e) => set('interviewer', e.target.value)} className={field} /></label>
        <label className={label}>MMC no.<input value={draft.mmc} onChange={(e) => set('mmc', e.target.value)} className={field} inputMode="numeric" autoComplete="off" /></label>
        <label className={label}>Phone<input value={draft.phone} onChange={(e) => set('phone', e.target.value)} className={field} inputMode="tel" autoComplete="off" /></label>
        <label className={label}>Branch<input value={draft.branch} onChange={(e) => set('branch', e.target.value)} className={field} placeholder="e.g. SK or KJ" /></label>
        <label className={label}>Date<input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} className={field} /></label>
        <label className={label}>Time (start)<input type="time" value={draft.timeStart} onChange={(e) => set('timeStart', e.target.value)} className={field} /></label>
        <label className={label}>Time (end)<input type="time" value={draft.timeEnd} onChange={(e) => set('timeEnd', e.target.value)} className={field} /></label>
      </div>
      <label className={label}>Current workplace / dept<textarea rows={2} value={draft.workplace} onChange={(e) => set('workplace', e.target.value)} className={field} /></label>
      <label className={label}>Working experience<textarea rows={4} value={draft.experience} onChange={(e) => set('experience', e.target.value)} className={field} /></label>
      <label className={label}>Procedure / Skills<textarea rows={4} value={draft.skills} onChange={(e) => set('skills', e.target.value)} className={field} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Strength<textarea rows={3} value={draft.strength ?? ''} onChange={(e) => set('strength', e.target.value)} className={field} /></label>
        <label className={label}>Weakness<textarea rows={3} value={draft.weakness ?? ''} onChange={(e) => set('weakness', e.target.value)} className={field} /></label>
      </div>
      <label className={label}>Suggestion<textarea rows={3} value={draft.suggestion} onChange={(e) => set('suggestion', e.target.value)} className={field} /></label>
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>Knowledge marks<input value={draft.marks} onChange={(e) => set('marks', e.target.value)} className={`${field} w-28`} inputMode="decimal" /></label>
        <label className={label}>Out of<input value={draft.outOf} onChange={(e) => set('outOf', e.target.value)} className={`${field} w-28`} inputMode="decimal" /></label>
        <p className="pb-3 text-sm font-semibold text-[#6e8000]">{percent ? `Knowledge Markah: ${percent}` : ''}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => void pdf(draft)} disabled={!draft.name.trim() || busy === 'draft'} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0b587b] disabled:opacity-50"><Download className="h-4 w-4" />PDF</button>
        <button type="button" onClick={() => void save()} disabled={saving} className="min-h-11 rounded-xl bg-[#0b587b] px-5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>;
  }

  return <div className="space-y-4">
    {alert}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-xl font-semibold text-[#14233b]">Locum interviews</h3><p className="text-sm text-slate-500">Open a new form when you interview a locum doctor. HR and Dr Atikah see the same list.</p></div>
      <button type="button" onClick={() => setDraft(blank(interviewer))} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0b587b] px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />New interview</button>
    </div>
    {items === null ? <p role="status" className="text-sm text-slate-500">Loading…</p> : items.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No interviews yet.</p> :
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">{items.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 p-3.5">
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#14233b]">{item.name}{item.mmc ? <span className="font-normal text-slate-500"> · MMC {item.mmc}</span> : null}</p>
          <p className="text-xs text-slate-500">{dmy(item.date) || 'No date'}{item.branch ? ` · ${item.branch}` : ''}{item.interviewer ? ` · ${item.interviewer}` : ''}{knowledgeText(item) ? ` · ${knowledgeText(item)}` : ''}</p></div>
        <button type="button" aria-label={`Download the PDF of ${item.name}`} onClick={() => void pdf(item)} disabled={busy === item.id} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-[#0b587b] disabled:opacity-50"><Download className="h-4 w-4" /></button>
        <button type="button" aria-label={`Edit the interview of ${item.name}`} onClick={() => setDraft(toDraft(item))} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600"><Pencil className="h-4 w-4" /></button>
        <button type="button" aria-label={`Delete the interview of ${item.name}`} onClick={() => void remove(item)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-rose-600"><Trash2 className="h-4 w-4" /></button>
      </li>)}</ul>}
  </div>;
}
