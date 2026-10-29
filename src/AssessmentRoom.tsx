import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Eye, LogOut, RotateCcw, XCircle } from 'lucide-react';

// Staff side of the Assessment Room. Staff use their own phones, so this page
// does not use the shared office accounts or the device lock: it signs in with
// name + staff code + last 4 IC digits and keeps its own session token.
const API = '/api/status?resource=assessment';
export const TOKEN_KEY = 'ara_assessment_token';

type Quiz = { id: string; title: string; description: string; passMark: number; active: boolean; questionCount: number; attempt: { score: number; total: number; count: number; submittedAt: string } | null };
type Me = { staff: { name: string; branch: string; preview: boolean; canAssess?: boolean }; quizzes: Quiz[] };
// `answer` is only sent to preview accounts.
type OpenQuiz = { id: string; title: string; description: string; passMark: number; preview: boolean; questions: { id: string; text: string; options: string[]; answer?: number }[] };
// `wrong` lists the ids of questions answered wrongly; correct answers are never sent.
type Result = { score: number; total: number; passMark: number; attempt: number; wrong: string[]; recorded?: boolean };

const percent = (score: number, total: number) => total ? Math.round((score / total) * 100) : 0;
// Only full marks pass; anything less is retaken.
const fullMarks = (score: number, total: number) => total > 0 && score >= total;
const formatDate = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export async function assessmentFetch(query: string, options: RequestInit = {}) {
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

// The staff member chooses their own password: right after the first sign-in (`first`), or later to
// change it (then the current password is asked for too).
// The blue card used by every sign-in screen (same look as the AraOffice lobby on a phone).
export const authLabel = 'mt-4 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/90 sm:mt-5 sm:text-xs';
export const authInput = 'mt-2 block h-12 w-full rounded-full border-0 bg-white px-5 text-[15px] sm:h-14 sm:px-6 sm:text-base font-normal normal-case tracking-normal text-slate-900 outline-none placeholder:text-slate-400';
export const authButton = 'mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#06263a] text-[13px] sm:mt-7 sm:h-14 sm:text-sm font-bold uppercase tracking-[0.12em] text-white active:opacity-80 disabled:opacity-50';
export function AuthShell({ children, back = true }: { children: ReactNode; back?: boolean }) {
  return <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#0f5478] via-[#0b3d59] to-[#082c42] px-5 pb-8 pt-6 sm:flex sm:items-center sm:justify-center sm:bg-none sm:bg-[#f5f7f9] sm:px-4 sm:py-12">
    <div className="mx-auto w-full max-w-[420px] sm:max-w-[560px]">
      {back && <a href="#" className="relative z-10 mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white active:opacity-80 sm:mb-4 sm:bg-transparent sm:px-1 sm:text-[#0b587b]"><ArrowLeft className="h-4 w-4" />Back to sign in</a>}
      <div className="relative overflow-hidden px-1 pb-6 pt-6 text-white sm:rounded-[36px] sm:bg-gradient-to-b sm:from-[#0f5478] sm:via-[#0b3d59] sm:to-[#082c42] sm:px-14 sm:pb-12 sm:pt-14 sm:shadow-[0_24px_50px_rgba(11,48,70,0.3)]">
        <i className="pointer-events-none max-sm:hidden absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/10" /><i className="pointer-events-none max-sm:hidden absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[#1a7aa5]/40" />
        <div className="relative">{children}</div>
      </div>
    </div>
  </div>;
}
export const AuthError = ({ message }: { message: string }) => <p className="mt-4 rounded-2xl bg-rose-500/20 px-4 py-2 text-[13px] leading-5 text-rose-100">{message}</p>;
const AuthHead = ({ title, intro }: { title: string; intro: string }) => <div className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-white/70 sm:h-16 sm:w-16 sm:rounded-2xl"><ClipboardCheck className="h-6 w-6 sm:h-8 sm:w-8" strokeWidth={1.3} /></span><h1 className="mt-5 text-[26px] font-bold tracking-tight sm:text-4xl">{title}</h1><p className="mt-1.5 text-[13px] leading-5 text-white/80 sm:mt-3 sm:text-base sm:leading-7">{intro}</p></div>;

export function SetPassword({ first = false, onDone, onCancel }: { first?: boolean; onDone: () => void; onCancel?: () => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== again) { setError('The two passwords do not match.'); return; }
    setSaving(true);
    try { await assessmentFetch('action=set_password', { method: 'POST', body: JSON.stringify({ password, current }) }); onDone(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the password.'); }
    finally { setSaving(false); }
  };
  return <AuthShell back={false}><form onSubmit={submit}>
    <AuthHead title={first ? 'Choose your password' : 'Change password'} intro={first ? 'From now on you sign in with your name, staff code and this password. Your IC digits are no longer used.' : 'Enter your current password and choose a new one.'} />
    {!first && <label className={authLabel}>Current password<input required type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} className={authInput} /></label>}
    <label className={authLabel}>New password<input required type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={authInput} /><span className="mt-1.5 block text-[11px] font-normal normal-case leading-4 tracking-normal text-[#9cc3d8]">At least 8 characters. Not your staff code or IC digits.</span></label>
    <label className={authLabel}>Type it again<input required type="password" autoComplete="new-password" value={again} onChange={(event) => setAgain(event.target.value)} className={authInput} /></label>
    {error && <AuthError message={error} />}
    <div className="mt-5 flex gap-3">{onCancel && <button type="button" onClick={onCancel} className="mt-0 h-12 rounded-full bg-white/12 px-5 text-[13px] font-bold uppercase tracking-[0.1em] text-white">Cancel</button>}<button disabled={saving} className={`${authButton} mt-0 flex-1`}>{saving ? 'Saving…' : first ? 'Save and continue' : 'Change password'}</button></div>
  </form></AuthShell>;
}

// Blue header + content, like the other screens inside Individual Sign In.
export function PageShell({ eyebrow, title, subtitle, onSignOut, children }: { eyebrow: string; title: string; subtitle?: string; onSignOut: () => void; children: ReactNode }) {
  return <div className="min-h-screen bg-[#f5f7f9] text-[#14233b]">
    <header className="relative overflow-hidden bg-gradient-to-b from-[#0f5478] via-[#0b3d59] to-[#082c42] px-4 pb-12 pt-4 text-white sm:px-8 sm:pb-16 sm:pt-8"><i className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-white/10" />
      <div className="relative mx-auto max-w-2xl">
        <div className="flex items-center justify-between"><a href="#office/individual" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b9cfdd]"><ArrowLeft className="h-4 w-4" />Menu</a><button onClick={onSignOut} className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20"><LogOut className="h-4 w-4" />Sign out</button></div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.22em] text-[#70d8fa]">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[#b9cfdd]">{subtitle}</p>}
      </div>
    </header>
    <div className="relative -mt-7 rounded-t-3xl bg-[#f5f7f9] px-3 pb-10 pt-5 sm:-mt-8 sm:px-8"><div className="mx-auto max-w-2xl">{children}</div></div>
  </div>;
}

