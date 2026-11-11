import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { assessmentFetch } from './AssessmentRoom';
import { CareReviewPage } from './CareReviewUI';

// The COO's check of the AraCare claims, from the Individual Sign In.
export default function CareApprovals() {
  const [error, setError] = useState('');
  return <div className="space-y-3">
    {error && <div className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    <CareReviewPage load={() => assessmentFetch('action=care_review_list')} review={(payload) => assessmentFetch('action=care_review', { method: 'POST', body: JSON.stringify(payload) })} onError={setError} />
  </div>;
}
