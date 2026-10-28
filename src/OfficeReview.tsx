import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCheck, LogOut, Plus } from 'lucide-react';
import { isSupabaseConfigured, signInWithSupabase, signOutSupabase, supabase } from './lib/supabase';
import { card } from './AssessmentStaff';
import { AREAS, LEVELS, Ratings, ReviewSummary, areaScore, dmy, overallLabel, percentLabel, reviewApi, scoreTone, totalScore } from './lib/performanceReview';

// Performance Review: a supervisor (CEO, CFO, COO, CPO, CHRO, Clinical Admin) fills in the
// monthly review of a staff member. Opened from the sign-in page like the Assessment Room and
// Incentive Claims, but it signs in with the supervisor's existing office email and password.
// The only difference from the offices is that no registered device is needed.
// Office HR reads the results.
const REVIEWER_OFFICES = ['ceo', 'coo', 'finance', 'procurement', 'hr', 'clinical'];

async function isReviewer() {
  if (!supabase) return false;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', data.user.id).single();
  const access: string[] = data.user.app_metadata?.office_access || [];
  return profile?.status === 'active' && (profile.role === 'super_admin' || access.some((office) => REVIEWER_OFFICES.includes(office)));
}

const field = 'w-full rounded-xl border border-[#dce4ed] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';
const label = 'block text-sm font-semibold text-slate-600';

const blank = () => ({ assessorName: '', ratings: {} as Ratings, improvement: '', training: '', employeeComments: '', pip: 'not_required' as 'required' | 'not_required', pipRemarks: '', pipStart: '', hodName: '' });

export default function OfficeReview() {
  const [state, setState] = useState<'checking' | 'out' | 'in'>('checking');
  useEffect(() => { isReviewer().then((ok) => setState(ok ? 'in' : 'out')).catch(() => setState('out')); }, []);
  if (state === 'checking') return <p className="p-10 text-sm text-slate-500">Checking sign-in…</p>;
  if (state === 'out') return <ReviewSignIn onSignedIn={() => setState('in')} />;
  return <ReviewRoom onSignedOut={() => setState('out')} />;
}

function ReviewSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured for this deployment.');
      const account = await signInWithSupabase(email, password);
      if (account.role !== 'Superadmin' && !account.officeAccess?.some((office) => REVIEWER_OFFICES.includes(office))) {
        await signOutSupabase();
        throw new Error('This account is not one of the supervisor accounts for Performance Review.');
      }
      onSignedIn();
    } catch (cause) { setError(cause instanceof Error && cause.message.includes('supervisor') ? cause.message : 'Unable to sign in with these details. Check your email and password.'); }
    finally { setLoading(false); }
  };
  return <div className="min-h-screen bg-[#f5f7f9] px-4 py-6 text-[#14233b] sm:px-8 sm:py-10"><div className="mx-auto max-w-2xl">
    <a href="#" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b]"><ArrowLeft className="h-4 w-4" />AraOffice lobby</a>
    <form onSubmit={submit} className="mt-6 rounded-[28px] bg-white p-7 shadow-[0_18px_45px_rgba(20,35,59,0.1)] sm:p-9">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0b3d59] text-[#91d7ed]"><ClipboardCheck className="h-7 w-7" strokeWidth={1.5} /></span>
      <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.25em] text-[#0b9aca]">ARAOFFICE</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Performance Review</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">For supervisors. Sign in with your office email and password (CEO, CFO, COO, CPO, CHRO or Clinical Admin). No registered device is needed.</p>
      <label className="mt-6 block"><span className="mb-2 block text-xs font-bold text-slate-700">Email address</span><input required type="email" autoFocus autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@organisation.com" className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 text-sm outline-none focus:ring-4 focus:ring-[#0b587b]/10" /></label>
      <label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-slate-700">Password</span><input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 text-sm outline-none focus:ring-4 focus:ring-[#0b587b]/10" /></label>
      {error && <div className="mt-4 flex gap-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      <button disabled={loading} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-[#0b587b] text-sm font-semibold text-white transition hover:bg-[#083a55] disabled:opacity-60">{loading ? 'Signing in…' : 'Enter Performance Review'}</button>
    </form>
  </div></div>;
}

function ReviewRoom({ onSignedOut }: { onSignedOut: () => void }) {
  const [view, setView] = useState<'todo' | 'done'>('todo');
  const [todo, setTodo] = useState<ReviewSummary[] | null>(null);
  const [done, setDone] = useState<ReviewSummary[] | null>(null);
  const [open, setOpen] = useState<ReviewSummary | null>(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState<ReviewSummary | null>(null);

  const failed = (cause: unknown, fallback: string) => { if ((cause as { status?: number }).status === 401) onSignedOut(); else setError(cause instanceof Error ? cause.message : fallback); };
  const load = async () => {
    try {
      const [waiting, finished] = await Promise.all([reviewApi('action=todo'), reviewApi('action=mine')]);
      setTodo(waiting.reviews); setDone(finished.reviews);
      setForm((current) => current.assessorName ? current : { ...current, assessorName: waiting.assessor || '' });
    } catch (cause) { setTodo([]); setDone([]); failed(cause, 'Unable to load your reviews.'); }
  };
  useEffect(() => { void load(); }, []);

  const set = (patch: Partial<ReturnType<typeof blank>>) => setForm((current) => ({ ...current, ...patch }));
  const score = totalScore(form.ratings);
  const [signed, setSigned] = useState(false);
  const start = (review: ReviewSummary) => { setOpen(review); setThanks(null); setError(''); setSigned(false); setForm({ ...blank(), assessorName: review.assessorName || '' }); window.scrollTo({ top: 0 }); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!open) return;
    setError('');
    if (score === null) { setError('Rate all 16 points before submitting.'); return; }
    if (!signed) { setError('Tick the box to confirm and sign the review digitally.'); return; }
    setSaving(true);
    try {
      const result = await reviewApi('action=submit', { ...form, id: open.id, signed: true });
      setThanks(result.review); setOpen(null);
      void load();
    } catch (cause) { failed(cause, 'Unable to submit the review.'); }
    setSaving(false);
  };

  return <div className="min-h-screen bg-[#f7f8fb] px-4 py-8 text-[#14233b] sm:px-8 lg:px-14">
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div className="flex items-center justify-between"><a href="#" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b]"><ArrowLeft className="h-4 w-4" />AraOffice lobby</a><button onClick={() => { void signOutSupabase().finally(onSignedOut); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-white"><LogOut className="h-4 w-4" />Sign out</button></div>
      <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Performance Review · Klinik ARA 24 Jam</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Staff performance review</h1><p className="mt-2 max-w-2xl leading-7 text-[#b9cfdd]">Reviews Office HR has asked you to do. Rate the four areas of the monthly review form; the result goes straight back to HR.</p></div>
          <div className="inline-flex shrink-0 rounded-xl bg-white/10 p-1">{([['todo', `To do${todo ? ` (${todo.length})` : ''}`], ['done', `Submitted${done ? ` (${done.length})` : ''}`]] as const).map(([id, label]) => <button key={id} onClick={() => { setView(id); setOpen(null); setThanks(null); }} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${view === id ? 'bg-white text-[#0b3d59]' : 'text-[#d8edf6] hover:bg-white/10'}`}>{label}</button>)}</div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

      {thanks && <section className={`${card} text-center`}>
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h2 className="mt-3 text-xl font-semibold">Review submitted for {thanks.staffName}</h2>
        <p className="mt-2 text-sm text-slate-500">Total score <strong className="text-[#14233b]">{thanks.totalScore?.toFixed(2)}</strong> ({percentLabel(thanks.totalScore)}) · {thanks.overall}. Office HR can now see it.</p>
        <button onClick={() => { setThanks(null); setView('todo'); }} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a4c6a]"><Plus className="h-4 w-4" />Back to my reviews</button>
      </section>}

      {!thanks && !open && view === 'todo' && <section className={card}>
        <h2 className="text-lg font-semibold">Waiting for you</h2>
        {todo === null ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : todo.length === 0 ? <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nothing is waiting. When Office HR assigns you a review it appears here.</p> : <ul className="mt-4 divide-y divide-slate-100">{todo.map((review) => <li key={review.id} className="flex flex-wrap items-center gap-3 py-3.5">
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{review.staffName}</p><p className="truncate text-xs text-slate-500"><span className="font-mono">{review.employeeCode}</span> · {[review.position, review.department].filter(Boolean).join(' · ') || '—'} · {review.periodLabel || 'Review'}{review.periodStart ? ` · ${dmy(review.periodStart)} – ${dmy(review.periodEnd)}` : ''}</p>{review.assignRemarks && <p className="mt-1 text-xs text-slate-600">HR: {review.assignRemarks}</p>}</div>
          <button onClick={() => start(review)} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2 text-sm font-bold text-white hover:bg-[#0a4c6a]"><ClipboardCheck className="h-4 w-4" />Start review</button>
        </li>)}</ul>}
      </section>}

      {!thanks && !open && view === 'done' && <section className={card}>
        <h2 className="text-lg font-semibold">Reviews you have submitted</h2>
        {done === null ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : done.length === 0 ? <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No reviews yet.</p> : <ul className="mt-4 divide-y divide-slate-100">{done.map((review) => <li key={review.id} className="flex flex-wrap items-center gap-3 py-3.5">
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{review.staffName}</p><p className="truncate text-xs text-slate-500">{[review.position, review.department].filter(Boolean).join(' · ') || '—'} · {review.periodLabel || 'Review'} · {dmy((review.submittedAt || review.createdAt).slice(0, 10))}</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${scoreTone(review.totalScore)}`}>{review.totalScore?.toFixed(2)} · {percentLabel(review.totalScore)} · {review.overall?.replace(' Expectations', '')}</span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${review.hrReceivedOn ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{review.hrReceivedOn ? 'Received by HR' : 'With HR'}</span>
        </li>)}</ul>}
      </section>}

      {!thanks && open && <form onSubmit={submit} className="space-y-6">
        <section className={card}>
          <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">Staff being reviewed</h2><button type="button" onClick={() => setOpen(null)} className="text-sm font-semibold text-slate-500 hover:text-[#0b587b]">Back to list</button></div>
          <div className="mt-4 rounded-2xl bg-[#f4fafd] p-4"><p className="text-lg font-semibold">{open.staffName}</p><p className="mt-1 text-sm text-slate-600"><span className="font-mono">{open.employeeCode}</span> · {[open.position, open.department].filter(Boolean).join(' · ') || '—'}</p><p className="mt-1 text-sm text-slate-600">{open.periodLabel || 'Review'}{open.periodStart ? ` · period ${dmy(open.periodStart)} – ${dmy(open.periodEnd)}` : ''}</p>{open.assignRemarks && <p className="mt-2 rounded-xl bg-white p-3 text-sm text-slate-700"><strong>Note from HR:</strong> {open.assignRemarks}</p>}</div>
          <label className={`${label} mt-4`}>Immediate superior (assessor)<input value={form.assessorName} onChange={(event) => set({ assessorName: event.target.value })} className={`${field} mt-1.5`} /></label>
        </section>

        <section className={card}>
          <h2 className="text-lg font-semibold">Rate each point</h2>
          <p className="mt-1 text-sm text-slate-500">Rate every point below. Each area is scored from the average of its four points, then weighed by the percentage shown, as on the paper form.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{LEVELS.map((level) => <div key={level.value} className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs"><span className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${level.dot}`} /><span><strong className="block text-slate-700">{level.label}</strong><span className="text-slate-500">{level.range} · {level.note}</span></span></div>)}</div>
        </section>

        {AREAS.map((area) => { const average = areaScore(form.ratings, area.key); return <section key={area.key} className={card}>
          <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-lg font-semibold">{area.label}</h2><div className="flex items-center gap-2">{average !== null && <span className={`rounded-full px-3 py-1 text-xs font-bold ${scoreTone(average)}`}>Area score {average.toFixed(2)} · {((area.weight * average) / 4).toFixed(2).replace(/\.?0+$/, '')} of {area.weight}%</span>}<span className="rounded-full bg-[#e8f7fd] px-3 py-1 text-xs font-bold text-[#0b587b]">{area.weight}%</span></div></div>
          <ul className="mt-4 divide-y divide-slate-100">{area.criteria.map((criterion, index) => <li key={criterion} className="py-3.5">
            <p className="text-sm font-semibold">{criterion}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{LEVELS.map((level) => { const chosen = form.ratings[area.key]?.[index] === level.value; return <button type="button" key={level.value} aria-pressed={chosen} onClick={() => { const next = [...(form.ratings[area.key] || [null, null, null, null])]; next[index] = level.value; set({ ratings: { ...form.ratings, [area.key]: next } }); }} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${chosen ? level.on : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${chosen ? 'bg-white/80' : level.dot}`} />{level.short}</button>; })}</div>
          </li>)}</ul>
        </section>; })}

        <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0b9aca]">Total score</p><p className="mt-1 flex flex-wrap items-baseline gap-3"><span className="text-4xl font-semibold tracking-tight">{score === null ? '—' : score.toFixed(2)}</span><span className="text-2xl font-semibold text-[#0b587b]">{percentLabel(score)}</span><span className="text-sm text-slate-400">of 100%</span></p><p className="mt-1 text-xs text-slate-500">{AREAS.map((area) => { const value = areaScore(form.ratings, area.key); return `${area.label} ${value === null ? '—' : value.toFixed(2)} × ${area.weight}%`; }).join('  ·  ')}</p></div>
          <div className="text-right">{score === null ? <p className="text-sm text-slate-500">Rate all 16 points to see the score.</p> : <span className={`rounded-full px-4 py-2 text-sm font-bold ${scoreTone(score)}`}>{overallLabel(score)}</span>}</div>
        </section>

        <section className={`${card} space-y-4`}>
          <h2 className="text-lg font-semibold">Comments</h2>
          <label className={label}>Areas for improvement<textarea rows={3} value={form.improvement} onChange={(event) => set({ improvement: event.target.value })} className={`${field} mt-1.5`} /></label>
          <label className={label}>Trainings required / development measures<textarea rows={3} value={form.training} onChange={(event) => set({ training: event.target.value })} className={`${field} mt-1.5`} /></label>
          <label className={label}>Employee comments / feedback<textarea rows={3} value={form.employeeComments} onChange={(event) => set({ employeeComments: event.target.value })} className={`${field} mt-1.5`} /></label>
          <div>
            <p className={label}>Performance Improvement Plan (PIP)</p>
            <div className="mt-2 inline-flex rounded-xl bg-[#f1f5f7] p-1 ring-1 ring-[#dce4ed]">{([['not_required', 'Not required'], ['required', 'Required']] as const).map(([value, text]) => <button type="button" key={value} onClick={() => set({ pip: value })} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${form.pip === value ? 'bg-[#0b587b] text-white shadow-sm' : 'text-slate-500 hover:text-[#0b587b]'}`}>{text}</button>)}</div>
            {form.pip === 'required' && <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_220px]"><label className={label}>Remarks<textarea rows={2} value={form.pipRemarks} onChange={(event) => set({ pipRemarks: event.target.value })} className={`${field} mt-1.5`} /></label><label className={label}>Commencement date<input type="date" value={form.pipStart} onChange={(event) => set({ pipStart: event.target.value })} className={`${field} mt-1.5`} /></label></div>}
          </div>
          <label className={label}>Head of department (name)<input value={form.hodName} onChange={(event) => set({ hodName: event.target.value })} className={`${field} mt-1.5`} /></label>
        </section>

        <section className={`${card} space-y-3`}>
          <h2 className="text-lg font-semibold">Sign the review</h2>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[#f4fafd] p-4 text-sm"><input type="checkbox" checked={signed} onChange={(event) => setSigned(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0b587b]" /><span>I confirm this assessment of <strong>{open.staffName}</strong> is correct, and I sign it digitally as <strong>{form.assessorName || 'the assessor'}</strong>. My name and the date and time will appear in the Superior/Assessor signature of the printed form.</span></label>
        </section>

        <div className="flex justify-end"><button disabled={saving || score === null || !signed} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#0a4c6a] disabled:opacity-50"><ClipboardCheck className="h-4 w-4" />{saving ? 'Submitting…' : 'Submit review to HR'}</button></div>
      </form>}
    </div>
  </div>;
}
