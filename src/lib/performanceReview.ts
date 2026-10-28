import { officeFetch } from './officeApi';

// The monthly Performance Assessment Review form: four areas, each rated 1 to 4 and
// weighted. The server works the score out again, so this is only for the live total.
export const AREAS = [
  { key: 'jobKnowledge', label: 'Job Knowledge', weight: 30, criteria: ['Ability to execute assigned tasks successfully', 'Demonstrates strong knowledge of the job / tasks / product', 'Able to guide others on the job', 'Ability to solve problems proactively'] },
  { key: 'qualityOfWork', label: 'Quality of Work', weight: 25, criteria: ['Consistently produces high quality work / output', 'Meticulous and detailed in accomplishing the task', 'Able to identify potential issues early', 'Able to identify areas for improvement proactively'] },
  { key: 'attendance', label: 'Attendance & Punctuality', weight: 25, criteria: ['Ability to maintain consistent attendance', 'Demonstrates punctuality in reporting to work and scheduled duties', 'Adheres to assigned working hours and attendance requirements', 'Demonstrates responsibility in notifying lateness, absence or leave'] },
  { key: 'behaviour', label: 'Behaviour / Attitude', weight: 20, criteria: ['Able to work as a team and adds to the team\'s strength', 'Transparent and high work ethics in discharging work', 'Takes initiative and strives for excellence', 'Conscious of cost and profitability'] },
] as const;

export const LEVELS = [
  { value: 4, label: 'Exceeded Expectations', short: 'Exceeded', range: '3.50 – 4.00', note: 'Consistently exceeds performance standards', dot: 'bg-[#92d050]', on: 'border-[#6fb12f] bg-[#92d050] text-[#1d3a05]' },
  { value: 3, label: 'Successfully Meet Expectations', short: 'Successfully meet', range: '3.00 – 3.49', note: 'Meets and often exceeds performance standards', dot: 'bg-[#00b0f0]', on: 'border-[#0090c8] bg-[#00b0f0] text-white' },
  { value: 2, label: 'Partially Meet Expectations', short: 'Partially meet', range: '2.00 – 2.99', note: 'Meets but often falls short of performance standards', dot: 'bg-[#ffc000]', on: 'border-[#d99e00] bg-[#ffc000] text-[#4a3500]' },
  { value: 1, label: 'Did Not Meet Expectations', short: 'Did not meet', range: '1.00 – 1.99', note: 'Does not meet; significant improvement needed', dot: 'bg-[#ff3b30]', on: 'border-[#d92a20] bg-[#ff3b30] text-white' },
] as const;

export const overallLabel = (score: number) => score >= 3.5 ? LEVELS[0].label : score >= 3 ? LEVELS[1].label : score >= 2 ? LEVELS[2].label : LEVELS[3].label;
export const scoreTone = (score: number | null) => score === null ? 'bg-slate-100 text-slate-500' : score >= 3.5 ? 'bg-emerald-50 text-emerald-700' : score >= 3 ? 'bg-sky-50 text-sky-700' : score >= 2 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700';

// Every criterion is rated 1 to 4. An area scores the average of its four criteria; the total is
// the areas' scores weighted by the form's percentages. The server works it out again.
export type Ratings = Record<string, (number | null)[]>;
export const areaScore = (ratings: Ratings, key: string) => {
  const values = ratings[key] || [];
  return values.length === 4 && values.every((value) => value) ? values.reduce((sum, value) => sum + (value as number), 0) / 4 : null;
};
export function totalScore(ratings: Ratings) {
  const scores = AREAS.map((area) => areaScore(ratings, area.key));
  if (scores.some((score) => score === null)) return null;
  return Math.round(AREAS.reduce((sum, area, index) => sum + (area.weight / 100) * (scores[index] as number), 0) * 100) / 100;
}

// The percentage of the form's 100% that the score earns: 4.00 is 100%, 3.35 is 83.75%.
export const percentOf = (score: number | null) => score === null ? null : Math.round(score * 2500) / 100;
export const percentLabel = (score: number | null) => { const value = percentOf(score); return value === null ? '—' : `${value.toFixed(2).replace(/\.?0+$/, '')}%`; };

export type ReviewSummary = { id: string; status: 'pending' | 'submitted'; staffName: string; employeeCode: string; position: string; department: string; assessorName: string; periodLabel: string; periodStart: string | null; periodEnd: string | null; assignRemarks: string; totalScore: number | null; overall: string | null; pip: 'required' | 'not_required'; hrReceivedOn: string | null; createdAt: string; submittedAt: string | null };
export type ReviewFull = ReviewSummary & { ratings: Record<string, number[]>; improvement: string; training: string; employeeComments: string; pipRemarks: string; pipStart: string | null; hodName: string; hrReceivedBy: string; hrRemarks: string };

export async function reviewApi(query: string, body?: unknown) {
  const response = await officeFetch(`/api/status?resource=review&${query}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Unable to reach Performance Review.'), { status: response.status });
  return result;
}

export const dmy = (date: string | null) => date ? date.split('-').reverse().join('/') : '—';
