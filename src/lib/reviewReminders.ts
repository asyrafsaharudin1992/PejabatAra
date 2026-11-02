import { defaultReviewSettings, type ReviewSettings } from './reviewSettings.js';

export type ReminderPerson = { id: string; company: string; employeeCode: string; fullName: string; joinDate: string | null; status: string; confirmDate?: string | null; designation?: string; probationStatus?: string };
export type ReminderReview = { id: string; employeeId?: string | null; employeeCode: string; staffName: string; periodLabel: string; periodEnd: string | null; status: string; submittedAt: string | null };
export type CustomReminder = { id: string; employeeId: string; periodLabel: string; dueOn: string; notes: string; completedAt: string | null; cancelledAt: string | null };
export type ReviewReminder = CustomReminder & { source: 'automatic' | 'custom'; fullName: string; employeeCode: string; company: string; periodStart: string | null; status: 'upcoming' | 'due' | 'overdue' | 'assigned' | 'completed' | 'cancelled'; reviewId: string | null; daysUntil: number };

export const malaysiaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
export function validReminderDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function addReviewMonths(value: string, months: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const labelKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
export const isProbationAssessment = (label: string) => !/annual|appraisal|yearly|tahunan|\bPIP\b|follow.?up/i.test(label) && /probation|evaluation|assessment|performance|month|week|minggu|penilaian/i.test(label);
export const isCaReviewPerson = (designation = '') => /^(CLINIC ASSISTANT(?:\s*\([^)]*\))?|PEMBANTU KLINIK)$/i.test(designation.trim());
export function probationEvaluationDates(joinDate: string): string[] {
  if (!validReminderDate(joinDate)) return [];
  const first = new Date(Date.parse(`${joinDate}T00:00:00Z`) + 14 * 86400000).toISOString().slice(0, 10);
  const end = addReviewMonths(joinDate, 3);
  return [first, addReviewMonths(first, 1), addReviewMonths(first, 2)].filter((date) => date <= end);
}
export function probationAssessmentAllowed(person: { joinDate: string | null; confirmDate?: string | null }, probation: string | undefined, due: string, today = malaysiaToday()): boolean {
  return Boolean(probation === 'probation' && person.joinDate && validReminderDate(person.joinDate) && due >= person.joinDate && due <= addReviewMonths(person.joinDate, 3) && (!person.confirmDate || validReminderDate(person.confirmDate) && person.confirmDate > today && due < person.confirmDate));
}

export function buildReviewReminders(people: ReminderPerson[], reviews: ReminderReview[], custom: CustomReminder[], today = malaysiaToday(), settings: ReviewSettings = defaultReviewSettings()): ReviewReminder[] {
  const result: ReviewReminder[] = [];
  const active = new Map(people.filter((person) => person.status === 'Active').map((person) => [person.id, person]));
  const append = (person: ReminderPerson, item: CustomReminder, source: ReviewReminder['source'], periodStart: string | null, previousLabels: string[] = [], recurringInterval = 0) => {
    const match = reviews.filter((review) => (review.employeeId ? review.employeeId === person.id : review.employeeCode === person.employeeCode && review.staffName === person.fullName) && [item.periodLabel, ...previousLabels].some((label) => labelKey(review.periodLabel) === labelKey(label)) && (review.periodEnd === item.dueOn || source === 'automatic' && !review.periodEnd && (recurringInterval >= 12 && review.submittedAt?.slice(0, 4) === item.dueOn.slice(0, 4))))
      .sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted'))[0];
    const daysUntil = daysBetween(today, item.dueOn);
    const status = item.cancelledAt ? 'cancelled' : item.completedAt || match?.status === 'submitted' ? 'completed' : match?.status === 'pending' ? 'assigned' : daysUntil < 0 ? 'overdue' : daysUntil <= settings.leadDays ? 'due' : 'upcoming';
    result.push({ ...item, source, fullName: person.fullName, employeeCode: person.employeeCode, company: person.company, periodStart, daysUntil, status, reviewId: match?.id || null });
  };
  for (const item of custom) {
    const person = active.get(item.employeeId);
    if (person && !(isCaReviewPerson(person.designation) && isProbationAssessment(item.periodLabel) && !item.completedAt && !item.cancelledAt && !probationAssessmentAllowed(person, person.probationStatus, item.dueOn, today))) append(person, item, 'custom', person.joinDate);
  }
  if (settings.automaticEnabled) for (const person of active.values()) {
    const milestones: { dueOn: string; periodLabel: string; key: string; previousLabels: string[]; interval: number; periodStart: string | null; notes: string }[] = [];
    if (person.joinDate && isCaReviewPerson(person.designation)) for (const [index, dueOn] of probationEvaluationDates(person.joinDate).entries()) {
      if (probationAssessmentAllowed(person, person.probationStatus, dueOn, today)) milestones.push({ dueOn, periodLabel: index === 0 ? 'First CA evaluation · 2 weeks' : 'Monthly CA evaluation', key: 'ca-evaluation', previousLabels: index === 0 ? ['First evaluation', '2 Week', '2 Weeks'] : ['Monthly evaluation'], interval: 0, periodStart: person.joinDate, notes: 'Probation only: joining date + 14 days, then monthly, ending at 3 months from joining or earlier confirmation / probation exit.' });
    }
    if (settings.recurringEnabled && person.confirmDate && validReminderDate(person.confirmDate) && person.confirmDate <= today) {
      const firstYear = Math.max(1, Number(today.slice(0, 4)) - Number(person.confirmDate.slice(0, 4)) - Math.ceil(settings.lookBackDays / 365) - 1);
      const lastYear = Math.max(firstYear, Number(today.slice(0, 4)) - Number(person.confirmDate.slice(0, 4)) + Math.ceil(settings.lookAheadDays / 365) + 1);
      for (let year = firstYear; year <= lastYear; year++) milestones.push({ dueOn: addReviewMonths(person.confirmDate, year * 12), periodLabel: 'Annual appraisal', key: 'appraisal', previousLabels: ['Annual', 'Yearly', ...(settings.recurringPreviousLabels || []), settings.recurringLabel], interval: 12, periodStart: addReviewMonths(person.confirmDate, (year - 1) * 12), notes: `Yearly from confirmation (${person.confirmDate}).` });
    }
    const seen = new Set<string>();
    for (const { dueOn, periodLabel, key, previousLabels, interval, periodStart, notes } of milestones) {
      const days = daysBetween(today, dueOn);
      // Avoid labelling years of unimported review history as overdue.
      if (days < -settings.lookBackDays || days > settings.lookAheadDays) continue;
      const unique = `${dueOn}:${labelKey(periodLabel)}`;
      if (seen.has(unique)) continue;
      seen.add(unique);
      if (custom.some((item) => item.employeeId === person.id && item.dueOn === dueOn && [periodLabel, ...previousLabels].some((label) => labelKey(item.periodLabel) === labelKey(label)))) continue;
      append(person, { id: `auto:${person.id}:${key}:${dueOn}`, employeeId: person.id, periodLabel, dueOn, notes, completedAt: null, cancelledAt: null }, 'automatic', periodStart, previousLabels, interval);
    }
  }
  return result.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.fullName.localeCompare(b.fullName));
}
