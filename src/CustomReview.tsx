import { FormEvent, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { card } from './AssessmentStaff';
import { Letterhead } from './AssistantReview';
import { ReviewFull, ReviewSummary, dmy } from './lib/performanceReview';
import { customPercent, customTotal, gradeFor, isChoice, markOk, pagesOf, resolveAnswers, templateMax, type ReviewTemplate } from './lib/reviewTemplate';

// A review made from a template HR created: the supervisor's form, how HR reads it, and the printed sheet.
// Items are either marked (a mark up to the full mark) or "choose one" (the chosen answer gives its score). A template can be for a candidate, not a staff member.
const field = 'w-full rounded-xl border border-[#dce4ed] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';
const label = 'block text-sm font-semibold text-slate-600';
const num = (value: number) => String(Math.round(value * 100) / 100);

export function CustomReviewForm({ review, assessorName, initial, api, onDone, onCancel, onFailed }: { key?: string; review: ReviewSummary; assessorName: string; initial?: ReviewFull | null; api: (query: string, body?: unknown) => Promise<any>; onDone: (review: ReviewFull) => void; onCancel: () => void; onFailed: (cause: unknown, fallback: string) => void }) {
  const template = initial?.template || review.template || null;
  const items = template?.items || [];
  const [marks, setMarks] = useState<string[]>(() => items.map((item, index) => !isChoice(item) && initial?.custom?.marks?.[index] !== undefined ? String(initial.custom.marks[index]) : ''));
  const [choices, setChoices] = useState<(number | null)[]>(() => items.map((item, index) => isChoice(item) ? initial?.custom?.choices?.[index] ?? null : null));
  const [outcome, setOutcome] = useState(initial?.custom?.outcome || '');
  const [comments, setComments] = useState(initial?.custom?.comments || '');
  const [assessor, setAssessor] = useState(initial?.assessorName || assessorName);
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!template || !items.length) return <section className={card}><p className="text-sm text-rose-700">This review has no template. Ask HR to assign it again.</p><button type="button" onClick={onCancel} className="mt-3 text-sm font-semibold text-slate-500 hover:text-slate-800">Back</button></section>;
  const max = templateMax(items);
  const candidate = template.subject === 'candidate';
  const resolved = resolveAnswers(items, marks.map((mark) => mark === '' ? null : Number(mark)), choices);
  const complete = !('error' in resolved);
  const liveMarks = items.map((item, index) => isChoice(item) ? (choices[index] === null ? null : item.options![choices[index]!].score) : marks[index] === '' || !markOk(Number(marks[index]), item.max) ? null : Number(marks[index]));
  const total = customTotal(liveMarks);
  const grade = complete ? gradeFor(total, template.grades || []) : '';
  const needsOutcome = template.outcomes.length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!complete) { setError((resolved as { error: string }).error); return; }
    if (needsOutcome && !outcome) { setError('Choose the result of this review.'); return; }
    if (!signed) { setError('Tick the box to confirm and sign the review digitally.'); return; }
    setSaving(true);
    try {
      const result = await api(initial ? 'action=edit' : 'action=submit', { id: review.id, marks: marks.map((mark) => mark === '' ? null : Number(mark)), choices, outcome, comments, assessorName: assessor, signed: true });
      onDone(result.review);
    } catch (cause) { onFailed(cause, 'Unable to submit the review.'); }
    setSaving(false);
  };

  return <form onSubmit={submit} className="space-y-6">
    <section className={card}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{template.name}</h2><button type="button" onClick={onCancel} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Back to list</button></div>
      {template.description && <p className="mt-1 text-sm text-slate-500">{template.description}</p>}
      <div className="mt-4 rounded-2xl bg-[#f4fafd] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{candidate ? 'Candidate' : 'Staff being reviewed'}</p><p className="text-lg font-semibold">{review.staffName}</p><p className="mt-1 text-sm text-slate-600">{candidate ? [review.position && `Position applied: ${review.position}`, review.department].filter(Boolean).join(' · ') : <><span className="font-mono">{review.employeeCode}</span>{review.position ? ` · ${review.position}` : ''}{review.department ? ` · ${review.department}` : ''}</>}</p>{(review.periodLabel || review.periodStart) && <p className="mt-1 text-sm text-slate-500">{review.periodLabel}{review.periodStart ? ` · ${dmy(review.periodStart)}${review.periodEnd ? ` - ${dmy(review.periodEnd)}` : ''}` : ''}</p>}{review.assignRemarks && <p className="mt-2 text-sm text-slate-600">HR remarks: {review.assignRemarks}</p>}</div>
    </section>

    <section className={card}>
      <h2 className="text-lg font-semibold">{items.some(isChoice) ? 'Assessment' : 'Marks for each item'}</h2>
      <p className="mt-1 text-sm text-slate-500">{items.some(isChoice) ? 'Choose one answer where choices are shown; enter a mark where a box is shown (half marks such as 4.5 are fine).' : 'Enter the marks obtained for every item, from 0 up to the full mark shown (half marks such as 4.5 are fine).'} The total is out of {num(max)}.</p>
      <ul className="mt-4 divide-y divide-slate-100">{items.map((item, index) => <li key={`${index}-${item.name}`} className="py-3.5">
        <div className="flex items-start gap-3">
          <span className="w-6 shrink-0 pt-1 text-sm font-semibold text-slate-400">{index + 1}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.name}</p>{item.points.length > 0 && <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-500">{item.points.map((point) => <li key={point}>{point}</li>)}</ul>}
            {isChoice(item) && <div role="radiogroup" aria-label={item.name} className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{item.options!.map((option, at) => <label key={at} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-xs ${choices[index] === at ? 'border-[#0b587b] bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><input type="radio" name={`item-${index}`} checked={choices[index] === at} onChange={() => setChoices((current) => current.map((choice, i) => i === index ? at : choice))} className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 leading-4">{option.label}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{num(option.score)}</span></label>)}</div>}
          </div>
          {!isChoice(item) && <label className="flex shrink-0 items-center gap-2 text-sm"><input type="number" inputMode="decimal" min={0} max={item.max} step={0.5} required value={marks[index]} onChange={(event) => setMarks((current) => current.map((mark, at) => at === index ? event.target.value : mark))} aria-label={`Marks for ${item.name}`} className="h-10 w-20 rounded-xl border border-[#dce4ed] bg-white px-2 text-center text-sm font-semibold outline-none focus:border-[#0b587b]" /><span className="text-slate-400">/ {num(item.max)}</span></label>}
        </div>
      </li>)}</ul>
    </section>

    <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0b9aca]">Total score</p><p className="mt-1 text-4xl font-semibold tracking-tight">{num(total)}<span className="text-xl text-slate-400"> / {num(max)}</span></p>{grade && <p className="mt-1 text-sm font-semibold text-[#0b587b]">{grade}</p>}</div>
      <p className="text-sm text-slate-500">{complete ? `All items answered · ${customPercent(liveMarks, items)}%` : `Answer all ${items.length} items to finish.`}</p>
    </section>

    {needsOutcome && <section className={`${card} space-y-3`}>
      <h2 className="text-lg font-semibold">Result</h2>
      <ul className="space-y-2">{template.outcomes.map((option) => <li key={option}><label className="flex cursor-pointer items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-medium"><input type="radio" name="outcome" checked={outcome === option} onChange={() => setOutcome(option)} className="h-4 w-4" />{option}</label></li>)}</ul>
    </section>}

    <section className={`${card} space-y-4`}>
      <h2 className="text-lg font-semibold">Comments and assessor</h2>
      <label className={label}>Assessor's comments (optional)<textarea rows={4} maxLength={3000} value={comments} onChange={(event) => setComments(event.target.value)} className={`${field} mt-1.5`} /></label>
      <label className={label}>Assessor's name<input value={assessor} onChange={(event) => setAssessor(event.target.value)} className={`${field} mt-1.5`} /></label>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[#f4fafd] p-4 text-sm"><input type="checkbox" checked={signed} onChange={(event) => setSigned(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>I confirm this assessment is my own and sign it digitally. It cannot be changed after the day it is submitted.</span></label>
    </section>

    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    <div className="flex justify-end"><button disabled={saving || !complete || (needsOutcome && !outcome) || !signed} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-6 py-3.5 text-sm font-bold text-white hover:bg-[#0a4c6a] disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{saving ? 'Submitting…' : initial ? 'Save changes' : 'Submit review'}</button></div>
  </form>;
}

// How Office HR reads a submitted review made from a template.
export function CustomDetail({ review }: { review: ReviewFull }) {
  const items = review.template?.items || [];
  const marks = review.custom?.marks || [];
  const choices = review.custom?.choices || [];
  if (!items.length || marks.length !== items.length) return <p className="text-sm text-slate-500">No marks were saved for this review.</p>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-2xl bg-slate-50 p-4"><span className="text-3xl font-semibold tracking-tight">{num(customTotal(marks))}<span className="text-lg text-slate-400"> / {num(templateMax(items))}</span></span><span className="text-sm font-semibold text-slate-600">{customPercent(marks, items)}%{review.custom?.grade ? ` · ${review.custom.grade}` : ''}{review.custom?.outcome ? ` · ${review.custom.outcome}` : ''}</span></div>
    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{review.template?.name}{review.template?.subject === 'candidate' ? ' · candidate' : ''}</p>
    <ul className="space-y-1.5">{items.map((item, index) => <li key={`${index}-${item.name}`} className="text-xs text-slate-600"><div className="flex items-start justify-between gap-3"><span>{index + 1}. {item.name}</span><span className="shrink-0 font-semibold text-slate-800">{num(marks[index])} / {num(item.max)}</span></div>{isChoice(item) && choices[index] !== null && choices[index] !== undefined && item.options![choices[index]!] && <p className="mt-0.5 pl-4 text-slate-500">{item.options![choices[index]!].label}</p>}</li>)}</ul>
    {review.custom?.comments && <p className="whitespace-pre-wrap text-sm"><span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Assessor's comments</span><br />{review.custom.comments}</p>}
  </div>;
}

// The printed sheet, with the clinic letterhead and logo as on the other forms. A template with only marked items is laid out as a table (like Review 2); one with
// "choose one" items is laid out item by item with the choices side by side and the chosen one filled. The items are spread over A4 pages by how many lines they need;
// the total, the grade, the result, the comments and the signature are on the last page.
const cell = { border: '0.25mm solid #000', padding: '0.4mm 1mm', verticalAlign: 'middle' as const, lineHeight: 1.15 };

export function CustomDocument({ review }: { review: ReviewFull }) {
  const template: ReviewTemplate | null = review.template || null;
  const items = template?.items || [];
  const marks = review.custom?.marks || [];
  const choices = review.custom?.choices || [];
  const candidate = template?.subject === 'candidate';
  const blocks = items.some(isChoice);
  const groups = pagesOf(items);
  const pageCount = groups.length + 1;
  const dated = dmy((review.submittedAt || '').slice(0, 10) || null);
  const period = [review.periodStart ? `${dmy(review.periodStart)}${review.periodEnd ? ` - ${dmy(review.periodEnd)}` : ''}` : '', review.periodLabel ? `(${review.periodLabel})` : ''].filter(Boolean).join(' ');
  const cols = <colgroup><col style={{ width: '9mm' }} /><col style={{ width: '40mm' }} /><col style={{ width: '82mm' }} /><col style={{ width: '22mm' }} /><col style={{ width: '27mm' }} /></colgroup>;
  const head = <thead><tr><th style={cell}>NO</th><th style={cell}>ITEM</th><th style={cell}>DESCRIPTION</th><th style={cell}>FULL MARK</th><th style={cell}>MARKS OBTAINED</th></tr></thead>;
  const rows = (indexes: number[]) => indexes.flatMap((index) => {
    const item = items[index];
    const points = item.points.length ? item.points : [''];
    return points.map((point, at) => <tr key={`${index}-${at}`}>
      {at === 0 && <td rowSpan={points.length} style={{ ...cell, textAlign: 'center' }}>{index + 1}</td>}
      {at === 0 && <td rowSpan={points.length} style={{ ...cell, textTransform: 'uppercase', fontSize: '7pt' }}>{item.name}</td>}
      <td style={{ ...cell, fontSize: '7pt' }}>{point}</td>
      {at === 0 && <td rowSpan={points.length} style={{ ...cell, textAlign: 'center' }}>{num(item.max)}</td>}
      {at === 0 && <td rowSpan={points.length} style={{ ...cell, textAlign: 'center', fontWeight: 700, fontSize: '9pt' }}>{marks[index] !== undefined ? num(marks[index]) : ''}</td>}
    </tr>);
  });
  const box = (on: boolean) => <span className={`rv-check${on ? ' rv-on' : ''}`} />;
  const blockOf = (index: number) => {
    const item = items[index];
    return <div key={index} style={{ border: '0.25mm solid #000', marginTop: '-0.25mm', breakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4mm', padding: '0.6mm 1.2mm', background: '#e8eef4', fontWeight: 700, fontSize: '8pt' }}><span style={{ textTransform: 'uppercase' }}>{index + 1}. {item.name}</span><span style={{ whiteSpace: 'nowrap' }}>Full {num(item.max)} · Obtained <span style={{ display: 'inline-block', minWidth: '8mm', borderBottom: '0.2mm solid #000', textAlign: 'center' }}>{marks[index] !== undefined ? num(marks[index]) : ''}</span></span></div>
      {item.points.length > 0 && <ul style={{ margin: 0, padding: '0.6mm 1.2mm 0.6mm 5mm', fontSize: '7pt', lineHeight: 1.2 }}>{item.points.map((point) => <li key={point}>{point}</li>)}</ul>}
      {isChoice(item) && <div style={{ display: 'flex', borderTop: '0.25mm solid #000' }}>{item.options!.map((option, at) => <div key={at} style={{ flex: 1, borderLeft: at ? '0.25mm solid #000' : 'none', padding: '0.8mm 1mm', fontSize: '7pt', textAlign: 'center', lineHeight: 1.2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.8mm' }}><span>{option.label}</span><span style={{ fontWeight: 700 }}>{box(choices[index] === at)} {num(option.score)}</span></div>)}</div>}
    </div>;
  };
  const row = (name: string, value: string) => <p style={{ display: 'flex', gap: '2mm', borderBottom: '0.2mm solid #000', padding: '0.2mm 0', fontSize: '8pt' }}><span style={{ width: '42mm' }}>{name}</span><span style={{ fontWeight: 700 }}>: {value}</span></p>;
  const footer = (page: number) => <p style={{ textAlign: 'center', marginTop: '2mm', fontSize: '7pt' }}>Page {page} of {pageCount}</p>;
  const done = marks.length === items.length && items.length > 0;
  const comments = (review.custom?.comments || '').split('\n');
  return <div className="rv-print">
    {groups.map((indexes, page) => <section key={page} className="rv-page">
      <Letterhead page={page + 1} />
      {page === 0 && <>
        <p style={{ marginTop: '1mm', fontWeight: 700, fontSize: '9.5pt', textTransform: 'uppercase' }}>{template?.name}</p>
        <div style={{ margin: '0.5mm 0 1.5mm' }}>{candidate ? <>{row('Candidate', review.staffName)}{row('Position applied', review.position)}{review.department ? row('Company', review.department) : null}{row('Assessor', review.assessorName)}{row('Date', period)}</> : <>{row('Name', review.staffName)}{row('Employee ID', review.employeeCode)}{row('Position', review.position)}{row('Department', review.department)}{row('Assessor', review.assessorName)}{row('Assessment period', period)}</>}</div>
      </>}
      {blocks ? <div style={{ marginTop: page === 0 ? '1mm' : '3mm' }}>{indexes.map(blockOf)}</div> : <table className="rv-table" style={{ tableLayout: 'fixed', marginTop: page === 0 ? 0 : '3mm' }}>{cols}{head}<tbody>{rows(indexes)}</tbody></table>}
      {footer(page + 1)}
    </section>)}
    <section className="rv-page">
      <Letterhead page={pageCount} />
      {groups.length === 0 && <p style={{ marginTop: '1mm', fontWeight: 700, fontSize: '9.5pt', textTransform: 'uppercase' }}>{template?.name}</p>}
      <p style={{ marginTop: '8mm' }}><strong>Total score</strong> : <strong style={{ borderBottom: '0.3mm solid #000', padding: '0 8mm' }}>{done ? `${num(customTotal(marks))} / ${num(templateMax(items))}  (${customPercent(marks, items)}%)` : `    / ${num(templateMax(items))}`}</strong></p>
      {(template?.grades?.length || 0) > 0 && <>
        <p style={{ marginTop: '4mm', fontWeight: 700 }}>Grade{review.custom?.grade ? `: ${review.custom.grade}` : ''}</p>
        {[...template!.grades!].sort((a, b) => b.min - a.min).map((grade) => <p key={`${grade.min}-${grade.label}`} style={{ margin: '0.6mm 0', fontSize: '8pt' }}>{box(review.custom?.grade === grade.label)} {num(grade.min)} and above : {grade.label}</p>)}
      </>}
      {(template?.outcomes.length || 0) > 0 && <>
        <p style={{ marginTop: '6mm', fontWeight: 700 }}>Result:</p>
        {template!.outcomes.map((option) => <p key={option} style={{ margin: '1mm 0' }}>{box(review.custom?.outcome === option)} {option}</p>)}
      </>}
      <p style={{ marginTop: '6mm', fontWeight: 700 }}>Assessor's comments:</p>
      <div className="rv-lines">{comments.map((line, index) => <p key={index}>{line || ' '}</p>)}{Array.from({ length: Math.max(0, 4 - comments.length) }, (_, index) => <p key={`b${index}`}>&nbsp;</p>)}</div>
      <div style={{ marginTop: '10mm' }}>
        <p style={{ display: 'flex', gap: '2mm', padding: '1mm 0' }}><span style={{ width: '32mm' }}>Assessor's signature</span><span>: {review.submittedAt ? <span style={{ fontStyle: 'italic' }}>Digitally signed</span> : ''}</span></p>
        <p style={{ display: 'flex', gap: '2mm', padding: '1mm 0' }}><span style={{ width: '32mm' }}>Name</span><span style={{ fontWeight: 700 }}>: {review.assessorName}</span></p>
        <p style={{ display: 'flex', gap: '2mm', padding: '1mm 0' }}><span style={{ width: '32mm' }}>Date</span><span style={{ fontWeight: 700 }}>: {dated}</span></p>
      </div>
      <div className="rv-hr"><p><strong><em>For Human Resource/Admin Use</em></strong></p><p>Received on : {dmy(review.hrReceivedOn)} &nbsp;&nbsp;&nbsp; Received by : {review.hrReceivedBy}</p><p>Remarks : {review.hrRemarks}</p></div>
      {footer(pageCount)}
    </section>
  </div>;
}
