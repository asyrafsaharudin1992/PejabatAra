import { useState, type ReactNode } from 'react';
import LocumInterview from './LocumInterview';

// Inside Performance Review for the doctors who interview locums (Dr Atikah): the reviews HR assigned, and the locum interview form she opens herself.
export default function LocumReviewTabs({ name, canReview, reviews, api }: { name: string; canReview: boolean; reviews: ReactNode; api: (action: string, body?: unknown) => Promise<any> }) {
  const [tab, setTab] = useState<'locum' | 'reviews'>(canReview ? 'reviews' : 'locum');
  return <div>
    {canReview && <div role="tablist" aria-label="Performance review" className="m-4 mb-0 inline-flex rounded-xl bg-slate-100 p-1">{([['reviews', 'Reviews'], ['locum', 'Locum interview']] as const).map(([id, label]) =>
      <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${tab === id ? 'bg-white text-[#0b587b] shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>}
    {tab === 'reviews' && canReview ? reviews : <div className="p-4"><LocumInterview interviewer={name} api={api} /></div>}
  </div>;
}
