import { addReviewMonths, malaysiaToday, validReminderDate } from './reviewReminders';
export type CalendarCategory = 'payroll' | 'probation' | 'evaluation' | 'review' | 'contract' | 'appraisal' | 'birthday' | 'other';
export const calendarCategories: Record<CalendarCategory, string> = { payroll: 'Payroll', probation: 'Probation / Confirmation', evaluation: 'CA Evaluation', review: 'Performance Review', contract: 'Contract renewal', appraisal: 'Appraisal', birthday: 'Birthday / Gift', other: 'Other' };
export type CalendarPerson = { id: string; name: string; code: string; company: string; designation: string; joinDate: string | null; confirmDate: string | null; birthday?: string | null };
export type CalendarRule = { id: string; title: string; category: CalendarCategory; employeeId: string; company: string; anchor: 'date' | 'join' | 'confirmation' | 'birthday'; date: string; offsetMonths: number; offsetDays: number; repeat: 'none' | 'monthly' | 'yearly'; every: number; notes: string; enabled: boolean };
export type CalendarSettings = { payroll: boolean; probationWeeks: boolean; probationMonths: boolean; caEvaluation: boolean; appraisal: boolean; birthdays: boolean };
export type CalendarConfig = { settings: CalendarSettings; rules: CalendarRule[] };
export type CalendarOccurrence = { state: 'done' | 'skipped'; at: string; by: string };
export type CalendarEvent = { id: string; title: string; category: CalendarCategory; date: string; start: string; employeeId: string; person: string; company: string; notes: string; source: 'automatic' | 'manual' | 'review'; ruleId?: string; reviewId?: string; reviewDone?: boolean; state: 'open' | 'done' | 'skipped' | 'assigned' };
export type CalendarReview = { id: string; employeeId: string; label: string; due: string; status: string };
export const defaultCalendarConfig = (): CalendarConfig => ({ settings: { payroll: true, probationWeeks: true, probationMonths: true, caEvaluation: true, appraisal: true, birthdays: true }, rules: [] });
export const shiftCalendarDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const calendarMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2200;
export const calendarMonthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
export const isCalendarCa = (person: CalendarPerson) => /^(CLINIC ASSISTANT(?:\s*\([^)]*\))?|PEMBANTU KLINIK)$/i.test(person.designation.trim());
const integer = (value: unknown, min: number, max: number, label: string) => { if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label}: enter a whole number from ${min} to ${max}.`); return value; };
export function validateCalendarRule(input: unknown): CalendarRule {
  const rule = input as CalendarRule;
  if (!rule || typeof rule !== 'object' || !/^[a-zA-Z0-9-]{1,80}$/.test(rule.id || '')) throw new Error('Enter a valid reminder ID.');
  if (typeof rule.title !== 'string' || !rule.title.trim() || rule.title.trim().length > 160) throw new Error('Enter a title with 1–160 characters.');
  if (!Object.hasOwn(calendarCategories, rule.category)) throw new Error('Choose a reminder category.');
  if (!['date', 'join', 'confirmation', 'birthday'].includes(rule.anchor) || !['none', 'monthly', 'yearly'].includes(rule.repeat)) throw new Error('Choose a reminder date and repeat schedule.');
  if (rule.anchor === 'birthday' && rule.repeat !== 'yearly') throw new Error('Birthday-based reminders must repeat yearly.');
  if (rule.anchor === 'date' && !validReminderDate(rule.date)) throw new Error('Enter a valid date.');
  if (typeof rule.employeeId !== 'string' || rule.employeeId && !/^[a-zA-Z0-9-]{1,80}$/.test(rule.employeeId) || rule.anchor !== 'date' && !rule.employeeId) throw new Error('Select a staff member for a staff-based date.');
  if (!['', 'KJ', 'SK'].includes(rule.company) || typeof rule.enabled !== 'boolean' || typeof rule.notes !== 'string' || rule.notes.length > 2000) throw new Error('Check the clinic, notes and enabled setting.');
  return { id: rule.id, title: rule.title.trim(), category: rule.category, employeeId: rule.employeeId, company: rule.company, anchor: rule.anchor, date: rule.anchor === 'date' ? rule.date : '', offsetMonths: integer(rule.offsetMonths, 0, 120, 'Months after base date'), offsetDays: integer(rule.offsetDays, -365, 365, 'Days from base date'), repeat: rule.repeat, every: integer(rule.every, 1, 24, 'Repeat interval'), notes: rule.notes.trim(), enabled: rule.enabled };
}
export function validateCalendarSettings(input: unknown): CalendarSettings {
  const value = input as CalendarSettings;
  if (!value || ['payroll', 'probationWeeks', 'probationMonths', 'caEvaluation', 'appraisal', 'birthdays'].some((key) => typeof value[key] !== 'boolean')) throw new Error('Check the automatic reminder settings.');
  return { payroll: value.payroll, probationWeeks: value.probationWeeks, probationMonths: value.probationMonths, caEvaluation: value.caEvaluation, appraisal: value.appraisal, birthdays: value.birthdays };
}
function recurringDates(first: string, month: string, intervalMonths: number): string[] {
  if (!validReminderDate(first)) return [];
  if (!intervalMonths) return first.slice(0, 7) === month ? [first] : [];
  const elapsed = (Number(month.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(month.slice(5)) - Number(first.slice(5, 7));
  if (elapsed < 0 || elapsed % intervalMonths !== 0) return [];
  return [addReviewMonths(first, elapsed)];
}
function ruleDates(rule: CalendarRule, base: string, month: string): string[] {
  const interval = rule.repeat === 'monthly' ? rule.every : rule.repeat === 'yearly' ? rule.every * 12 : 0;
  if (!interval) {
    const due = shiftCalendarDays(addReviewMonths(base, rule.offsetMonths), rule.offsetDays);
    return due.slice(0, 7) === month ? [due] : [];
  }
  const elapsed = (Number(month.slice(0, 4)) - Number(base.slice(0, 4))) * 12 + Number(month.slice(5)) - Number(base.slice(5, 7)) - rule.offsetMonths;
  const centre = Math.floor(elapsed / interval);
  const radius = Math.ceil(Math.abs(rule.offsetDays) / 28 / interval) + 2;
  const dates: string[] = [];
  for (let index = Math.max(0, centre - radius); index <= centre + radius; index++) {
    // Reapply offsets to the original anniversary, avoiding leap-year/month-end drift.
    const due = shiftCalendarDays(addReviewMonths(base, rule.offsetMonths + index * interval), rule.offsetDays);
    if (due.slice(0, 7) === month) dates.push(due);
  }
  return [...new Set(dates)];
}
export function buildHrCalendar(month: string, people: CalendarPerson[], config: CalendarConfig, states: Record<string, CalendarOccurrence> = {}, reviews: CalendarReview[] = []): { events: CalendarEvent[]; missingDates: string[] } {
  if (!calendarMonth(month)) throw new Error('Choose a valid calendar month.');
  const events: CalendarEvent[] = [], missingDates: string[] = [];
  const active = new Map(people.map((p) => [p.id, p]));
  const add = (event: Omit<CalendarEvent, 'id' | 'state'>, key: string) => {
    if (event.date.slice(0, 7) !== month) return;
    const id = `${key}:${event.date}`;
    events.push({ ...event, id, state: event.reviewDone ? 'done' : states[id]?.state || (event.reviewId ? 'assigned' : 'open') });
  };
  if (config.settings.payroll) add({ title: 'Prepare and finalise payroll', category: 'payroll', start: `${month}-20`, date: `${month}-23`, employeeId: '', person: '', company: '', notes: 'Monthly payroll window: 20–23. Mark Done when HR has completed this month’s payroll work.', source: 'automatic' }, 'payroll');
  const matchedReviews = new Set<string>();
  for (const person of people) {
    const base = { employeeId: person.id, person: person.name, company: person.company, source: 'automatic' as const };
    if (config.settings.birthdays) {
      if (person.birthday && validReminderDate(person.birthday)) {
        const months = (Number(month.slice(0, 4)) - Number(person.birthday.slice(0, 4))) * 12;
        if (months >= 0) {
          const due = addReviewMonths(person.birthday, months);
          add({ ...base, title: 'Staff birthday · plan gift', start: due, date: due, category: 'birthday', notes: 'Birthday reminder from Staff Profile. Add a separate birthday-based reminder with negative days if the gift should be purchased earlier.' }, `birthday:${person.id}`);
        }
      } else missingDates.push(`${person.name}: birthday is missing in Staff Profile.`);
    }
    if (config.settings.appraisal) {
      if (person.confirmDate && validReminderDate(person.confirmDate)) {
        for (const due of recurringDates(person.confirmDate, month, 12).filter((date) => date > person.confirmDate!)) {
          const match = reviews.filter((r) => r.employeeId === person.id && r.due === due && /annual|appraisal|yearly|tahunan/i.test(r.label)).sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted'))[0];
          if (match) matchedReviews.add(match.id);
          add({ ...base, title: 'Annual appraisal', start: due, date: due, category: 'appraisal', notes: `Yearly anniversary of confirmation (${person.confirmDate}). The confirmation date remains the anchor even after later appraisals.`, reviewId: match?.id, reviewDone: match?.status === 'submitted' }, `appraisal:${person.id}`);
        }
      } else missingDates.push(`${person.name}: confirmation date is missing for annual appraisal.`);
    }
    if (!person.joinDate || !validReminderDate(person.joinDate)) {
      if (config.settings.probationWeeks || config.settings.probationMonths || config.settings.caEvaluation && isCalendarCa(person)) missingDates.push(`${person.name}: joining date is missing for automatic milestones.`);
      continue;
    }
    const first = shiftCalendarDays(person.joinDate, 14), third = addReviewMonths(person.joinDate, 3);
    if (config.settings.probationWeeks && !(config.settings.caEvaluation && isCalendarCa(person)) && (!person.confirmDate || person.confirmDate > first)) add({ ...base, title: '2-week probation check', start: first, date: first, category: 'probation', notes: `14 days after joining (${person.joinDate}). HR to check progress and arrange the assessment.` }, `probation-14:${person.id}`);
    if (config.settings.probationMonths && (!person.confirmDate || person.confirmDate > third)) add({ ...base, title: '3-month confirmation check', start: third, date: third, category: 'probation', notes: `3 calendar months after joining (${person.joinDate}). Check confirmation requirements; this reminder does not confirm employment.` }, `probation-3:${person.id}`);
    if (config.settings.caEvaluation && isCalendarCa(person)) for (const due of recurringDates(first, month, 1)) {
      const match = reviews.filter((r) => r.employeeId === person.id && r.due === due && /evaluation|assessment|performance|month|week|minggu|penilaian/i.test(r.label) && !/appraisal/i.test(r.label)).sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted'))[0];
      if (match) matchedReviews.add(match.id);
      add({ ...base, title: due === first ? 'First CA evaluation · 2 weeks' : 'Monthly CA evaluation', start: due, date: due, category: 'evaluation', notes: `First evaluation: ${first} (joining date + 14 days), then monthly on that anniversary. ${due === first && config.settings.probationWeeks ? 'Includes the 2-week probation check. ' : ''}A matching submitted review completes this assessment reminder.`, reviewId: match?.id, reviewDone: match?.status === 'submitted' }, `ca-evaluation:${person.id}`);
    }
  }
  for (const rule of config.rules.filter((r) => r.enabled)) {
    const person = rule.employeeId ? active.get(rule.employeeId) : undefined;
    if (rule.employeeId && !person) continue;
    const base = rule.anchor === 'date' ? rule.date : rule.anchor === 'join' ? person?.joinDate : rule.anchor === 'birthday' ? person?.birthday : person?.confirmDate;
    if (!base || !validReminderDate(base)) { missingDates.push(`${rule.title}${person ? ` · ${person.name}` : ''}: ${rule.anchor} date is missing.`); continue; }
    for (const date of ruleDates(rule, base, month)) add({ title: rule.title, category: rule.category, start: date, date, employeeId: person?.id || '', person: person?.name || '', company: person?.company || rule.company, notes: rule.notes, source: 'manual', ruleId: rule.id }, `manual:${rule.id}`);
  }
  for (const review of reviews) {
    const person = active.get(review.employeeId);
    if (!person || matchedReviews.has(review.id)) continue;
    add({ title: review.label || 'Performance review', category: 'review', start: review.due, date: review.due, employeeId: person.id, person: person.name, company: person.company, notes: 'Due date from an existing performance review. Open Performance Reviews to manage the assessment.', source: 'review', reviewId: review.id, reviewDone: review.status === 'submitted' }, `review:${review.id}`);
  }
  return { events: events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title) || a.person.localeCompare(b.person)), missingDates };
}
export const calendarEventOverdue = (event: CalendarEvent, today = malaysiaToday()) => !['done', 'skipped'].includes(event.state) && event.date < today;
