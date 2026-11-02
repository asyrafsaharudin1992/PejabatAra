import { defaultReviewSettings, type ReviewSettings } from './reviewSettings.js';

export type ReminderPerson = { id: string; company: string; employeeCode: string; fullName: string; joinDate: string | null; status: string };
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

export function buildReviewReminders(people: ReminderPerson[], reviews: ReminderReview[], custom: CustomReminder[], today = malaysiaToday(), settings: ReviewSettings = defaultReviewSettings()): ReviewReminder[] {
  const result: ReviewReminder[] = [];
  const active = new Map(people.filter((person) => person.status === 'Active').map((person) => [person.id, person]));
  const append = (person: ReminderPerson, item: CustomReminder, source: ReviewReminder['source'], periodStart: string | null, previousLabels: string[] = [], recurringInterval = 0) => {
    const match = reviews.filter((review) => (review.employeeId ? review.employeeId === person.id : review.employeeCode === person.employeeCode && review.staffName === person.fullName) && [item.periodLabel, ...previousLabels].some((label) => labelKey(review.periodLabel) === labelKey(label)) && (review.periodEnd === item.dueOn || source === 'automatic' && !review.periodEnd && (recurringInterval === 0 || recurringInterval >= 12 && review.submittedAt?.slice(0, 4) === item.dueOn.slice(0, 4))))
      .sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted'))[0];
    const daysUntil = daysBetween(today, item.dueOn);
    const status = item.cancelledAt ? 'cancelled' : item.completedAt || match?.status === 'submitted' ? 'completed' : match?.status === 'pending' ? 'assigned' : daysUntil < 0 ? 'overdue' : daysUntil <= settings.leadDays ? 'due' : 'upcoming';
    result.push({ ...item, source, fullName: person.fullName, employeeCode: person.employeeCode, company: person.company, periodStart, daysUntil, status, reviewId: match?.id || null });
  };
  for (const item of custom) {
    const person = active.get(item.employeeId);
    if (person) append(person, item, 'custom', person.joinDate);
  }
  if (settings.automaticEnabled) for (const person of active.values()) {
    if (!person.joinDate || !validReminderDate(person.joinDate)) continue;
    const milestones = settings.milestones.filter((rule) => rule.enabled).map((rule) => ({ months: rule.months, periodLabel: rule.label, key: rule.id, previousLabels: rule.previousLabels || [], interval: 0 }));
    if (settings.recurringEnabled) {
      const elapsed = (Number(today.slice(0, 4)) - Number(person.joinDate.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(person.joinDate.slice(5, 7));
      const firstIndex = Math.max(0, Math.floor((elapsed - Math.ceil(settings.lookBackDays / 28) - settings.recurringStartMonths) / settings.recurringEveryMonths) - 1);
      const lastIndex = Math.max(0, Math.ceil((elapsed + Math.ceil(settings.lookAheadDays / 28) - settings.recurringStartMonths) / settings.recurringEveryMonths) + 1);
      for (let index = firstIndex; index <= lastIndex; index++) milestones.push({ months: settings.recurringStartMonths + index * settings.recurringEveryMonths, periodLabel: settings.recurringLabel, key: 'recurring', previousLabels: settings.recurringPreviousLabels || [], interval: settings.recurringEveryMonths });
    }
    const seen = new Set<string>();
    for (const { months, periodLabel, key, previousLabels, interval } of milestones) {
      const dueOn = addReviewMonths(person.joinDate, months);
      const days = daysBetween(today, dueOn);
      // Avoid labelling years of unimported review history as overdue.
      if (days < -settings.lookBackDays || days > settings.lookAheadDays) continue;
      const unique = `${dueOn}:${labelKey(periodLabel)}`;
      if (seen.has(unique)) continue;
      seen.add(unique);
      if (custom.some((item) => item.employeeId === person.id && item.dueOn === dueOn && [periodLabel, ...previousLabels].some((label) => labelKey(item.periodLabel) === labelKey(label)))) continue;
      append(person, { id: `auto:${person.id}:${key}:${dueOn}`, employeeId: person.id, periodLabel, dueOn, notes: '', completedAt: null, cancelledAt: null }, 'automatic', interval ? addReviewMonths(person.joinDate, Math.max(0, months - interval)) : person.joinDate, previousLabels, interval);
    }
  }
  return result.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.fullName.localeCompare(b.fullName));
}
