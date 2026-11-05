import { FormEvent, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { card } from './AssessmentStaff';
import { ASSISTANT_ITEMS, ASSISTANT_OUTCOMES, ASSISTANT_PANEL_ITEM, AssistantKind, assistantTotal, outcomeLabel } from './lib/assistantReview';
import { ReviewFull, ReviewSummary, dmy } from './lib/performanceReview';

// The monthly assessment for clinic assistants (Penilaian Bulanan Pembantu Klinik): the supervisor's form, how HR reads it, and the printed sheet.
const field = 'w-full rounded-xl border border-[#dce4ed] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10';
const label = 'block text-sm font-semibold text-slate-600';
const TOTAL_MAX = ASSISTANT_ITEMS.reduce((sum, item) => sum + item.max, 0);

export function AssistantReviewForm({ review, assessorName, api, onDone, onCancel, onFailed }: { review: ReviewSummary; assessorName: string; api: (query: string, body?: unknown) => Promise<any>; onDone: (review: ReviewFull) => void; onCancel: () => void; onFailed: (cause: unknown, fallback: string) => void }) {
  const [marks, setMarks] = useState<string[]>(() => ASSISTANT_ITEMS.map(() => ''));
  const [panels, setPanels] = useState('');
  const [panelsNot, setPanelsNot] = useState('');
  const [kind, setKind] = useState<AssistantKind>('locum');
  const [outcome, setOutcome] = useState('');
  const [term, setTerm] = useState('');
  const [assessor, setAssessor] = useState(assessorName);
  const [position, setPosition] = useState('');
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const total = assistantTotal(marks.map((mark) => mark === '' ? null : Number(mark)));
  const complete = marks.every((mark, index) => mark !== '' && Number(mark) * 2 === Math.round(Number(mark) * 2) && Number(mark) >= 0 && Number(mark) <= ASSISTANT_ITEMS[index].max);
  const picked = ASSISTANT_OUTCOMES[kind].find((option) => option.value === outcome);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!complete) { setError('Enter the marks for all 19 items (from 0 up to the full mark of each item, in steps of 0.5).'); return; }
    if (!picked) { setError('Choose the result of this review.'); return; }
    if (picked.terms && !term) { setError('Choose the period for this result.'); return; }
    if (!signed) { setError('Tick the box to confirm and sign the review digitally.'); return; }
    setSaving(true);
    try {
      const result = await api('action=submit', { id: review.id, marks: marks.map(Number), panels, panelsNot, kind, outcome, term: picked.terms ? term : '', assessorName: assessor, position, signed: true });
      onDone(result.review);
    } catch (cause) { onFailed(cause, 'Unable to submit the review.'); }
    setSaving(false);
  };

  return <form onSubmit={submit} className="space-y-6">
    <section className={card}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">Penilaian Bulanan Pembantu Klinik</h2><button type="button" onClick={onCancel} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Back</button></div>
      <div className="mt-4 rounded-2xl bg-[#f4fafd] p-4"><p className="text-lg font-semibold">{review.staffName}</p><p className="mt-1 text-sm text-slate-600"><span className="font-mono">{review.employeeCode}</span>{review.position ? ` · ${review.position}` : ''}{review.periodLabel ? ` · ${review.periodLabel}` : ''}</p></div>
    </section>

    <section className={card}>
      <h2 className="text-lg font-semibold">Marks for each item</h2>
      <p className="mt-1 text-sm text-slate-500">Enter the marks obtained for every item, from 0 up to the full mark shown (half marks such as 4.5 are fine). The total is out of {TOTAL_MAX}.</p>
      <ul className="mt-4 divide-y divide-slate-100">{ASSISTANT_ITEMS.map((item, index) => <li key={item.name} className="py-3.5">
        <div className="flex items-start gap-3">
          <span className="w-6 shrink-0 pt-1 text-sm font-semibold text-slate-400">{index + 1}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-slate-500">{item.note}</p></div>
          <label className="flex shrink-0 items-center gap-2 text-sm"><input type="number" inputMode="decimal" min={0} max={item.max} step={0.5} required value={marks[index]} onChange={(event) => setMarks((current) => current.map((mark, at) => at === index ? event.target.value : mark))} aria-label={`Marks for ${item.name}`} className="h-10 w-16 rounded-xl border border-[#dce4ed] px-2 text-center text-sm font-semibold outline-none focus:border-[#0b587b]" /><span className="text-slate-400">/ {item.max}</span></label>
        </div>
        {index === ASSISTANT_PANEL_ITEM && <div className="mt-2 grid gap-3 pl-9 sm:grid-cols-2"><label className={label}>Panels mastered<input value={panels} onChange={(event) => setPanels(event.target.value)} placeholder="e.g. AIA, Pmcare" className={`${field} mt-1.5`} /></label><label className={label}>Panels not yet mastered<input value={panelsNot} onChange={(event) => setPanelsNot(event.target.value)} className={`${field} mt-1.5`} /></label></div>}
      </li>)}</ul>
    </section>

    <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0b9aca]">Jumlah markah</p><p className="mt-1 text-4xl font-semibold tracking-tight">{total}<span className="text-xl text-slate-400"> / {TOTAL_MAX}</span></p></div>
      <p className="text-sm text-slate-500">{complete ? 'All items marked.' : 'Mark all 19 items to finish.'}</p>
    </section>

    <section className={`${card} space-y-4`}>
      <h2 className="text-lg font-semibold">Result</h2>
      <div className="inline-flex rounded-xl bg-[#f1f5f7] p-1 ring-1 ring-[#dce4ed]">{([['locum', 'Prestasi lokum kontrak'], ['probation', 'Pekerja tetap percubaan']] as const).map(([value, text]) => <button type="button" key={value} onClick={() => { setKind(value); setOutcome(''); setTerm(''); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${kind === value ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500'}`}>{text}</button>)}</div>
      <ul className="space-y-2">{ASSISTANT_OUTCOMES[kind].map((option) => <li key={option.value} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <label className="flex flex-1 cursor-pointer items-center gap-2 font-medium"><input type="radio" name="outcome" checked={outcome === option.value} onChange={() => { setOutcome(option.value); setTerm(''); }} className="h-4 w-4" />{option.label}</label>
        {option.terms && outcome === option.value && <select value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Period" className="h-10 rounded-xl border border-[#dce4ed] bg-white px-3 text-sm"><option value="">Period…</option>{option.terms.map((item) => <option key={item}>{item}</option>)}</select>}
      </li>)}</ul>
    </section>

    <section className={`${card} space-y-4`}>
      <h2 className="text-lg font-semibold">Penilai</h2>
      <div className="grid gap-4 sm:grid-cols-2"><label className={label}>Nama penilai<input value={assessor} onChange={(event) => setAssessor(event.target.value)} className={`${field} mt-1.5`} /></label><label className={label}>Jawatan<input value={position} onChange={(event) => setPosition(event.target.value)} className={`${field} mt-1.5`} /></label></div>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[#f4fafd] p-4 text-sm"><input type="checkbox" checked={signed} onChange={(event) => setSigned(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>I confirm this assessment is correct. Submitting it is my digital signature.</span></label>
    </section>

    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    <div className="flex justify-end"><button disabled={saving || !complete || !picked || !signed} className="inline-flex items-center gap-2 rounded-xl bg-[#0b587b] px-6 py-3.5 text-sm font-bold text-white hover:bg-[#0a4c6a] disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{saving ? 'Submitting…' : 'Submit review'}</button></div>
  </form>;
}

// How Office HR reads a submitted assistant review.
export function AssistantDetail({ review }: { review: ReviewFull }) {
  const result = review.assistant;
  const marks = result?.marks || [];
  if (!result || marks.length !== ASSISTANT_ITEMS.length) return <p className="text-sm text-slate-500">No marks were saved for this review.</p>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-2xl bg-slate-50 p-4"><span className="text-3xl font-semibold tracking-tight">{assistantTotal(marks)}<span className="text-lg text-slate-400"> / {TOTAL_MAX}</span></span><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{outcomeLabel(result.kind, result.outcome, result.term)}</span></div>
    <ul className="space-y-1">{ASSISTANT_ITEMS.map((item, index) => <li key={item.name} className="flex items-start justify-between gap-3 text-xs text-slate-600"><span>{index + 1}. {item.name}</span><span className="shrink-0 font-semibold text-slate-700">{marks[index]} / {item.max}</span></li>)}</ul>
    {(result.panels || result.panelsNot) && <p className="text-sm"><span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Panels mastered</span><br />{result.panels || '—'}<br /><span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Not yet mastered</span><br />{result.panelsNot || '—'}</p>}
  </div>;
}

// The printed sheet, laid out like the paper form (two pages).
const branchOf = (code: string) => /^ARASK/i.test(code) ? 'Seri Kembangan' : 'Kajang';
export function AssistantDocument({ review }: { review: ReviewFull }) {
  const result = review.assistant;
  const marks = result?.marks || [];
  const rows = (from: number, to: number) => ASSISTANT_ITEMS.slice(from, to).map((item, offset) => <tr key={item.name}><td className="text-center">{from + offset + 1}</td><td>{item.name}</td><td>{item.note}{from + offset === ASSISTANT_PANEL_ITEM && (result?.panels || result?.panelsNot) ? ` (Mahir: ${result?.panels || '-'}; Belum mahir: ${result?.panelsNot || '-'})` : ''}</td><td className="text-center">{item.max}</td><td className="text-center">{marks[from + offset] ?? ''}</td></tr>);
  const head = <thead><tr><th>Bil</th><th>Elemen Penilaian Tugas</th><th>Penerangan Penilaian Tugas</th><th>Markah Penuh</th><th>Markah Diperoleh</th></tr></thead>;
  const cols = <colgroup><col style={{ width: '10mm' }} /><col style={{ width: '55mm' }} /><col style={{ width: '70mm' }} /><col style={{ width: '20mm' }} /><col style={{ width: '25mm' }} /></colgroup>;
  const box = (on: boolean) => <span className={`rv-mark${on ? ' rv-on' : ''}`} />;
  const kind = result?.kind;
  return <div className="rv-print">
    <section className="rv-page">
      <div className="rv-letterhead"><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" /><div><strong>HSO Healthcare Sdn Bhd</strong><span>Klinik ARA 24 Jam</span></div></div>
      <div className="rv-title">PENILAIAN BULANAN PEMBANTU KLINIK</div>
      <div className="rv-fields">
        <p><span>Nama Pekerja :</span> {review.staffName}</p><p><span>Cawangan :</span> {branchOf(review.employeeCode)}</p>
        <p><span>Tarikh Mula Lapor Diri :</span> {dmy(review.periodStart)}</p><p><span>Tarikh Penilaian :</span> {dmy((review.submittedAt || '').slice(0, 10) || null)}</p>
      </div>
      <table className="rv-table">{cols}{head}<tbody>{rows(0, 15)}</tbody></table>
    </section>
    <section className="rv-page">
      <table className="rv-table">{cols}{head}<tbody>{rows(15, ASSISTANT_ITEMS.length)}<tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Jumlah Markah (%)</td><td className="text-center">{TOTAL_MAX}</td><td className="text-center" style={{ fontWeight: 700 }}>{marks.length ? assistantTotal(marks) : ''}</td></tr></tbody></table>
      <p style={{ marginTop: '6mm', fontWeight: 700 }}>Prestasi Lokum Kontrak:</p>
      {ASSISTANT_OUTCOMES.locum.map((option) => <p key={option.value}>{box(kind === 'locum' && result?.outcome === option.value)} {option.label}{option.terms ? ` (${kind === 'locum' && result?.outcome === option.value && result.term ? result.term : '1 minggu / 2 minggu / 4 minggu'})` : ''}</p>)}
      <p style={{ marginTop: '4mm', fontWeight: 700 }}>Prestasi Pekerja Tetap Percubaan:</p>
      {ASSISTANT_OUTCOMES.probation.map((option) => <p key={option.value}>{box(kind === 'probation' && result?.outcome === option.value)} {option.label}{option.terms ? ` (${kind === 'probation' && result?.outcome === option.value && result.term ? result.term : '1 bulan / 2 bulan / 3 bulan'})` : ''}</p>)}
      <div className="rv-fields" style={{ marginTop: '10mm' }}>
        <p><span>Tandatangan Penilai :</span> {review.submittedAt ? 'Ditandatangani secara digital' : ''}</p><p><span>Nama Penilai :</span> {review.assessorName}</p>
        <p><span>Jawatan :</span> {result?.position || ''}</p><p><span>Tarikh :</span> {dmy((review.submittedAt || '').slice(0, 10) || null)}</p>
      </div>
    </section>
  </div>;
}
