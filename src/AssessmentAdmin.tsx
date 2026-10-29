import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Download, Eye, Pencil, Plus, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { officeFetch } from './lib/officeApi';
import { ASSESSMENT_API as API, card, input, Modal } from './AssessmentStaff';

// Control Centre page for the Assessment Room: the MCQ assessments and
// everyone's results. Staff themselves are managed under User Management.

type Staff = { id: string; name: string; code: string; branch: string; active: boolean; preview: boolean; assessed?: boolean };
type Question = { id: string; text: string; options: string[]; answer: number };
type Quiz = { id: string; title: string; description: string; passMark: number; active: boolean; questions: Question[]; updatedAt: string };
// Every try is its own row; attemptNo counts a staff member's tries at one assessment.
type Attempt = { id: string; quizId: string; staffId: string; score: number; total: number; attemptNo: number; submittedAt: string };
// Answers (question id → chosen option) are fetched only when viewing one staff member's tries.
type AttemptDetail = { id: string; score: number; total: number; attemptNo: number; answers: Record<string, number>; submittedAt: string };
type Data = { staff: Staff[]; quizzes: Quiz[]; attempts: Attempt[] };
type QuizDraft = { id?: string; title: string; description: string; passMark: number; active: boolean; questions: Question[] };

const percent = (score: number, total: number) => total ? Math.round((score / total) * 100) : 0;
// Only full marks pass; staff below 100% retake on their own.
const fullMarks = (attempt: { score: number; total: number }) => attempt.total > 0 && attempt.score >= attempt.total;
// Each staff member's latest try at one assessment. Nobody retakes after passing, so this is also their result.
const latestByStaff = (attempts: Attempt[], quizId: string) => {
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) if (attempt.quizId === quizId && attempt.attemptNo > (latest.get(attempt.staffId)?.attemptNo ?? 0)) latest.set(attempt.staffId, attempt);
  return latest;
};
const formatDate = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const head = { fontWeight: 'bold' as const, textColor: '#FFFFFF', backgroundColor: '#0B3D59', wrap: true };
const cell = (value: string | number) => ({ value, wrap: true, alignVertical: 'top' as const });

