import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Eye, LogOut, RotateCcw, XCircle } from 'lucide-react';

// Staff side of the Assessment Room. Staff use their own phones, so this page
// does not use the shared office accounts or the device lock: it signs in with
// name + staff code + last 4 IC digits and keeps its own session token.
const API = '/api/status?resource=assessment';
const TOKEN_KEY = 'ara_assessment_token';

type Quiz = { id: string; title: string; description: string; passMark: number; active: boolean; questionCount: number; attempt: { score: number; total: number; count: number; submittedAt: string } | null };
type Me = { staff: { name: string; branch: string; preview: boolean }; quizzes: Quiz[] };
// `answer` is only sent to preview accounts.
type OpenQuiz = { id: string; title: string; description: string; passMark: number; preview: boolean; questions: { id: string; text: string; options: string[]; answer?: number }[] };
// `wrong` lists the ids of questions answered wrongly; correct answers are never sent.
type Result = { score: number; total: number; passMark: number; attempt: number; wrong: string[] };

const percent = (score: number, total: number) => total ? Math.round((score / total) * 100) : 0;
// Only full marks pass; anything less is retaken.
const fullMarks = (score: number, total: number) => total > 0 && score >= total;
const formatDate = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function assessmentFetch(query: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set('x-assessment-token', token);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API}&${query}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) localStorage.removeItem(TOKEN_KEY);
  if (!response.ok) throw Object.assign(new Error(body.error || 'Something went wrong. Please try again.'), { status: response.status });
  return body;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#f5f7f9] px-4 py-6 text-[#14233b] sm:px-8 sm:py-10">
    <div className="mx-auto max-w-2xl">{children}</div>
  </div>;
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [ic4, setIc4] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await assessmentFetch('action=login', { method: 'POST', body: JSON.stringify({ name, code, ic4 }) });
      localStorage.setItem(TOKEN_KEY, result.token);
      onSignedIn();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in.'); }
    finally { setLoading(false); }
  };
  return <Shell>
    <a href="#" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b]"><ArrowLeft className="h-4 w-4" />AraOffice lobby</a>
    <form onSubmit={submit} className="mt-6 rounded-[28px] bg-white p-7 shadow-[0_18px_45px_rgba(20,35,59,0.1)] sm:p-9">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0b3d59] text-[#91d7ed]"><ClipboardCheck className="h-7 w-7" strokeWidth={1.5} /></span>
      <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.25em] text-[#0b9aca]">ARAOFFICE</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Assessment Room</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Periodic staff assessments. Sign in with your name, staff code and the last 4 digits of your IC.</p>
      <label className="mt-6 block"><span className="mb-2 block text-xs font-bold text-slate-700">Name</span><input required autoFocus autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="As registered by your admin" className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 outline-none focus:ring-4 focus:ring-[#0b587b]/10" /></label>
      <label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-slate-700">Staff code</span><input required autoCapitalize="characters" autoComplete="username" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. ARA0012" className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 font-mono tracking-wider outline-none focus:ring-4 focus:ring-[#0b587b]/10" /></label>
      <label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-slate-700">IC number: last 4 digits</span><input required type="password" inputMode="numeric" maxLength={4} autoComplete="current-password" value={ic4} onChange={(event) => setIc4(event.target.value.replace(/\D/g, ''))} placeholder="••••" className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 font-mono tracking-[0.4em] outline-none focus:ring-4 focus:ring-[#0b587b]/10" /></label>
      {error && <div className="mt-4 flex gap-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      <button disabled={loading} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b587b] text-sm font-semibold text-white transition hover:bg-[#083a55] disabled:opacity-60">{loading ? 'Signing in…' : 'Enter Assessment Room'}<ArrowRight size={15} /></button>
      <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">Can't sign in? Ask your System Admin to check your details.</p>
    </form>
  </Shell>;
}

// One question per screen. Staff retake until they score 100%, seeing after each
// try which questions they got wrong; preview accounts step through with the
// correct answer marked and cannot submit.
function TakeQuiz({ quizId, onDone, onBack }: { quizId: string; onDone: () => void; onBack: () => void }) {
  const [quiz, setQuiz] = useState<OpenQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { assessmentFetch(`action=quiz&id=${encodeURIComponent(quizId)}`).then(setQuiz).catch((cause) => setError(cause.message)); }, [quizId]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [result, step]);

  const answered = quiz ? quiz.questions.filter((question) => answers[question.id] !== undefined).length : 0;
  const submit = async () => {
    if (!quiz) return;
    const firstUnanswered = quiz.questions.findIndex((question) => answers[question.id] === undefined);
    if (firstUnanswered >= 0) { setStep(firstUnanswered); setError(`Question ${firstUnanswered + 1} has not been answered.`); return; }
    if (!window.confirm('Submit your answers? You need 100% to pass.')) return;
    setError(''); setSaving(true);
    try { setResult(await assessmentFetch('action=submit', { method: 'POST', body: JSON.stringify({ id: quiz.id, answers }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to submit.'); }
    finally { setSaving(false); }
  };

  if (result && quiz) {
    const passed = fullMarks(result.score, result.total);
    const retake = () => { setResult(null); setAnswers({}); setStep(0); setError(''); };
    return <Shell>
      <div className="rounded-[28px] bg-white p-8 text-center shadow-[0_18px_45px_rgba(20,35,59,0.1)]">
        {passed ? <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" /> : <XCircle className="mx-auto h-14 w-14 text-rose-500" />}
        <h1 className="mt-5 text-2xl font-semibold">{passed ? 'Well done, you passed!' : 'Not passed yet'}</h1>
        <p className="mt-6 text-5xl font-semibold tracking-tight">{percent(result.score, result.total)}%</p>
        <p className="mt-2 text-sm text-slate-500">{result.score} of {result.total} correct · attempt {result.attempt} · 100% needed to pass</p>
        {!passed && <p className="mt-4 text-sm leading-6 text-slate-600">Check the {result.wrong.length === 1 ? 'question' : `${result.wrong.length} questions`} you got wrong below, then try again.</p>}
        {passed
          ? <button onClick={onDone} className="mt-8 h-12 w-full rounded-xl bg-[#0b587b] text-sm font-semibold text-white hover:bg-[#083a55]">Back to assessments</button>
          : <div className="mt-8 grid gap-2 sm:grid-cols-2">
            <button onClick={onDone} className="h-12 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Back to assessments</button>
            <button onClick={retake} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0b587b] text-sm font-semibold text-white hover:bg-[#083a55]"><RotateCcw className="h-4 w-4" />Try again</button>
          </div>}
      </div>
      {result.wrong.length > 0 && <div className="mt-6 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-rose-600">Wrong answers</h2>
        {quiz.questions.map((question, index) => result.wrong.includes(question.id) && <div key={question.id} className="rounded-2xl bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)]">
          <p className="text-xs font-semibold text-slate-400">Question {index + 1}</p>
          <p className="mt-1 whitespace-pre-line text-sm font-semibold leading-6">{question.text}</p>
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="font-semibold">Your answer:</span> {question.options[answers[question.id]]}</span></p>
        </div>)}
      </div>}
    </Shell>;
  }

  const question = quiz?.questions[step];
  const last = quiz ? step === quiz.questions.length - 1 : false;
  return <Shell>
    <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b]"><ArrowLeft className="h-4 w-4" />All assessments</button>
    {!quiz && !error && <p className="mt-8 text-sm text-slate-500">Loading assessment…</p>}
    {quiz && question && <>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em]">{quiz.title}</h1>
      {quiz.preview && <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"><Eye className="h-3.5 w-3.5" />Preview: correct answers are marked. Nothing is recorded.</p>}
      {step === 0 && quiz.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-500">{quiz.description}</p>}
      <div className="mt-5 flex items-center justify-between text-xs font-semibold text-slate-500"><span>Question {step + 1} of {quiz.questions.length}</span>{!quiz.preview && <span>{answered} answered</span>}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#0b587b] transition-all" style={{ width: `${((step + 1) / quiz.questions.length) * 100}%` }} /></div>
      <div className="mt-5 rounded-2xl bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)] sm:p-6">
        <p className="whitespace-pre-line text-base font-semibold leading-7">{question.text}</p>
        <div className="mt-5 space-y-2.5">{question.options.map((option, optionIndex) => {
          if (quiz.preview) {
            const correct = optionIndex === question.answer;
            return <div key={optionIndex} className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm ${correct ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-900' : 'border-slate-200 text-slate-600'}`}>
              {correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <span className="mt-0.5 h-4 w-4 shrink-0" />}<span>{option}</span>
            </div>;
          }
          const chosen = answers[question.id] === optionIndex;
          return <label key={optionIndex} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 text-sm transition ${chosen ? 'border-[#0b587b] bg-[#e9f6fb]' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="radio" name={question.id} checked={chosen} onChange={() => { setError(''); setAnswers((current) => ({ ...current, [question.id]: optionIndex })); }} className="mt-0.5 accent-[#0b587b]" />
            <span>{option}</span>
          </label>;
        })}</div>
      </div>
    </>}
    {error && <div className="mt-4 flex gap-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {quiz && question && <div className="mt-5 flex items-center justify-between gap-3">
      <button onClick={() => setStep(step - 1)} disabled={step === 0} className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:invisible"><ArrowLeft className="h-4 w-4" />Back</button>
      {!last && <button onClick={() => setStep(step + 1)} disabled={!quiz.preview && answers[question.id] === undefined} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#0b587b] px-6 text-sm font-semibold text-white hover:bg-[#083a55] disabled:opacity-40">Next<ArrowRight className="h-4 w-4" /></button>}
      {last && (quiz.preview
        ? <button onClick={onBack} className="h-12 rounded-xl bg-[#0b587b] px-6 text-sm font-semibold text-white hover:bg-[#083a55]">Finish preview</button>
        : <button onClick={submit} disabled={saving || answers[question.id] === undefined} className="h-12 rounded-xl bg-[#0b587b] px-6 text-sm font-semibold text-white hover:bg-[#083a55] disabled:opacity-40">{saving ? 'Submitting…' : 'Submit answers'}</button>)}
    </div>}
  </Shell>;
}

export default function AssessmentRoom() {
  const [me, setMe] = useState<Me | null>(null);
  const [signedIn, setSignedIn] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));
  const [openQuiz, setOpenQuiz] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    assessmentFetch('action=me').then(setMe).catch((cause) => { if (cause.status === 401) setSignedIn(false); else setError(cause.message); });
  };
  useEffect(() => { if (signedIn) load(); }, [signedIn]);

  const signOut = async () => {
    await assessmentFetch('action=logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    localStorage.removeItem(TOKEN_KEY);
    setMe(null); setSignedIn(false);
  };

  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} />;
  if (openQuiz) return <TakeQuiz quizId={openQuiz} onBack={() => setOpenQuiz(null)} onDone={() => { setOpenQuiz(null); load(); }} />;

  const preview = Boolean(me?.staff.preview);
  return <Shell>
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#0b9aca]">ASSESSMENT ROOM</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{me ? `Hi, ${me.staff.name.split(' ')[0]}` : 'Loading…'}</h1>{me?.staff.branch && <p className="mt-1 text-sm text-slate-500">{me.staff.branch}</p>}</div>
      <button onClick={signOut} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><LogOut className="h-4 w-4" />Sign out</button>
    </div>
    {preview && <p className="mt-6 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800"><Eye className="mt-0.5 h-4 w-4 shrink-0" />Preview account: you can read every assessment, including closed ones, with the correct answers marked. Nothing you do here is recorded.</p>}
    {error && <div className="mt-6 flex gap-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {me && me.quizzes.length === 0 && <p className="mt-8 rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">{preview ? 'No assessments have been created yet.' : 'No assessments are open right now. Check back when your admin announces the next one.'}</p>}
    <div className="mt-8 space-y-3">{me?.quizzes.map((quiz) => {
      const mark = quiz.attempt ? percent(quiz.attempt.score, quiz.attempt.total) : 0;
      const passed = Boolean(quiz.attempt && fullMarks(quiz.attempt.score, quiz.attempt.total));
      return <div key={quiz.id} className="rounded-2xl bg-white p-5 shadow-[0_8px_25px_rgba(20,35,59,0.06)]">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="font-semibold">{quiz.title}</h2>{quiz.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{quiz.description}</p>}<p className="mt-2 text-xs text-slate-400">{quiz.questionCount} questions · 100% needed to pass</p></div>
          {preview && <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${quiz.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{quiz.active ? 'Open' : 'Closed'}</span>}
          {!preview && quiz.attempt && <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{mark}%</span>}
        </div>
        {preview
          ? <button onClick={() => setOpenQuiz(quiz.id)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#083a55]"><Eye className="h-4 w-4" />View questions</button>
          : passed && quiz.attempt
            ? <p className="mt-4 text-xs text-slate-500">Passed {formatDate(quiz.attempt.submittedAt)} · {quiz.attempt.score}/{quiz.attempt.total} correct · {quiz.attempt.count} {quiz.attempt.count === 1 ? 'attempt' : 'attempts'}</p>
            : quiz.attempt
              ? <div className="mt-4"><p className="text-xs text-rose-700">Not passed yet · last try {quiz.attempt.score}/{quiz.attempt.total} correct · you need 100%</p><button onClick={() => setOpenQuiz(quiz.id)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#083a55]"><RotateCcw className="h-4 w-4" />Retake assessment</button></div>
              : <button onClick={() => setOpenQuiz(quiz.id)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#083a55]">Start assessment<ArrowRight className="h-4 w-4" /></button>}
      </div>;
    })}</div>
  </Shell>;
}
