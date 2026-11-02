import { calendarMonthEnd, isCalendarCa, type CalendarPerson, type ProbationState } from './hrCalendar.js';
import { validReminderDate } from './reviewReminders.js';
export type ProjectionPerson = CalendarPerson & { employmentType: string; status: string; resignDate: string | null };
export type ProjectionStatus = 'permanent' | 'probation' | 'contract' | 'locum' | 'intern' | 'resigned' | 'unknown';
export const projectionLabels: Record<ProjectionStatus, string> = { permanent: 'Permanent', probation: 'Probation', contract: 'Contract / Part-time', locum: 'Locum', intern: 'Intern', resigned: 'Resigned', unknown: 'Needs verification' };
export const projectionTones: Record<ProjectionStatus, string> = { permanent: 'bg-orange-100 text-orange-950', probation: 'bg-fuchsia-100 text-fuchsia-950', contract: 'bg-lime-100 text-lime-950', locum: 'bg-slate-200 text-slate-800', intern: 'bg-sky-100 text-sky-950', resigned: 'bg-yellow-100 text-yellow-950', unknown: 'bg-white text-slate-500' };
export function projectionCell(person: ProjectionPerson, month: string, probation: Record<string, ProbationState>): { status: ProjectionStatus; notes: string[] } | null {
  const start = `${month}-01`, end = calendarMonthEnd(month);
  if (!person.joinDate || person.joinDate > end || person.resignDate && person.resignDate < start || person.status !== 'Active' && !person.resignDate) return null;
  const notes: string[] = [];
  if (person.joinDate >= start) notes.push(`Join ${Number(person.joinDate.slice(8))}/${Number(person.joinDate.slice(5, 7))}`);
  if (person.resignDate && person.resignDate <= end) return { status: 'resigned', notes: [...notes, `Last ${Number(person.resignDate.slice(8))}/${Number(person.resignDate.slice(5, 7))}`] };
  if (person.confirmDate && person.confirmDate <= end) {
    if (person.confirmDate >= start) notes.push(`Confirm ${Number(person.confirmDate.slice(8))}/${Number(person.confirmDate.slice(5, 7))}`);
  } else if (person.confirmDate || probation[person.id] === 'probation') return { status: 'probation', notes };
  else if (!probation[person.id]) return { status: 'unknown', notes };
  const type = person.employmentType;
  return { status: type === 'Permanent' ? person.confirmDate ? 'permanent' : 'unknown' : type === 'Locum' ? 'locum' : type === 'Intern' ? 'intern' : ['Contract', 'Part-time'].includes(type) ? 'contract' : 'unknown', notes };
}
export const isProjectionCa = (p: ProjectionPerson) => isCalendarCa(p);
export type ProjectionOverride = { status: ProjectionStatus | 'absent'; note: string; company?: string; startsOn?: string; endsOn?: string };
export type ProjectionPlan = { rows: { id: string; name: string; company: string }[]; cells: Record<string, ProjectionOverride> };
export const emptyProjectionPlan = (): ProjectionPlan => ({ rows: [], cells: {} });
export const shiftProjectionMonth = (month: string, amount: number) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 7); };
export const projectionMonths = (from: string, until: string) => {
  const months: string[] = [];
  for (let month = from; month <= until && months.length < 12; month = shiftProjectionMonth(month, 1)) months.push(month);
  return months;
};
export function projectionPlanForYear(plan: ProjectionPlan, year: string): ProjectionPlan {
  const cells = Object.fromEntries(Object.entries(plan.cells).filter(([key]) => key.slice(-7, -3) === year));
  const referenced = new Set(Object.keys(cells).map((key) => key.slice(0, key.lastIndexOf(':'))));
  return { rows: plan.rows.filter((row) => referenced.has(row.id)), cells };
}
export function mergeProjectionPlans(plans: Record<string, ProjectionPlan>): ProjectionPlan {
  return { rows: [...new Map(Object.values(plans).flatMap((p) => p.rows).map((r) => [r.id, r])).values()], cells: Object.assign({}, ...Object.values(plans).map((p) => p.cells)) };
}
export function applyProjectionRange(plan: ProjectionPlan, id: string, from: string, until: string, cell: ProjectionOverride, onlyWithin = false): ProjectionPlan {
  if (!validReminderDate(from) || !validReminderDate(until) || from > until || Number(until.slice(0, 4)) - Number(from.slice(0, 4)) > 1) throw new Error('Choose an ordered date range within the displayed years.');
  const cells = { ...plan.cells };
  if (cell.status === 'resigned') for (const key of Object.keys(cells)) {
    if (key.startsWith(`${id}:`) && key.slice(-7) > until.slice(0, 7)) delete cells[key];
  }
  if (onlyWithin) for (let year = Number(from.slice(0, 4)); year <= Number(until.slice(0, 4)); year++) for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`;
    if (month < from.slice(0, 7) || month > until.slice(0, 7)) cells[`${id}:${month}`] = { status: 'absent', note: '' };
  }
  for (let month = from.slice(0, 7); month <= until.slice(0, 7); month = shiftProjectionMonth(month, 1)) cells[`${id}:${month}`] = { ...cell, startsOn: from, endsOn: until };
  return { ...plan, cells };
}
export function validateProjectionPlan(value: any, year: string, ids: string[]): ProjectionPlan {
  if (!value || !Array.isArray(value.rows) || value.rows.length > 40 || !value.cells || typeof value.cells !== 'object' || Array.isArray(value.cells) || Object.keys(value.cells).length > 6000) throw new Error('Enter a valid projection (up to 40 planned staff).');
  const rows = value.rows.map((r: any) => {
    if (!r || typeof r.id !== 'string' || !/^planned-[a-zA-Z0-9-]{1,80}$/.test(r.id) || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 100 || !['KJ', 'SK'].includes(r.company)) throw new Error('Each planned staff member needs a name and branch.');
    return { id: r.id, name: r.name.trim(), company: r.company };
  });
  if (new Set(rows.map((r: any) => r.id)).size !== rows.length) throw new Error('Duplicate planned staff member.');
  const allowed = new Set([...ids, ...rows.map((r: any) => r.id)]);
  const cells: ProjectionPlan['cells'] = {};
  for (const [key, cell] of Object.entries(value.cells) as [string, any][]) {
    const split = key.lastIndexOf(':');
    if (!allowed.has(key.slice(0, split)) || !new RegExp(`^${year}-(0[1-9]|1[0-2])$`).test(key.slice(split + 1)) || !cell || ![...Object.keys(projectionLabels), 'absent'].includes(cell.status) || typeof cell.note !== 'string' || cell.note.length > 100) throw new Error('Choose a valid staff member, month, status and note (100 characters maximum).');
    if (cell.company !== undefined && !['KJ', 'SK'].includes(cell.company)) throw new Error('Select KJ or SK for a forecast placement.');
    if (cell.startsOn !== undefined || cell.endsOn !== undefined) {
      if (typeof cell.startsOn !== 'string' || typeof cell.endsOn !== 'string' || !validReminderDate(cell.startsOn) || !validReminderDate(cell.endsOn) || cell.startsOn > cell.endsOn || Number(cell.endsOn.slice(0, 4)) - Number(cell.startsOn.slice(0, 4)) > 1 || key.slice(split + 1) < cell.startsOn.slice(0, 7) || key.slice(split + 1) > cell.endsOn.slice(0, 7)) throw new Error('Forecast dates must match the edited months.');
    }
    cells[key] = { status: cell.status, note: cell.note.trim(), ...(cell.company ? { company: cell.company } : {}), ...(cell.startsOn ? { startsOn: cell.startsOn, endsOn: cell.endsOn } : {}) };
  }
  return { rows, cells };
}
