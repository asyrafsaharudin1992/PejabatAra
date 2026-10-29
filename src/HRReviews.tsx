import { useEffect, useMemo, useState } from 'react';
import { Printer, Search, Send } from 'lucide-react';
import { ReviewSheet, useReviewPrint } from './ReviewSheet';
import { officeFetch } from './lib/officeApi';
import { card } from './AssessmentStaff';
import { AREAS, LEVELS, ReviewFull, ReviewSummary, dmy, percentLabel, reviewApi, scoreTone } from './lib/performanceReview';

// Office HR: the Performance Reviews supervisors have submitted, with the
// "For HR use" box (received on, received by, remarks) from the paper form.
const field = 'w-full rounded-xl border border-[#dce4ed] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';

const PERIODS = ['1st Month', '2nd Month', '3rd Month', '6th Month', 'Annual'];
type Person = { id: string; fullName: string; employeeCode: string; designation: string; department: string; status: string; company: string };
const blankAssign = () => ({ employeeId: '', assessorId: '', periodLabel: '3rd Month', periodStart: '', periodEnd: '', remarks: '' });

export function HRReviews({ onError }: { onError: (message: string) => void }) {
  const [staff, setStaff] = useState<Person[]>([]);
  const [supervisors, setSupervisors] = useState<{ id: string; name: string; person?: string }[]>([]);
  const [assign, setAssign] = useState(blankAssign);
  const [assigning, setAssigning] = useState(false);
  const [notice, setNotice] = useState('');
  const [printing, setPrinting] = useState(false);
  const [list, setList] = useState<ReviewSummary[] | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [review, setReview] = useState<ReviewFull | null>(null);
  const [hr, setHr] = useState({ receivedOn: '', receivedBy: '', remarks: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    officeFetch('/api/status?resource=hr&action=employees').then((response) => response.json()).then((result) => setStaff((result.employees || []).filter((person: Person) => person.status === 'Active').sort((a: Person, b: Person) => a.fullName.localeCompare(b.fullName)))).catch(() => setStaff([]));
    reviewApi('action=hr_supervisors').then((result) => setSupervisors(result.supervisors || [])).catch(() => setSupervisors([]));
  }, []);
  useEffect(() => { reviewApi('action=hr_list').then((result) => setList(result.reviews)).catch((cause) => { setList([]); onError(cause instanceof Error ? cause.message : 'Unable to load reviews.'); }); }, []);
  useEffect(() => {
    if (!selected) { setReview(null); return; }
    let live = true;
    setReview(null); setSaved(false);
    reviewApi(`action=hr_get&id=${encodeURIComponent(selected)}`).then((result) => { if (!live) return; setReview(result.review); setHr({ receivedOn: result.review.hrReceivedOn || '', receivedBy: result.review.hrReceivedBy || '', remarks: result.review.hrRemarks || '' }); }).catch((cause) => onError(cause instanceof Error ? cause.message : 'Unable to load the review.'));
    return () => { live = false; };
  }, [selected]);

  useReviewPrint(printing, `Performance Review - ${review?.staffName || ''} - ${review?.periodLabel || ''}`, () => setPrinting(false));
  const rows = useMemo(() => (list || []).filter((item) => !search.trim() || `${item.staffName} ${item.employeeCode} ${item.department} ${item.assessorName}`.toLowerCase().includes(search.trim().toLowerCase())), [list, search]);

  const reload = async () => { try { setList((await reviewApi('action=hr_list')).reviews); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to load reviews.'); } };
  const giveReview = async () => {
    setAssigning(true); setNotice('');
    try {
      const result = await reviewApi('action=hr_assign', assign);
      setNotice(`Review assigned: ${result.review.staffName} to ${result.review.assessorName}.`);
      setAssign({ ...blankAssign(), assessorId: assign.assessorId, periodLabel: assign.periodLabel, periodStart: assign.periodStart, periodEnd: assign.periodEnd });
      await reload();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to assign the review.'); }
    setAssigning(false);
  };
  // A submitted review can only be deleted on the day it was submitted (the server checks too).
  const malaysiaDay = (value: string) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  const deletable = (item: { status: string; submittedAt: string | null }) => item.status === 'pending' || (Boolean(item.submittedAt) && malaysiaDay(item.submittedAt as string) === malaysiaDay(new Date().toISOString()));
  const deleteReview = async () => {
    if (!review) return;
    const question = review.status === 'pending' ? `Cancel the review of ${review.staffName}? The supervisor will no longer see it.` : `Delete the submitted review of ${review.staffName}? This cannot be undone.`;
    if (!window.confirm(question)) return;
    try { await reviewApi('action=hr_delete', { id: review.id }); setSelected(''); await reload(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to delete.'); }
  };

  const saveHr = async () => {
    if (!review) return;
    setSaving(true); setSaved(false);
    try {
      const result = await reviewApi('action=hr_receive', { id: review.id, ...hr });
      setReview(result.review); setSaved(true);
      setList((current) => (current || []).map((item) => item.id === review.id ? { ...item, hrReceivedOn: result.review.hrReceivedOn } : item));
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Unable to save.'); }
    setSaving(false);
  };

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="ara-hero rounded-[30px] p-7 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Office HR · Klinik ARA 24 Jam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Performance Reviews</h2><p className="mt-2 max-w-2xl leading-7 text-[#b9cfdd]">Reviews submitted by CEO, CFO, COO, CHRO and Clinical Admin. Record when HR received each one.</p></section>
    <section className={card}>
      <h3 className="text-lg font-semibold">Assign a review</h3>
      <p className="text-sm text-slate-500">Choose who is reviewed, who does the review and for which period. It appears in that supervisor's Performance Review to fill in.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-semibold text-slate-600 lg:col-span-2">Staff to review<select value={assign.employeeId} onChange={(event) => setAssign({ ...assign, employeeId: event.target.value })} className={`${field} mt-1.5`}><option value="">Choose staff…</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.employeeCode}{person.designation ? ` · ${person.designation}` : ''}</option>)}</select></label>
        <label className="block text-sm font-semibold text-slate-600 lg:col-span-2">Supervisor (assessor)<select value={assign.assessorId} onChange={(event) => setAssign({ ...assign, assessorId: event.target.value })} className={`${field} mt-1.5`}><option value="">Choose supervisor…</option>{supervisors.map((person) => <option key={person.id} value={person.id}>{person.name}{person.person ? ` · ${person.person}` : ''}</option>)}</select></label>
        <label className="block text-sm font-semibold text-slate-600">Review<input list="hr-review-periods" value={assign.periodLabel} onChange={(event) => setAssign({ ...assign, periodLabel: event.target.value })} className={`${field} mt-1.5`} /><datalist id="hr-review-periods">{PERIODS.map((period) => <option key={period} value={period} />)}</datalist></label>
        <label className="block text-sm font-semibold text-slate-600">Period from<input type="date" value={assign.periodStart} onChange={(event) => setAssign({ ...assign, periodStart: event.target.value })} className={`${field} mt-1.5`} /></label>
        <label className="block text-sm font-semibold text-slate-600">to<input type="date" value={assign.periodEnd} onChange={(event) => setAssign({ ...assign, periodEnd: event.target.value })} className={`${field} mt-1.5`} /></label>
        <div className="hidden lg:block" />
        <label className="block text-sm font-semibold text-slate-600 sm:col-span-2 lg:col-span-4">Remarks for the supervisor (optional)<textarea rows={2} value={assign.remarks} onChange={(event) => setAssign({ ...assign, remarks: event.target.value })} placeholder="e.g. Please also comment on attendance since confirmation." className={`${field} mt-1.5`} /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">{notice && <span className="mr-auto text-sm font-semibold text-emerald-700">{notice}</span>}<button onClick={() => void giveReview()} disabled={assigning || !assign.employeeId || !assign.assessorId} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0a4c6a] disabled:opacity-50"><Send className="h-4 w-4" />{assigning ? 'Assigning…' : 'Assign review'}</button></div>
    </section>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_480px]">
      <section className={card}>
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 text-[#60758c]"><Search className="h-4 w-4" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff, ID, department or assessor" className="h-11 w-full bg-transparent text-sm outline-none" /></label>
        {list === null ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : rows.length === 0 ? <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">{list.length ? 'No review matches this search.' : 'No reviews have been submitted yet.'}</p> : <ul className="mt-3 divide-y divide-slate-100">{rows.map((item) => <li key={item.id}><button onClick={() => setSelected(item.id)} className={`flex w-full flex-wrap items-center gap-3 rounded-xl px-3 py-3.5 text-left transition hover:bg-[#f4fafd] ${selected === item.id ? 'bg-[#eaf6fb]' : ''}`}>
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.staffName}</span><span className="block truncate text-xs text-slate-500">{[item.position, item.department].filter(Boolean).join(' · ') || '—'} · {item.periodLabel || 'Review'} · {item.status === 'pending' ? 'assigned to' : 'by'} {item.assessorName || '—'} · {dmy((item.submittedAt || item.createdAt).slice(0, 10))}</span></span>
          {item.totalScore !== null && <span className={`rounded-full px-3 py-1 text-xs font-bold ${scoreTone(item.totalScore)}`}>{item.totalScore.toFixed(2)} · {percentLabel(item.totalScore)}</span>}
          {item.pip === 'required' && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-700">PIP</span>}
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.status === 'pending' ? 'bg-slate-100 text-slate-600' : item.hrReceivedOn ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.status === 'pending' ? 'Waiting for supervisor' : item.hrReceivedOn ? 'Received' : 'New'}</span>
        </button></li>)}</ul>}
      </section>

      <section className={`${card} lg:max-h-[calc(100vh/0.95-120px)] lg:overflow-y-auto`}>
        {!selected ? <p className="text-sm text-slate-500">Pick a review to read it in full.</p> : !review ? <p className="text-sm text-slate-500">Loading…</p> : review.status === 'pending' ? <div className="space-y-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0b9aca]">{review.periodLabel || 'Review'} · {dmy(review.periodStart)} – {dmy(review.periodEnd)}</p><h3 className="mt-1 text-xl font-semibold">{review.staffName}</h3><p className="text-sm text-slate-500">{[review.employeeCode, review.position, review.department].filter(Boolean).join(' · ') || '—'}</p></div>
          <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">Waiting for <strong>{review.assessorName || 'the supervisor'}</strong> to fill this in.{review.assignRemarks && <><br /><span className="text-slate-500">Your remarks: {review.assignRemarks}</span></>}</p>
          <div className="flex justify-end"><button onClick={() => void deleteReview()} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">Cancel this review</button></div>
        </div> : <div className="space-y-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0b9aca]">{review.periodLabel || 'Review'} · {dmy(review.periodStart)} – {dmy(review.periodEnd)}</p><h3 className="mt-1 text-xl font-semibold">{review.staffName}</h3><p className="text-sm text-slate-500">{[review.employeeCode, review.position, review.department].filter(Boolean).join(' · ') || '—'}</p><p className="mt-1 text-sm text-slate-600">Assessor: <strong className="text-[#14233b]">{review.assessorName || '—'}</strong>{review.hodName && <> · Head of department: <strong className="text-[#14233b]">{review.hodName}</strong></>}</p></div>
          <div className="flex flex-wrap items-center justify-end gap-2">{deletable(review) ? <button onClick={() => void deleteReview()} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Delete review</button> : <span className="mr-auto text-xs text-slate-400">Can only be deleted on the day it was submitted.</span>}<button onClick={() => setPrinting(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-[#0b587b] hover:bg-[#edf9fe]"><Printer className="h-4 w-4" />Print form</button></div>
          {printing && <ReviewSheet review={review} />}
          <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-slate-50 p-4"><span className="flex items-baseline gap-3"><span className="text-3xl font-semibold tracking-tight">{review.totalScore?.toFixed(2)}</span><span className="text-xl font-semibold text-[#0b587b]">{percentLabel(review.totalScore)}</span></span><span className={`rounded-full px-3 py-1 text-xs font-bold ${scoreTone(review.totalScore)}`}>{review.overall}</span></div>
          <div className="space-y-4">{AREAS.map((area) => { const levels = review.ratings[area.key] || []; const average = levels.length === 4 ? levels.reduce((sum, value) => sum + value, 0) / 4 : null; return <div key={area.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-semibold">{area.label} <span className="text-xs font-normal text-slate-400">{area.weight}%</span></span><span className="font-semibold">{average === null ? '—' : `${average.toFixed(2)} · ${((area.weight * average) / 4).toFixed(2).replace(/\.?0+$/, '')} of ${area.weight}%`}</span></div>
            <ul className="mt-1.5 space-y-1">{area.criteria.map((criterion, index) => { const level = LEVELS.find((entry) => entry.value === levels[index]); return <li key={criterion} className="flex items-start justify-between gap-3 text-xs text-slate-600"><span>{criterion}</span><span className="flex shrink-0 items-center gap-1.5 font-semibold text-slate-700"><span className={`h-2 w-2 rounded-full ${level?.dot || 'bg-slate-200'}`} />{level?.short || '—'}</span></li>; })}</ul>
          </div>; })}</div>
          {[['Areas for improvement', review.improvement], ['Trainings required / development measures', review.training], ['Employee comments / feedback', review.employeeComments]].map(([title, body]) => <div key={title}><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{title}</p><p className="mt-1 whitespace-pre-wrap text-sm">{body || '—'}</p></div>)}
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Performance Improvement Plan</p>{review.pip === 'required' ? <p className="mt-1 whitespace-pre-wrap rounded-2xl bg-rose-50 p-3 text-sm text-rose-800"><strong>Required</strong>{review.pipStart && <> · from {dmy(review.pipStart)}</>}{review.pipRemarks && <><br />{review.pipRemarks}</>}</p> : <p className="mt-1 text-sm">Not required</p>}</div>
          <div className="space-y-3 border-t border-slate-100 pt-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">For Human Resource use</p>
            <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold text-slate-600">Received on<input type="date" value={hr.receivedOn} onChange={(event) => setHr({ ...hr, receivedOn: event.target.value })} className={`${field} mt-1.5`} /></label><label className="block text-sm font-semibold text-slate-600">Received by<input value={hr.receivedBy} onChange={(event) => setHr({ ...hr, receivedBy: event.target.value })} className={`${field} mt-1.5`} /></label></div>
            <label className="block text-sm font-semibold text-slate-600">Remarks<textarea rows={2} value={hr.remarks} onChange={(event) => setHr({ ...hr, remarks: event.target.value })} className={`${field} mt-1.5`} /></label>
            <div className="flex items-center justify-end gap-3">{saved && <span className="text-xs font-semibold text-emerald-600">Saved</span>}<button onClick={() => void saveHr()} disabled={saving} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a4c6a] disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button></div>
          </div>
        </div>}
      </section>
    </div>
  </div>;
}
