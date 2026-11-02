import { newCode } from './shiftCodes';
export type DraftPerson = { id: string; company: string; code: string; name: string; designation: string };
export type DraftDay = { id: string; date: string; shift: string };
export type DraftLeave = { id: string; start: string; end: string; shift: string; halfDay: boolean };
export type Pattern = { enabled: boolean; anchor: string; cycle: string; doctorMode?: 'sample' | 'rotation' | 'office'; weekdayOff?: number; nightWeeks?: string; nightPlacement?: 'before-off' | 'mon-tue' };
export type DraftRequest = { id: string; date: string; shift: string; required: boolean };
export type DraftCell = DraftDay & { source: 'pattern' | 'existing' | 'locked' | 'leave' | 'request'; locked: boolean };
export const draftShifts = ['AM', 'AM-9', 'AM-12', 'AM-6', 'AM-5', 'OH', 'PM', 'OFF', 'REST', 'AL', 'MC', 'ML', 'UPL', 'EL', 'PH', 'NA', 'RESIGN'];
export const patternShifts = draftShifts.filter((s) => ['AM', 'AM-9', 'AM-12', 'AM-6', 'AM-5', 'OH', 'PM', 'OFF', 'REST'].includes(s));
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const monthDates = (month: string) => Array.from({ length: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
export const cellKey = (id: string, date: string) => `${id}|${date}`;
export const cycleCodes = (cycle: string) => cycle.toUpperCase().split(/[\s,;]+/).filter(Boolean).map(newCode);
export const workingShift = (shift: string) => ['AM', 'AM-9', 'AM-12', 'AM-6', 'AM-5', 'OH', 'PM'].includes(newCode(shift));
export const dayShift = (shift: string) => workingShift(shift) && newCode(shift) !== 'PM';
export const isDraftDoctor = (person: DraftPerson) => /\b(DR|DOCTOR)\b/i.test(person.designation);
const monday = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
export function doctorWeeklyShift(pattern: Pattern, date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return 'OFF';
  if (pattern.doctorMode === 'office') return 'OH';
  const quotas = (pattern.nightWeeks || '').split(',').map((v) => Number(v.trim()));
  const week = Math.round((Date.parse(`${monday(date)}T00:00:00Z`) - Date.parse(`${monday(pattern.anchor)}T00:00:00Z`)) / (7 * 86400000));
  const nights = quotas[((week % quotas.length) + quotas.length) % quotas.length];
  if (pattern.nightPlacement === 'mon-tue') {
    // Monday is preferred for one night; take the weekday OFF after the final PM.
    if (weekday === (nights === 2 ? 3 : 2)) return 'OFF';
    return weekday <= nights ? 'PM' : 'AM';
  }
  if (weekday === pattern.weekdayOff) return 'OFF';
  // Prefer nights before the weekday OFF and weekend, keeping recovery days after PM.
  const workdays = [1, 2, 3, 4, 5].filter((day) => day !== pattern.weekdayOff);
  const beforeOff = pattern.weekdayOff === 1 ? 5 : pattern.weekdayOff! - 1;
  const priorities = [...new Set([beforeOff, ...workdays.slice().reverse()])];
  return priorities.slice(0, nights).includes(weekday) ? 'PM' : 'AM';
}
export function generateRosterDraft(input: { month: string; people: DraftPerson[]; patterns: Record<string, Pattern>; existing: DraftDay[]; leave: DraftLeave[]; requests: DraftRequest[]; locks: Record<string, string>; preserve: boolean; minDay: number; minNight: number }) {
  const { month, people, patterns, existing, leave, requests, locks, preserve, minDay, minNight } = input;
  const dates = monthDates(month), cells: DraftCell[] = [], warnings: string[] = [], locum: { company: string; date: string; shift: 'PM'; missing: number }[] = [];
  const countsDay = (id: string, shift: string) => { const person = people.find((p) => p.id === id); return person && isDraftDoctor(person) ? shift === 'AM' : dayShift(shift); };
  const locumNight = (person: DraftPerson) => person.company === 'KJ' && isDraftDoctor(person);
  const existingMap = new Map(existing.map((d) => [cellKey(d.id, d.date), newCode(d.shift)]));
  for (const person of people) {
    const pattern = patterns[person.id]; if (!pattern?.enabled) continue;
    const cycle = cycleCodes(pattern.cycle);
    const weekly = person.company === 'KJ' && isDraftDoctor(person) && ['rotation', 'office'].includes(pattern.doctorMode || '');
    if (weekly && pattern.doctorMode === 'rotation' && (pattern.nightPlacement !== 'mon-tue' && ![1, 2, 3, 4, 5].includes(pattern.weekdayOff!) || !(pattern.nightWeeks || '').split(',').every((v) => ['1', '2'].includes(v.trim())) || (pattern.nightWeeks || '').split(',').length > 8)) throw new Error(`Set a weekday OFF and a weekly night sequence of 1 or 2 for ${person.name}.`);
    if (/\b(DR|DOCTOR)\b/i.test(person.designation) && cycle.some((s) => ['AM-9', 'AM-12', 'AM-6', 'AM-5'].includes(s))) throw new Error(`Use AM, PM or OH for doctor ${person.name}.`);
    if ((!weekly && (!cycle.length || cycle.length > 28 || cycle.some((s) => !patternShifts.includes(s)))) || !/^\d{4}-\d{2}-\d{2}$/.test(pattern.anchor) || (!Number.isFinite(Date.parse(`${pattern.anchor}T00:00:00Z`)) || new Date(`${pattern.anchor}T00:00:00Z`).toISOString().slice(0, 10) !== pattern.anchor)) throw new Error(`Check pattern for ${person.name}: use 1–28 working/OFF/REST shift codes and a start date; leave and holidays must not repeat.`);
    for (const date of dates) {
      const key = cellKey(person.id, date), offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${pattern.anchor}T00:00:00Z`)) / 86400000);
      let shift = weekly ? doctorWeeklyShift(pattern, date) : cycle[((offset % cycle.length) + cycle.length) % cycle.length], source: DraftCell['source'] = 'pattern', locked = false;
      if (preserve && existingMap.has(key)) { shift = existingMap.get(key)!; source = 'existing'; locked = true; }
      if (locks[key] !== undefined && (!preserve || !existingMap.has(key))) { shift = locks[key]; source = 'locked'; locked = true; }
      else if (locks[key] !== undefined && locks[key] !== shift) warnings.push(`${date} · ${person.name}: draft edit conflicts with protected existing roster (${shift}).`);
      const approved = leave.filter((l) => l.id === person.id && l.start <= date && l.end >= date);
      if (approved.length) {
        if (approved.some((l) => l.halfDay)) warnings.push(`${date} · ${person.name}: approved half-day leave needs manual review; draft export is blocked.`);
        else if (workingShift(shift)) {
          const leaveCode = approved[0].shift === 'UL' ? 'UPL' : newCode(approved[0].shift);
          if (['AL', 'MC', 'ML', 'UPL', 'EL'].includes(leaveCode)) { shift = leaveCode; source = 'leave'; }
          else warnings.push(`${date} · ${person.name}: approved ${approved[0].shift} leave needs manual review; draft export is blocked.`);
          locked = true;
        }
        // OFF/REST remain rest days; leave does not turn these into working days.
        locked = true;
      }
      cells.push({ id: person.id, date, shift, source, locked });
    }
  }
  const byKey = new Map(cells.map((c) => [cellKey(c.id, c.date), c]));
  for (const request of [...requests].sort((a, b) => Number(b.required) - Number(a.required))) {
    const cell = byKey.get(cellKey(request.id, request.date)), person = people.find((p) => p.id === request.id);
    if (!cell || !person) { warnings.push(`${request.date}: request is outside the generated staff/month selection.`); continue; }
    const shift = newCode(request.shift);
    if (!draftShifts.includes(shift)) throw new Error('Select a valid request shift.');
    const doctorPattern = patterns[person.id];
    if (person.company === 'KJ' && isDraftDoctor(person) && ['rotation', 'office'].includes(doctorPattern?.doctorMode || '')) {
      const weekend = [0, 6].includes(new Date(`${cell.date}T00:00:00Z`).getUTCDay());
      if (weekend && shift !== 'OFF' || doctorPattern.doctorMode === 'office' && ['AM', 'PM'].includes(shift) || doctorPattern.doctorMode === 'rotation' && shift === 'OH') { warnings.push(`${request.date} · ${person.name}: request ${shift} conflicts with the fixed doctor rules.`); continue; }
    }
    if (cell.shift === shift) continue;
    if (cell.locked) { warnings.push(`${request.date} · ${person.name}: request ${shift} conflicts with a protected day (${cell.shift}).`); continue; }
    const sameClinic = new Set(people.filter((p) => p.company === person.company).map((p) => p.id));
    const colleagues = cells.filter((c) => c.date === request.date && sameClinic.has(c.id) && c.id !== cell.id);
    if (!request.required && (countsDay(cell.id, cell.shift) && !countsDay(cell.id, shift) && colleagues.filter((c) => countsDay(c.id, c.shift)).length < minDay || !locumNight(person) && cell.shift === 'PM' && shift !== 'PM' && colleagues.filter((c) => c.shift === 'PM').length < minNight)) {
      warnings.push(`${request.date} · ${person.name}: preference ${shift} could not be met because coverage would be short.`); continue;
    }
    cell.shift = shift; cell.source = 'request'; cell.locked = request.required;
  }
  for (const person of people.filter((p) => p.company === 'KJ' && isDraftDoctor(p) && patterns[p.id]?.enabled)) {
    const pattern = patterns[person.id];
    if (!['rotation', 'office'].includes(pattern.doctorMode || '')) continue;
    for (const cell of cells.filter((c) => c.id === person.id)) {
      const weekend = [0, 6].includes(new Date(`${cell.date}T00:00:00Z`).getUTCDay());
      if (pattern.doctorMode === 'rotation' && pattern.nightPlacement === 'mon-tue' && (cell.shift === 'PM' || doctorWeeklyShift(pattern, cell.date) === 'PM') && cell.shift !== doctorWeeklyShift(pattern, cell.date)) warnings.push(`${cell.date} · ${person.name}: leave, request or protected cell differs from preferred Monday/Tuesday nights.`);
      if (weekend && cell.shift !== 'OFF' || pattern.doctorMode === 'office' && ['AM', 'PM'].includes(cell.shift) || pattern.doctorMode === 'rotation' && cell.shift === 'OH') warnings.push(`${cell.date} · ${person.name}: protected/edit cell breaks fixed doctor rules; draft export is blocked.`);
    }
    if (pattern.doctorMode === 'rotation') for (const date of dates.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1 && addDays(d, 4) <= dates[dates.length - 1])) {
      const weekCells = cells.filter((c) => c.id === person.id && c.date >= date && c.date <= addDays(date, 4));
      const expectedNight = [0, 1, 2, 3, 4].filter((n) => doctorWeeklyShift(pattern, addDays(date, n)) === 'PM').length;
      const am = weekCells.filter((c) => c.shift === 'AM').length, pm = weekCells.filter((c) => c.shift === 'PM').length;
      if (am !== 4 - expectedNight || pm !== expectedNight) warnings.push(`${date} week · ${person.name}: AM ${am}/${4 - expectedNight}, PM ${pm}/${expectedNight}; review leave, requests and protected cells.`);
    }
  }
  for (const company of [...new Set(people.filter((p) => patterns[p.id]?.enabled).map((p) => p.company))]) for (const date of dates) {
    const ids = new Set(people.filter((p) => p.company === company).map((p) => p.id));
    const scheduled = cells.filter((c) => c.date === date && ids.has(c.id));
    const days = scheduled.filter((c) => countsDay(c.id, c.shift)).length, nights = scheduled.filter((c) => c.shift === 'PM').length;
    const usesLocum = people.filter((p) => p.company === company && patterns[p.id]?.enabled).every(locumNight);
    if (usesLocum && nights < minNight) locum.push({ company, date, shift: 'PM', missing: minNight - nights });
    if (days < minDay || !usesLocum && nights < minNight) warnings.push(`${date} · ${company}: coverage day ${days}/${minDay}${usesLocum ? '' : `, night ${nights}/${minNight}`}.`);
  }
  for (const person of people.filter((p) => patterns[p.id]?.enabled)) {
    let run = 0, previous = '';
    for (let offset = -7; offset < dates.length; offset++) {
      const date = addDays(dates[0], offset), shift = offset < 0 ? existingMap.get(cellKey(person.id, date)) || '' : byKey.get(cellKey(person.id, date))?.shift || '';
      run = workingShift(shift) ? run + 1 : 0;
      if (offset >= 0 && previous === 'PM' && dayShift(shift)) warnings.push(`${date} · ${person.name}: night-to-day transition; check recovery time.`);
      if (offset >= 0 && run >= 7 && (run === 7 || offset === 0)) warnings.push(`${date} · ${person.name}: ${run} consecutive working days; review rest days.`);
      previous = shift;
    }
  }
  return { cells, locum, warnings: [...new Set(warnings)], blocked: warnings.some((w) => w.includes('draft export is blocked')) };
}
