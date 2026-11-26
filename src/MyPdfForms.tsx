import { useEffect, useState } from 'react';
import { assessmentFetch } from './AssessmentRoom';
import { FormFill } from './pdfForm/FormFill';
import { pagesOf } from './pdfForm/loadPdf';
import { keyOf, missing, type Answers, type Field, type Role } from './pdfForm/model';

// Individual Sign In > Announcements: the forms waiting for this person (their own, or a part they sign for someone else).
type Task = { id: string; title: string; role: string; roleLabel: string; about: string; dueOn: string | null };
type Open = { id: string; title: string; role: string; roles: Role[]; fields: Field[]; answers: Answers; pages: string[] };

export default function MyPdfForms({ onSubmitted }: { onSubmitted: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [open, setOpen] = useState<Open | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const load = () => assessmentFetch('action=pdfform_mine').then((result: { tasks: Task[] }) => setTasks(result.tasks)).catch(() => setTasks([]));
  useEffect(() => { void load(); }, []);
  const show = async (task: Task) => {
    setBusy('open'); setNote('');
    try { const data = await assessmentFetch(`action=pdfform_open&id=${task.id}&role=${task.role}`); setAnswers(data.answers || {}); setOpen({ ...data, pages: await pagesOf(data.base64) }); }
    catch (cause) { setNote(cause instanceof Error ? cause.message : 'Unable to open the form.'); }
    setBusy('');
  };
  const save = async (submit: boolean) => {
    if (!open) return;
    setBusy(submit ? 'submit' : 'draft'); setNote('');
    try {
      const mine = Object.fromEntries(open.fields.filter((field) => field.who === open.role).map((field) => [keyOf(field), answers[keyOf(field)] || '']));
      await assessmentFetch('action=pdfform_part', { method: 'POST', body: JSON.stringify({ id: open.id, role: open.role, answers: mine, submit }) });
      if (submit) { setOpen(null); setNote('Thank you. The form was sent.'); await load(); onSubmitted(); } else setNote('Saved. You can finish it later.');
    } catch (cause) { setNote(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setBusy('');
  };
  if (open) {
    const left = missing({ title: open.title, roles: open.roles, fields: open.fields.filter((field) => field.source !== 'today') }, open.role, answers).length;
    return <div className="fixed inset-0 z-40 overflow-y-auto bg-[#f5f5f7] p-3">
      <div className="mx-auto max-w-[800px] space-y-3 pb-28">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{open.title}</h2><button type="button" onClick={() => { setOpen(null); setNote(''); }} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">Close</button></div>
        <p className="text-sm text-slate-600">Fill the <b className="text-amber-700">yellow</b> boxes. You can pinch to make the page bigger.</p>
        <FormFill pages={open.pages} form={{ title: open.title, roles: open.roles, fields: open.fields }} who={open.role} answers={answers} onChange={setAnswers} />
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3">
        <div className="mx-auto max-w-[800px] space-y-1.5">
          {note && <p role="status" className="text-sm font-semibold text-amber-800">{note}</p>}
          <div className="flex gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => void save(false)} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-[#0b587b] disabled:opacity-50">{busy === 'draft' ? 'Saving…' : 'Save draft'}</button><button type="button" disabled={Boolean(busy)} onClick={() => { if (left) { setNote(`${left} still to answer.`); return; } void save(true); }} className="h-12 flex-1 rounded-xl bg-[#0b587b] text-sm font-semibold text-white disabled:opacity-50">{busy === 'submit' ? 'Sending…' : left ? `Submit (${left} left)` : 'Submit'}</button></div>
        </div>
      </div>
    </div>;
  }
  if (!tasks.length) return note ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{note}</p> : null;
  return <section className="space-y-2 rounded-2xl border border-rose-300 bg-white p-4 shadow-sm">
    <h2 className="font-semibold">Forms waiting for you</h2>
    {note && <p role="status" className="text-sm font-semibold text-amber-800">{note}</p>}
    {tasks.map((task) => <button key={`${task.id}-${task.role}`} type="button" disabled={Boolean(busy)} onClick={() => void show(task)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3 text-left disabled:opacity-60">
      <span className="min-w-0"><span className="block text-sm font-semibold">{task.title}</span><span className="block text-xs text-slate-500">{task.about ? `About ${task.about} · you fill: ${task.roleLabel}` : 'Your form'}{task.dueOn ? ` · by ${task.dueOn.split('-').reverse().join('/')}` : ''}</span></span>
      <span className="shrink-0 rounded-xl bg-[#0b587b] px-3 py-2 text-xs font-semibold text-white">{busy === 'open' ? 'Opening…' : 'Fill'}</span>
    </button>)}
  </section>;
}
