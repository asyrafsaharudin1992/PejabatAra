import { useState } from 'react';
import { Printer } from 'lucide-react';
import { card } from './AssessmentStaff';
import { ASSISTANT_ITEMS, ASSISTANT_OUTCOMES } from './lib/assistantReview';
import { AREAS, LEVELS, ReviewFull } from './lib/performanceReview';
import { ReviewSheet, useReviewPrint } from './ReviewSheet';

// Office HR: the two review forms as blank samples, to see what the supervisor fills in and to print an empty copy.
const blank = (formType: 'standard' | 'assistant'): ReviewFull => ({ formType, id: '', status: 'pending', staffName: '', employeeCode: '', position: '', department: '', assessorName: '', periodLabel: '', periodStart: null, periodEnd: null, assignRemarks: '', totalScore: null, overall: '', pip: 'not_required', hrReceivedOn: null, createdAt: '', submittedAt: null, ratings: {}, assistant: undefined, improvement: '', training: '', employeeComments: '', pipRemarks: '', pipStart: null, hodName: '', hrReceivedBy: '', hrRemarks: '' } as unknown as ReviewFull);

export function HRReviewSamples() {
  const [which, setWhich] = useState<'standard' | 'assistant'>('standard');
  const [printing, setPrinting] = useState(false);
  useReviewPrint(printing, which === 'standard' ? 'Review 1 - Performance Assessment Review (sample)' : 'Review 2 - Penilaian Bulanan Pembantu Klinik (sample)', () => setPrinting(false));
  const total = ASSISTANT_ITEMS.reduce((sum, item) => sum + item.max, 0);
  return <section className={`${card} space-y-5`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-lg font-semibold">Review samples</h3><p className="text-sm text-slate-500">What the supervisor sees and fills in. Review 1 is assigned by HR; Review 2 is started by the Admin Klinikal.</p></div>
      <button onClick={() => setPrinting(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#0b587b] hover:bg-slate-50"><Printer className="h-4 w-4" />Print blank form</button>
    </div>
    <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">{([['standard', 'Review 1 · Performance Assessment Review'], ['assistant', 'Review 2 · Penilaian Bulanan Pembantu Klinik']] as const).map(([key, text]) => <button key={key} onClick={() => setWhich(key)} className={`rounded-lg px-4 py-2 ${which === key ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500'}`}>{text}</button>)}</div>
    {which === 'standard' ? <div className="space-y-5">
      <p className="text-sm text-slate-600">Four areas, each with four points rated 1 to 4. An area scores the average of its points, and the total weighs the areas by the percentage shown. Assigned by HR to a supervisor; includes comments, a Performance Improvement Plan and a part for HR.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{LEVELS.map((level) => <div key={level.value} className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${level.dot}`} /><span><strong>{level.value} · {level.label}</strong><br />{level.range}</span></div>)}</div>
      {AREAS.map((area) => <div key={area.key}><p className="text-sm font-semibold">{area.label} <span className="text-xs font-normal text-slate-400">{area.weight}%</span></p><ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-slate-600">{area.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></div>)}
    </div> : <div className="space-y-5">
      <p className="text-sm text-slate-600">19 items marked out of {total}, a result for a contract locum or a permanent staff member on probation, then the assessor's name and digital signature. Started by the Admin Klinikal of the branch.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="py-2 pr-3 font-semibold">Bil</th><th className="py-2 pr-3 font-semibold">Elemen penilaian</th><th className="py-2 pr-3 font-semibold">Penerangan</th><th className="py-2 text-right font-semibold">Markah penuh</th></tr></thead>
        <tbody>{ASSISTANT_ITEMS.map((item, index) => <tr key={item.name} className="border-b border-slate-50"><td className="py-2 pr-3 text-slate-400">{index + 1}</td><td className="py-2 pr-3 font-medium">{item.name}</td><td className="py-2 pr-3 text-slate-600">{item.points.join(' · ')}</td><td className="py-2 text-right font-semibold">{item.max}</td></tr>)}<tr><td colSpan={3} className="py-2 pr-3 text-right font-semibold">Jumlah</td><td className="py-2 text-right font-semibold">{total}</td></tr></tbody></table></div>
      <div className="grid gap-4 sm:grid-cols-2">{([['Prestasi lokum kontrak', 'locum'], ['Prestasi pekerja tetap percubaan', 'probation']] as const).map(([title, kind]) => <div key={kind} className="rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold">{title}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{ASSISTANT_OUTCOMES[kind].map((option) => <li key={option.value}>{option.label}{option.terms ? ` (${option.terms.join(' / ')}${option.customUnit ? ` / ___ ${option.customUnit}` : ''})` : ''}{option.dateOnly ? ' pada (pilih tarikh)' : ''}</li>)}</ul></div>)}</div>
    </div>}
    {printing && <ReviewSheet review={blank(which)} />}
  </section>;
}
