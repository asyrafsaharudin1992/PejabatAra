import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardCheck, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { ASSESSMENT_API as API, card, input, Modal } from './AssessmentStaff';

// Control Centre page for the Assessment Room: the MCQ assessments and
// everyone's results. Staff themselves are managed under User Management.

type Staff = { id: string; name: string; code: string; branch: string; active: boolean; preview: boolean };
type Question = { id: string; text: string; options: string[]; answer: number };
type Quiz = { id: string; title: string; description: string; passMark: number; active: boolean; questions: Question[]; updatedAt: string };
type Attempt = { id: string; quizId: string; staffId: string; score: number; total: number; submittedAt: string };
type Data = { staff: Staff[]; quizzes: Quiz[]; attempts: Attempt[] };
type QuizDraft = { id?: string; title: string; description: string; passMark: number; active: boolean; questions: Question[] };

const percent = (score: number, total: number) => total ? Math.round((score / total) * 100) : 0;
const formatDate = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const newQuestion = (): Question => ({ id: crypto.randomUUID(), text: '', options: ['', '', '', ''], answer: 0 });

export default function AssessmentAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<'quizzes' | 'results'>('quizzes');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [quizDraft, setQuizDraft] = useState<QuizDraft | null>(null);
  const [resultQuiz, setResultQuiz] = useState('');

  const load = async () => {
    try { setData(await (await officeFetch(`${API}&action=admin`)).json()); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to load the Assessment Room.'); }
  };
  useEffect(() => { void load(); }, []);

  // Returns true when saved, so forms know whether to close.
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMessage('');
    try {
      await officeFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setMessage(done); await load(); return true;
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to save.'); return false; }
    finally { setBusy(false); }
  };

  const saveQuiz = async (event: FormEvent) => {
    event.preventDefault();
    if (!quizDraft) return;
    // Drop blank options and point each answer at the same option afterwards (-1 if the answer was blank, which the server rejects).
    const questions = quizDraft.questions.map((question) => {
      const kept = question.options.map((option, index) => ({ option: option.trim(), index })).filter(({ option }) => option);
      return { ...question, options: kept.map(({ option }) => option), answer: kept.findIndex(({ index }) => index === question.answer) };
    });
    if (await act({ action: 'save_quiz', ...quizDraft, questions }, `“${quizDraft.title}” saved.`)) setQuizDraft(null);
  };
  const updateQuestion = (index: number, change: Partial<Question>) => setQuizDraft((draft) => draft && { ...draft, questions: draft.questions.map((question, i) => i === index ? { ...question, ...change } : question) });

  const staffById = useMemo(() => new Map((data?.staff || []).map((staff) => [staff.id, staff])), [data]);
  const selectedQuiz = data?.quizzes.find((quiz) => quiz.id === (resultQuiz || data.quizzes[0]?.id));
  const results = useMemo(() => {
    if (!data || !selectedQuiz) return [];
    const byStaff = new Map(data.attempts.filter((attempt) => attempt.quizId === selectedQuiz.id).map((attempt) => [attempt.staffId, attempt]));
    return data.staff.filter((staff) => !staff.preview && (staff.active || byStaff.has(staff.id))).map((staff) => ({ staff, attempt: byStaff.get(staff.id) }))
      .sort((a, b) => Number(Boolean(b.attempt)) - Number(Boolean(a.attempt)) || a.staff.name.localeCompare(b.staff.name));
  }, [data, selectedQuiz]);
  const attemptCount = (quizId: string) => data?.attempts.filter((attempt) => attempt.quizId === quizId).length || 0;

  return <main className="min-h-screen bg-[#f5f7f9] px-6 py-8 text-[#14233b] sm:px-10 lg:px-16">
    <div className="mx-auto max-w-5xl">
      <a href="#office/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b]"><ArrowLeft className="h-4 w-4" />Back to Control Centre</a>
      <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.25em] text-[#0b9aca]">ARAOFFICE CONTROL CENTRE</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">Assessment Room</h1>
      <p className="mt-2 text-sm text-slate-500">Staff open the Assessment Room from the lobby on their own phones, without the device key, and sign in with their name, staff code and the last 4 digits of their IC. Add staff and their codes in <a href="#office/users" className="font-semibold text-[#0b587b] underline">User Management</a>.</p>
      {message && <p role="status" className="mt-6 rounded-xl bg-white p-4 text-sm shadow-sm">{message}</p>}

      <div className="mt-6 inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
        {([['quizzes', 'Assessments'], ['results', 'Results']] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-[#0b587b] text-white' : 'text-slate-500'}`}>{label}</button>)}
      </div>

      {!data && !message && <p className="mt-6 text-sm text-slate-500">Loading…</p>}

      {data && tab === 'quizzes' && <section className={`mt-6 ${card}`}>
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><ClipboardCheck className="h-6 w-6 text-[#0b587b]" /><h2 className="text-lg font-semibold">Assessments</h2></div><button onClick={() => setQuizDraft({ title: '', description: '', passMark: 80, active: false, questions: [newQuestion()] })} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#083a55]"><Plus className="h-4 w-4" />New assessment</button></div>
        {data.quizzes.length === 0 && <p className="mt-5 rounded-2xl bg-[#f7f9fc] px-4 py-4 text-sm text-slate-500">No assessments yet. Create one, then switch it to Open when staff should take it.</p>}
        <div className="mt-5 space-y-3">{data.quizzes.map((quiz) => <div key={quiz.id} className="flex flex-col gap-4 rounded-2xl border border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">{quiz.title}</p><p className="mt-1 text-xs text-slate-500">{quiz.questions.length} questions · pass mark {quiz.passMark}% · {attemptCount(quiz.id)} submitted · updated {formatDate(quiz.updatedAt)}</p></div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => void act({ action: 'set_quiz_active', id: quiz.id, active: !quiz.active }, quiz.active ? `“${quiz.title}” closed.` : `“${quiz.title}” is now open to staff.`)} disabled={busy} className={`rounded-full px-3 py-1.5 text-xs font-bold ${quiz.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{quiz.active ? 'Open' : 'Closed'}</button>
            <button onClick={() => setQuizDraft({ ...quiz, questions: quiz.questions.map((question) => ({ ...question, options: [...question.options, '', '', ''].slice(0, Math.max(4, question.options.length)) })) })} title="Edit" aria-label={`Edit ${quiz.title}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => { if (window.confirm(`Delete “${quiz.title}” and all its results?`)) void act({ action: 'delete_quiz', id: quiz.id }, `“${quiz.title}” deleted.`); }} disabled={busy} title="Delete" aria-label={`Delete ${quiz.title}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>)}</div>
      </section>}

      {data && tab === 'results' && <section className={`mt-6 ${card}`}>
        {data.quizzes.length === 0 ? <p className="text-sm text-slate-500">Create an assessment first.</p> : <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold">Results</h2><select value={selectedQuiz?.id} onChange={(event) => setResultQuiz(event.target.value)} className={`${input} sm:max-w-xs`}>{data.quizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></div>
          {selectedQuiz && <p className="mt-3 text-sm text-slate-500">{results.filter((row) => row.attempt).length} of {results.length} staff submitted · {results.filter((row) => row.attempt && percent(row.attempt.score, row.attempt.total) >= selectedQuiz.passMark).length} passed</p>}
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400"><th className="py-3 pr-4">Staff</th><th className="pr-4">Branch</th><th className="pr-4">Score</th><th className="pr-4">Result</th><th className="pr-4">Submitted</th><th /></tr></thead><tbody>{results.map(({ staff, attempt }) => {
            const mark = attempt ? percent(attempt.score, attempt.total) : 0;
            return <tr key={staff.id} className="border-b border-slate-50">
              <td className="py-3 pr-4 font-semibold">{staff.name}</td><td className="pr-4 text-slate-600">{staff.branch || '—'}</td>
              <td className="pr-4 text-slate-600">{attempt ? `${attempt.score}/${attempt.total} (${mark}%)` : '—'}</td>
              <td className="pr-4">{attempt ? <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${mark >= (selectedQuiz?.passMark ?? 0) ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{mark >= (selectedQuiz?.passMark ?? 0) ? 'Passed' : 'Not passed'}</span> : <span className="text-xs text-slate-400">Not taken</span>}</td>
              <td className="pr-4 text-slate-600">{attempt ? formatDate(attempt.submittedAt) : '—'}</td>
              <td className="text-right">{attempt && <button onClick={() => { if (window.confirm(`Clear ${staffById.get(attempt.staffId)?.name}'s result so they can retake this assessment?`)) void act({ action: 'reset_attempt', id: attempt.id }, 'Result cleared. They can retake the assessment.'); }} disabled={busy} title="Allow retake" aria-label={`Allow ${staff.name} to retake`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]"><RotateCcw className="h-4 w-4" /></button>}</td>
            </tr>;
          })}</tbody></table></div>
        </>}
      </section>}
    </div>

    {quizDraft && <Modal title={quizDraft.id ? 'Edit assessment' : 'New assessment'} onClose={() => setQuizDraft(null)}>
      <form onSubmit={saveQuiz} className="mt-6 space-y-4">
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Title</span><input required value={quizDraft.title} onChange={(event) => setQuizDraft({ ...quizDraft, title: event.target.value })} placeholder="e.g. Infection Control — Q4 2026" className={input} /></label>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Instructions (optional)</span><textarea value={quizDraft.description} onChange={(event) => setQuizDraft({ ...quizDraft, description: event.target.value })} rows={2} className={`${input} h-auto py-3`} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Pass mark (%)</span><input required type="number" min={0} max={100} value={quizDraft.passMark} onChange={(event) => setQuizDraft({ ...quizDraft, passMark: Number(event.target.value) })} className={input} /></label>
          <label className="flex items-center gap-3 self-end pb-3 text-sm font-semibold"><input type="checkbox" checked={quizDraft.active} onChange={(event) => setQuizDraft({ ...quizDraft, active: event.target.checked })} className="h-4 w-4 accent-[#0b587b]" />Open to staff now</label>
        </div>
        {quizDraft.id && attemptCount(quizDraft.id) > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">{attemptCount(quizDraft.id)} staff have already submitted. Editing questions does not re-mark their results.</p>}
        <div className="space-y-4 pt-2">{quizDraft.questions.map((question, index) => <div key={question.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-[#0b9aca]">Question {index + 1}</span>{quizDraft.questions.length > 1 && <button type="button" onClick={() => setQuizDraft({ ...quizDraft, questions: quizDraft.questions.filter((_, i) => i !== index) })} aria-label={`Remove question ${index + 1}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div>
          <textarea required value={question.text} onChange={(event) => updateQuestion(index, { text: event.target.value })} rows={2} placeholder="Question" className={`${input} mt-3 h-auto py-3`} />
          <p className="mt-3 text-[11px] text-slate-400">Select the correct answer. Blank options are ignored.</p>
          <div className="mt-2 space-y-2">{question.options.map((option, optionIndex) => <div key={optionIndex} className="flex items-center gap-2">
            <input type="radio" name={`answer-${question.id}`} checked={question.answer === optionIndex} onChange={() => updateQuestion(index, { answer: optionIndex })} aria-label={`Option ${optionIndex + 1} is correct`} className="h-4 w-4 shrink-0 accent-emerald-600" />
            <input value={option} onChange={(event) => updateQuestion(index, { options: question.options.map((value, i) => i === optionIndex ? event.target.value : value) })} placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`} className={`${input} h-10 ${question.answer === optionIndex ? 'ring-2 ring-emerald-500/40' : ''}`} />
          </div>)}</div>
        </div>)}</div>
        <button type="button" onClick={() => setQuizDraft({ ...quizDraft, questions: [...quizDraft.questions, newQuestion()] })} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-[#0b587b] hover:bg-slate-50"><Plus className="h-4 w-4" />Add question</button>
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setQuizDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button disabled={busy} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save assessment'}</button></div>
      </form>
    </Modal>}
  </main>;
}