export function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#f5f7f9] px-3 py-4 text-[#14233b] sm:px-8 sm:py-10">
    <div className="mx-auto max-w-2xl">{children}</div>
  </div>;
}

// The Incentive Claims page signs in the same way and shares the session.
export function SignIn({ onSignedIn, title = 'Assessment Room', intro = 'Periodic staff assessments. Sign in with your name, staff code and the last 4 digits of your IC.', button = 'Enter Assessment Room' }: { onSignedIn: () => void; title?: string; intro?: string; button?: string }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mustSet, setMustSet] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await assessmentFetch('action=login', { method: 'POST', body: JSON.stringify({ name, code, password }) });
      localStorage.setItem(TOKEN_KEY, result.token);
      // First sign-in (with the IC digits): the staff member now chooses their own password.
      if (result.mustSetPassword) setMustSet(true); else onSignedIn();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in.'); }
    finally { setLoading(false); }
  };
  if (mustSet) return <SetPassword first onDone={onSignedIn} />;
  return <AuthShell>
    <form onSubmit={submit}>
      <AuthHead title={title} intro={intro} />
      <label className={authLabel}>Name<input required autoFocus autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="As registered by your admin" className={authInput} /></label>
      <label className={authLabel}>Staff code<input required autoCapitalize="characters" autoComplete="username" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. ARA0012" className={`${authInput} font-mono tracking-wider`} /></label>
      <label className={authLabel}>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className={authInput} /><span className="mt-1.5 block text-[11px] font-normal normal-case leading-4 tracking-normal text-[#9cc3d8]">First time? Use the last 4 digits of your IC, then you will choose your own password.</span></label>
      {error && <AuthError message={error} />}
      <button disabled={loading} className={authButton}>{loading ? 'Signing in…' : button}<ArrowRight size={15} /></button>
      <p className="mt-4 text-center text-[12px] leading-5 text-[#9cc3d8]">Forgot your password? Ask HR to reset it, then sign in with the last 4 digits of your IC again.</p>
    </form>
  </AuthShell>;
}

// One question per screen. Staff retake until they score 100%, seeing after each
// try which questions they got wrong; preview accounts step through with the
// correct answer marked and cannot submit.
function TakeQuiz({ quizId, onDone, onBack, practice = false }: { quizId: string; onDone: () => void; onBack: () => void; practice?: boolean }) {
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
        <p className="mt-2 text-sm text-slate-500">{result.score} of {result.total} correct{result.recorded === false ? '' : ` · attempt ${result.attempt}`} · 100% needed to pass</p>
        {result.recorded === false && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">This was practice only. Your answers were not recorded.</p>}
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
      {practice && !quiz.preview && <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><Eye className="mt-0.5 h-4 w-4 shrink-0" />This assessment is designed for clinic assistants and clinical admin only. You may answer it, but your answers will not be recorded.</p>}
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
  if (openQuiz) return <TakeQuiz practice={me?.staff.canAssess === false} quizId={openQuiz} onBack={() => setOpenQuiz(null)} onDone={() => { setOpenQuiz(null); load(); }} />;

  const preview = Boolean(me?.staff.preview);
  return <PageShell eyebrow="Assessment Room" title={me ? `Hi, ${me.staff.name.split(' ')[0]}` : 'Loading…'} subtitle={me?.staff.branch} onSignOut={signOut}>
    {preview && <p className="mt-6 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800"><Eye className="mt-0.5 h-4 w-4 shrink-0" />Preview account: you can read every assessment, including closed ones, with the correct answers marked. Nothing you do here is recorded.</p>}
    {error && <div className="mt-6 flex gap-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {me && me.staff.canAssess === false && <p className="mb-4 flex gap-2 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"><Eye className="mt-1 h-4 w-4 shrink-0" />These assessments are designed for clinic assistants and clinical admin only. You may answer them, but your answers will not be recorded.</p>}
    {me && me.quizzes.length === 0 && <p className="mt-8 rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">{preview ? 'No assessments have been created yet.' : 'No assessments are open right now. Check back when your admin announces the next one.'}</p>}
    <div className="space-y-3">{me?.quizzes.map((quiz) => {
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
  </PageShell>;
}