// Builds the Excel file in the browser from data already on the page, so a
// download costs no extra database reads. The library loads only on click.
async function downloadQuiz(quiz: Quiz, staff: Staff[], attempts: Attempt[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const optionCount = Math.max(...quiz.questions.map((question) => question.options.length));
  const letters = Array.from({ length: optionCount }, (_, i) => String.fromCharCode(65 + i));
  const questions = [
    ['No.', 'Soalan', ...letters, 'Jawapan', 'Jawapan betul'].map((value) => ({ ...head, value })),
    ...quiz.questions.map((question, index) => [
      cell(index + 1), cell(question.text),
      ...letters.map((_, i) => cell(question.options[i] ?? '')),
      { ...cell(letters[question.answer]), fontWeight: 'bold' as const, textColor: '#047857', align: 'center' as const },
      { ...cell(question.options[question.answer]), fontWeight: 'bold' as const, textColor: '#047857' },
    ]),
  ];
  const byStaff = latestByStaff(attempts, quiz.id);
  const staffById = new Map(staff.map((row) => [row.id, row]));
  const results = [
    ['Nama', 'Kod staf', 'Cawangan', 'Markah', 'Peratus', 'Keputusan', 'Cubaan', 'Tarikh hantar'].map((value) => ({ ...head, value })),
    ...staff.filter((row) => !row.preview && (row.assessed || byStaff.has(row.id)) && (row.active || byStaff.has(row.id))).sort((a, b) => a.branch.localeCompare(b.branch) || a.name.localeCompare(b.name)).map((row) => {
      const attempt = byStaff.get(row.id);
      const mark = attempt ? percent(attempt.score, attempt.total) : 0;
      return [cell(row.name), cell(row.code), cell(row.branch || '—'),
        cell(attempt ? `${attempt.score}/${attempt.total}` : '—'), cell(attempt ? `${mark}%` : '—'),
        cell(attempt ? (fullMarks(attempt) ? 'Lulus' : 'Belum lulus') : 'Belum ambil'), cell(attempt ? attempt.attemptNo : '—'), cell(attempt ? formatDate(attempt.submittedAt) : '—')];
    }),
  ];
  const history = [
    ['Nama', 'Kod staf', 'Cawangan', 'Cubaan', 'Markah', 'Peratus', 'Keputusan', 'Tarikh hantar'].map((value) => ({ ...head, value })),
    ...attempts.filter((attempt) => attempt.quizId === quiz.id && staffById.has(attempt.staffId))
      .sort((a, b) => staffById.get(a.staffId)!.name.localeCompare(staffById.get(b.staffId)!.name) || a.attemptNo - b.attemptNo)
      .map((attempt) => {
        const row = staffById.get(attempt.staffId)!;
        return [cell(row.name), cell(row.code), cell(row.branch || '—'), cell(attempt.attemptNo), cell(`${attempt.score}/${attempt.total}`),
          cell(`${percent(attempt.score, attempt.total)}%`), cell(fullMarks(attempt) ? 'Lulus' : 'Tidak lulus'), cell(formatDate(attempt.submittedAt))];
      }),
  ];
  const safeTitle = quiz.title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Assessment';
  await writeExcelFile([
    { data: questions, sheet: 'Soalan & Jawapan', columns: [{ width: 5 }, { width: 50 }, ...letters.map(() => ({ width: 28 })), { width: 9 }, { width: 34 }], stickyRowsCount: 1 },
    { data: results, sheet: 'Keputusan', columns: [{ width: 16 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 13 }, { width: 8 }, { width: 22 }], stickyRowsCount: 1 },
    { data: history, sheet: 'Semua cubaan', columns: [{ width: 16 }, { width: 12 }, { width: 14 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 13 }, { width: 22 }], stickyRowsCount: 1 },
  ], { fontFamily: 'Arial', fontSize: 10 }).toFile(`${safeTitle} - Soalan & Keputusan.xlsx`);
}

const newQuestion = (): Question => ({ id: crypto.randomUUID(), text: '', options: ['', '', '', ''], answer: 0 });

export default function AssessmentAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<'quizzes' | 'results'>('quizzes');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [quizDraft, setQuizDraft] = useState<QuizDraft | null>(null);
  const [resultQuiz, setResultQuiz] = useState('');
  const [viewing, setViewing] = useState<{ quiz: Quiz; staff: Staff; attempts: AttemptDetail[] | null } | null>(null);

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
  const viewAttempts = async (quiz: Quiz, staff: Staff) => {
    setViewing({ quiz, staff, attempts: null });
    try {
      const { attempts } = await (await officeFetch(`${API}&action=attempt_detail&quizId=${encodeURIComponent(quiz.id)}&staffId=${encodeURIComponent(staff.id)}`)).json();
      setViewing((current) => current?.staff.id === staff.id ? { ...current, attempts } : current);
    } catch (cause) { setViewing(null); setMessage(cause instanceof Error ? cause.message : 'Unable to load the attempts.'); }
  };
  const updateQuestion = (index: number, change: Partial<Question>) => setQuizDraft((draft) => draft && { ...draft, questions: draft.questions.map((question, i) => i === index ? { ...question, ...change } : question) });

  const staffById = useMemo(() => new Map((data?.staff || []).map((staff) => [staff.id, staff])), [data]);
  const selectedQuiz = data?.quizzes.find((quiz) => quiz.id === (resultQuiz || data.quizzes[0]?.id));
  const results = useMemo(() => {
    if (!data || !selectedQuiz) return [];
    const byStaff = latestByStaff(data.attempts, selectedQuiz.id);
    return data.staff.filter((staff) => !staff.preview && (staff.assessed || byStaff.has(staff.id)) && (staff.active || byStaff.has(staff.id))).map((staff) => ({ staff, attempt: byStaff.get(staff.id) }))
      .sort((a, b) => Number(Boolean(b.attempt)) - Number(Boolean(a.attempt)) || a.staff.name.localeCompare(b.staff.name));
  }, [data, selectedQuiz]);
  // Staff who have submitted at least once, not the number of tries.
  const attemptCount = (quizId: string) => new Set(data?.attempts.filter((attempt) => attempt.quizId === quizId).map((attempt) => attempt.staffId)).size;

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
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><ClipboardCheck className="h-6 w-6 text-[#0b587b]" /><h2 className="text-lg font-semibold">Assessments</h2></div><button onClick={() => setQuizDraft({ title: '', description: '', passMark: 100, active: false, questions: [newQuestion()] })} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#083a55]"><Plus className="h-4 w-4" />New assessment</button></div>
        {data.quizzes.length === 0 && <p className="mt-5 rounded-2xl bg-[#f7f9fc] px-4 py-4 text-sm text-slate-500">No assessments yet. Create one, then switch it to Open when staff should take it.</p>}
        <div className="mt-5 space-y-3">{data.quizzes.map((quiz) => <div key={quiz.id} className="flex flex-col gap-4 rounded-2xl border border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">{quiz.title}</p><p className="mt-1 text-xs text-slate-500">{quiz.questions.length} questions · 100% to pass · {attemptCount(quiz.id)} submitted · updated {formatDate(quiz.updatedAt)}</p></div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => void act({ action: 'set_quiz_active', id: quiz.id, active: !quiz.active }, quiz.active ? `“${quiz.title}” closed.` : `“${quiz.title}” is now open to staff.`)} disabled={busy} className={`rounded-full px-3 py-1.5 text-xs font-bold ${quiz.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{quiz.active ? 'Open' : 'Closed'}</button>
            <button onClick={() => void downloadQuiz(quiz, data.staff, data.attempts).catch(() => setMessage('Unable to create the Excel file.'))} title="Download Excel" aria-label={`Download ${quiz.title} as Excel`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]"><Download className="h-4 w-4" /></button>
            <button onClick={() => setQuizDraft({ ...quiz, questions: quiz.questions.map((question) => ({ ...question, options: [...question.options, '', '', ''].slice(0, Math.max(4, question.options.length)) })) })} title="Edit" aria-label={`Edit ${quiz.title}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => { if (window.confirm(`Delete “${quiz.title}” and all its results?`)) void act({ action: 'delete_quiz', id: quiz.id }, `“${quiz.title}” deleted.`); }} disabled={busy} title="Delete" aria-label={`Delete ${quiz.title}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>)}</div>
      </section>}

      {data && tab === 'results' && <section className={`mt-6 ${card}`}>
        {data.quizzes.length === 0 ? <p className="text-sm text-slate-500">Create an assessment first.</p> : <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold">Results</h2><select value={selectedQuiz?.id} onChange={(event) => setResultQuiz(event.target.value)} className={`${input} sm:max-w-xs`}>{data.quizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></div>
          {selectedQuiz && <p className="mt-3 text-sm text-slate-500">{results.filter((row) => row.attempt).length} of {results.length} staff submitted · {results.filter((row) => row.attempt && fullMarks(row.attempt)).length} passed (100%)</p>}
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400"><th className="py-3 pr-4">Staff</th><th className="pr-4">Branch</th><th className="pr-4">Score</th><th className="pr-4">Result</th><th className="pr-4">Attempts</th><th className="pr-4">Last submitted</th><th /></tr></thead><tbody>{results.map(({ staff, attempt }) => {
            const mark = attempt ? percent(attempt.score, attempt.total) : 0;
            return <tr key={staff.id} className="border-b border-slate-50">
              <td className="py-3 pr-4 font-semibold">{attempt && selectedQuiz ? <button onClick={() => void viewAttempts(selectedQuiz, staff)} className="text-left hover:text-[#0b587b] hover:underline">{staff.name}</button> : staff.name}</td><td className="pr-4 text-slate-600">{staff.branch || '—'}</td>
              <td className="pr-4 text-slate-600">{attempt ? `${attempt.score}/${attempt.total} (${mark}%)` : '—'}</td>
              <td className="pr-4">{attempt ? <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${fullMarks(attempt) ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{fullMarks(attempt) ? 'Passed' : 'Not passed yet'}</span> : <span className="text-xs text-slate-400">Not taken</span>}</td>
              <td className="pr-4 text-slate-600">{attempt ? attempt.attemptNo : '—'}</td>
              <td className="pr-4 text-slate-600">{attempt ? formatDate(attempt.submittedAt) : '—'}</td>
              <td className="whitespace-nowrap text-right">{attempt && selectedQuiz && <button onClick={() => void viewAttempts(selectedQuiz, staff)} title="View attempts" aria-label={`View ${staff.name}'s attempts`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]"><Eye className="h-4 w-4" /></button>}{attempt && <button onClick={() => { if (window.confirm(`Clear all of ${staffById.get(attempt.staffId)?.name}'s attempts at this assessment? They will have to take it again from the start.`)) void act({ action: 'reset_attempt', quizId: attempt.quizId, staffId: attempt.staffId }, 'Results cleared. They will take the assessment again.'); }} disabled={busy} title="Clear result" aria-label={`Clear ${staff.name}'s result`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#0b587b]"><RotateCcw className="h-4 w-4" /></button>}</td>
            </tr>;
          })}</tbody></table></div>
        </>}
      </section>}
    </div>

    {viewing && <Modal title={`${viewing.staff.name}: ${viewing.quiz.title}`} onClose={() => setViewing(null)}>
      {!viewing.attempts && <p className="mt-6 text-sm text-slate-500">Loading attempts…</p>}
      {viewing.attempts && <>
        <p className="mt-2 text-xs leading-5 text-slate-500">Wrong answers are checked against the current questions. If the assessment was edited after a try, its list may not match the score recorded then.</p>
        <div className="mt-5 space-y-4">{[...viewing.attempts].reverse().map((attempt) => {
          const wrong = viewing.quiz.questions.map((question, index) => ({ question, index })).filter(({ question }) => attempt.answers[question.id] !== question.answer);
          return <div key={attempt.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">Attempt {attempt.attemptNo} · {attempt.score}/{attempt.total} ({percent(attempt.score, attempt.total)}%)</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${fullMarks(attempt) ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{fullMarks(attempt) ? 'Passed' : 'Not passed'}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{formatDate(attempt.submittedAt)}</p>
            {wrong.length === 0 ? <p className="mt-3 text-sm text-emerald-700">All answers correct.</p> : <div className="mt-3 space-y-3">{wrong.map(({ question, index }) => {
              const chosen = attempt.answers[question.id];
              return <div key={question.id} className="rounded-xl bg-[#f7f9fc] p-3 text-sm">
                <p className="text-xs font-semibold text-slate-400">Question {index + 1}</p>
                <p className="mt-1 whitespace-pre-line font-semibold leading-6">{question.text}</p>
                <p className="mt-2 flex items-start gap-2 text-rose-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="font-semibold">Staff answer:</span> {question.options[chosen] ?? 'Not answered (question added later)'}</span></p>
                <p className="mt-1 flex items-start gap-2 text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="font-semibold">Correct answer:</span> {question.options[question.answer]}</span></p>
              </div>;
            })}</div>}
          </div>;
        })}</div>
      </>}
    </Modal>}

    {quizDraft && <Modal title={quizDraft.id ? 'Edit assessment' : 'New assessment'} onClose={() => setQuizDraft(null)}>
      <form onSubmit={saveQuiz} className="mt-6 space-y-4">
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Title</span><input required value={quizDraft.title} onChange={(event) => setQuizDraft({ ...quizDraft, title: event.target.value })} placeholder="e.g. Infection Control — Q4 2026" className={input} /></label>
        <label className="block"><span className="mb-2 block text-xs font-bold text-slate-700">Instructions (optional)</span><textarea value={quizDraft.description} onChange={(event) => setQuizDraft({ ...quizDraft, description: event.target.value })} rows={2} className={`${input} h-auto py-3`} /></label>
        <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={quizDraft.active} onChange={(event) => setQuizDraft({ ...quizDraft, active: event.target.checked })} className="h-4 w-4 accent-[#0b587b]" />Open to staff now</label>
        <p className="text-xs leading-5 text-slate-500">Staff pass only with 100%. Below that, they see which questions they got wrong (not the correct answers) and retake until they score full marks.</p>
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
