import { newCode } from './shiftCodes';
export type DraftPerson = { id: string; company: string; code: string; name: string; designation: string; holidayGroup?: string };
export type DraftDay = { id: string; date: string; shift: string };
export type DraftLeave = { id: string; start: string; end: string; shift: string; halfDay: boolean };
export type Pattern = { enabled: boolean; anchor: string; cycle: string; doctorMode?: 'sample' | 'rotation' | 'office'; weekdayOff?: number; nightWeeks?: string; nightDays?: number[]; nightPlacement?: 'before-off' | 'mon-tue' };
// The weekdays (1 Monday ... 5 Friday) a doctor prefers for the night shift, in order of preference. 'mon-tue' is the older way of saying [1, 2].
export const preferredNights = (pattern: Pattern): number[] => pattern.nightDays?.length ? pattern.nightDays : pattern.nightPlacement === 'mon-tue' ? [1, 2] : [];
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export type DraftRequest = { id: string; date: string; shift: string; required: boolean };
export type DraftCell = DraftDay & { source: 'pattern' | 'existing' | 'locked' | 'leave' | 'request' | 'auto'; locked: boolean };
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
export const WEEKDAY_CODES: Record<string, number> = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5 };
export const DAY_CODES: Record<string, number> = { ...WEEKDAY_CODES, SAT: 6, SUN: 0 };
// A "left for a locum" rule keeps its days (MON ... SUN) and the shifts (AM, PM, OH) in one list; no shift chosen means the night (PM).
export const locumRuleDays = (rule: { shifts: string[] }) => rule.shifts.map((code) => DAY_CODES[code]).filter((day) => day !== undefined);
export const locumRuleSlots = (rule: { shifts: string[] }) => { const slots = rule.shifts.filter((code) => ['AM', 'PM', 'OH'].includes(code)); return slots.length ? slots : ['PM']; };
// avoid: weekdays (1 Monday ... 5 Friday) that must not get the night shift (left for a locum).
export function doctorWeeklyShift(pattern: Pattern, date: string, avoid: number[] = []): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return 'OFF';
  if (pattern.doctorMode === 'office') return 'OH';
  const quotas = (pattern.nightWeeks || '').split(',').map((v) => Number(v.trim()));
  const week = Math.round((Date.parse(`${monday(date)}T00:00:00Z`) - Date.parse(`${monday(pattern.anchor)}T00:00:00Z`)) / (7 * 86400000));
  const nights = quotas[((week % quotas.length) + quotas.length) % quotas.length];
  // weekdayOff 0 means "the day after the last night"; with no preferred days the nights then start on Monday.
  const autoOff = pattern.weekdayOff === 0 && pattern.nightPlacement !== 'mon-tue';
  const preferred = preferredNights(pattern).length ? preferredNights(pattern) : autoOff ? [1, 2, 3, 4, 5] : [];
  if (preferred.length) {
    // Nights go on the preferred days first (in the order given), then on other workdays. The weekday OFF is the one chosen, or the day after the last night.
    const fixedOff = pattern.nightPlacement !== 'mon-tue' && [1, 2, 3, 4, 5].includes(pattern.weekdayOff!) ? pattern.weekdayOff! : 0;
    const candidates = [...new Set([...preferred, 1, 2, 3, 4, 5])].filter((day) => day !== fixedOff && !avoid.includes(day));
    const pm = candidates.slice(0, nights);
    const off = fixedOff || (Math.max(...pm) < 5 ? Math.max(...pm) + 1 : [1, 2, 3, 4, 5].find((day) => !pm.includes(day))!);
    return weekday === off ? 'OFF' : pm.includes(weekday) ? 'PM' : 'AM';
  }
  if (weekday === pattern.weekdayOff) return 'OFF';
  // Prefer nights before the weekday OFF and weekend, keeping recovery days after PM.
  const workdays = [1, 2, 3, 4, 5].filter((day) => day !== pattern.weekdayOff);
  const beforeOff = pattern.weekdayOff === 1 ? 5 : pattern.weekdayOff! - 1;
  const priorities = [...new Set([beforeOff, ...workdays.slice().reverse()])].filter((day) => !avoid.includes(day));
  return priorities.slice(0, nights).includes(weekday) ? 'PM' : 'AM';
}
export type RosterRule = { id?: string; kind: 'not_together' | 'min_cover' | 'max_consecutive' | 'not_shift' | 'weekend_off' | 'only_shift' | 'no_day_after_night' | 'locum_nights' | 'custom'; condition?: '' | 'never' | 'must' | 'min' | 'max'; scope: 'all' | 'doctors' | 'staff'; person_a: string | null; person_b: string | null; shifts: string[]; amount: number | null; company: string | null; enforce: 'warn' | 'block'; active: boolean; note: string };
// Used until the rules table exists: the one rule that used to be written into the code.
export const DEFAULT_ROSTER_RULES: RosterRule[] = [
  { kind: 'not_together', person_a: 'ARA0001', person_b: 'ARA0002', shifts: ['AM', 'OH'], amount: null, company: null, scope: 'all', enforce: 'warn', active: true, note: 'Asyraf and Syafiq must not work at the same time' },
  { kind: 'weekend_off', person_a: null, person_b: null, shifts: [], amount: null, company: 'KJ', scope: 'doctors', enforce: 'block', active: true, note: 'KJ doctors are off on Saturday and Sunday' },
  { kind: 'only_shift', person_a: 'ARA0044', person_b: null, shifts: ['OH'], amount: null, company: null, scope: 'all', enforce: 'block', active: true, note: 'Dr Hanis works office hours only' },
  { kind: 'no_day_after_night', person_a: null, person_b: null, shifts: [], amount: null, company: null, scope: 'all', enforce: 'warn', active: true, note: 'Recovery after a night shift' },
  { kind: 'max_consecutive', person_a: null, person_b: null, shifts: [], amount: 6, company: null, scope: 'all', enforce: 'warn', active: true, note: '' },
];
function generateRosterCore(input: { auto?: Record<string, string>; rules?: RosterRule[]; month: string; people: DraftPerson[]; patterns: Record<string, Pattern>; existing: DraftDay[]; leave: DraftLeave[]; requests: DraftRequest[]; locks: Record<string, string>; preserve: boolean; minDay: number; minNight: number }) {
  const { month, people, patterns, existing, leave, requests, locks, preserve } = input;
  // Minimum cover comes from the rules when HR has set them (AM = day cover, PM = night cover); otherwise from the two numbers given.
  const coverRule = (shift: string, fallback: number) => { const found = (input.rules ?? []).filter((r) => r.active && r.kind === 'min_cover' && r.shifts[0] === shift && r.amount != null); return found.length ? Math.max(...found.map((r) => r.amount!)) : fallback; };
  const minDay = coverRule('AM', input.minDay), minNight = coverRule('PM', input.minNight);
  const dates = monthDates(month), cells: DraftCell[] = [], warnings: string[] = [], locum: { company: string; date: string; shift: 'AM' | 'PM' | 'OH'; missing: number }[] = [];
  // Weekdays whose night shift is left for a locum (the "locum nights" rules that apply to this person).
  const locumDays = (person: DraftPerson) => [...new Set((input.rules ?? DEFAULT_ROSTER_RULES).filter((r) => r.active && r.kind === 'locum_nights' && locumRuleSlots(r).includes('PM') && (!r.company || r.company === person.company) && (!r.person_a || r.person_a === person.code) && (r.scope === 'all' || (r.scope === 'doctors') === isDraftDoctor(person))).flatMap((r) => locumRuleDays(r)).filter((day) => day >= 1 && day <= 5))];
  const countsDay = (id: string, shift: string) => { const person = people.find((p) => p.id === id); return person && isDraftDoctor(person) ? shift === 'AM' : dayShift(shift); };
  const locumNight = (person: DraftPerson) => person.company === 'KJ' && isDraftDoctor(person);
  const existingMap = new Map(existing.map((d) => [cellKey(d.id, d.date), newCode(d.shift)]));
  for (const person of people) {
    const pattern = patterns[person.id]; if (!pattern?.enabled) continue;
    const cycle = cycleCodes(pattern.cycle);
    const weekly = person.company === 'KJ' && isDraftDoctor(person) && ['rotation', 'office'].includes(pattern.doctorMode || '');
    if (weekly && pattern.doctorMode === 'rotation' && (!preferredNights(pattern).length && ![0, 1, 2, 3, 4, 5].includes(pattern.weekdayOff!) || !(pattern.nightWeeks || '').split(',').every((v) => ['1', '2'].includes(v.trim())) || (pattern.nightWeeks || '').split(',').length > 8)) throw new Error(`Set a weekday OFF and a weekly night sequence of 1 or 2 for ${person.name}.`);
    if (/\b(DR|DOCTOR)\b/i.test(person.designation) && cycle.some((s) => ['AM-9', 'AM-12', 'AM-6', 'AM-5'].includes(s))) throw new Error(`Use AM, PM or OH for doctor ${person.name}.`);
    if ((!weekly && (!cycle.length || cycle.length > 28 || cycle.some((s) => !patternShifts.includes(s)))) || !/^\d{4}-\d{2}-\d{2}$/.test(pattern.anchor) || (!Number.isFinite(Date.parse(`${pattern.anchor}T00:00:00Z`)) || new Date(`${pattern.anchor}T00:00:00Z`).toISOString().slice(0, 10) !== pattern.anchor)) throw new Error(`Check pattern for ${person.name}: use 1–28 working/OFF/REST shift codes and a start date; leave and holidays must not repeat.`);
    for (const date of dates) {
      const key = cellKey(person.id, date), offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${pattern.anchor}T00:00:00Z`)) / 86400000);
      let shift = weekly ? doctorWeeklyShift(pattern, date, locumDays(person)) : cycle[((offset % cycle.length) + cycle.length) % cycle.length], source: DraftCell['source'] = 'pattern', locked = false;
      if (preserve && existingMap.has(key)) { shift = existingMap.get(key)!; source = 'existing'; locked = true; }
      if (locks[key] !== undefined && (!preserve || !existingMap.has(key))) { shift = locks[key]; source = 'locked'; locked = true; }
      else if (locks[key] !== undefined && locks[key] !== shift) warnings.push(`${date} · ${person.name}: draft edit conflicts with protected existing roster (${shift}).`);
      // A day moved by the automatic adjustment (never a protected, requested or leave day).
      if (!locked && input.auto?.[key] !== undefined) { shift = input.auto[key]; source = 'auto'; }
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
      if (pattern.doctorMode === 'rotation' && preferredNights(pattern).length > 0 && (cell.shift === 'PM' || doctorWeeklyShift(pattern, cell.date, locumDays(person)) === 'PM') && cell.shift !== doctorWeeklyShift(pattern, cell.date, locumDays(person))) warnings.push(`${cell.date} · ${person.name}: leave, request or protected cell differs from the preferred night days (${preferredNights(pattern).map((d) => DAY_NAMES[d]).join(', ')}).`);
      // Weekends off and office-hours-only are rules HR can switch (Rules); a rotation doctor on OH is still blocked here.
      if (pattern.doctorMode === 'rotation' && cell.shift === 'OH') warnings.push(`${cell.date} · ${person.name}: protected/edit cell breaks fixed doctor rules; draft export is blocked.`);
    }
    if (pattern.doctorMode === 'rotation') for (const date of dates.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1 && addDays(d, 4) <= dates[dates.length - 1])) {
      const weekCells = cells.filter((c) => c.id === person.id && c.date >= date && c.date <= addDays(date, 4));
      const expectedNight = [0, 1, 2, 3, 4].filter((n) => doctorWeeklyShift(pattern, addDays(date, n), locumDays(person)) === 'PM').length;
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
  // Slots HR left for a locum by rule (for example Saturday and Sunday, AM and PM): listed as locum needs for the clinics the rule is about.
  for (const rule of (input.rules ?? DEFAULT_ROSTER_RULES).filter((r) => r.active && r.kind === 'locum_nights')) {
    const days = locumRuleDays(rule), slots = locumRuleSlots(rule);
    for (const company of [...new Set(people.filter((p) => patterns[p.id]?.enabled && (!rule.company || p.company === rule.company) && (rule.scope === 'all' || (rule.scope === 'doctors') === isDraftDoctor(p))).map((p) => p.company))])
      for (const date of dates.filter((d) => days.includes(new Date(`${d}T00:00:00Z`).getUTCDay()))) for (const slot of slots)
        if (!locum.some((item) => item.company === company && item.date === date && item.shift === slot)) locum.push({ company, date, shift: slot as 'AM' | 'PM' | 'OH', missing: 1 });
  }
  // The rules HR set (Roster draft > Rules). Each one gives a warning; a rule set to "block" also stops the draft export.
  const short = (p: DraftPerson) => p.name.split(' ').slice(0, 2).join(' ');
  const who = (code?: string | null) => people.find((p) => p.code === code);
  for (const rule of (input.rules ?? DEFAULT_ROSTER_RULES).filter((r) => r.active)) {
    const tail = rule.enforce === 'block' ? '; draft export is blocked.' : '.';
    // The people a rule is about: the person named, or everyone in the draft in its group and clinic.
    const inGroup = (r: RosterRule) => people.filter((p) => patterns[p.id]?.enabled && (!r.company || p.company === r.company) && (!r.person_a || p.code === r.person_a) && (r.scope === 'all' || (r.scope === 'doctors') === isDraftDoctor(p)));
    if (rule.kind === 'not_together') {
      // The same working shift, or two of the chosen shifts (for example AM with OH), on the same day.
      const a = who(rule.person_a), b = who(rule.person_b);
      if (a && b) for (const date of dates) {
        const ca = byKey.get(cellKey(a.id, date)), cb = byKey.get(cellKey(b.id, date));
        if (!ca || !cb) continue;
        const x = newCode(ca.shift), y = newCode(cb.shift);
        if (workingShift(x) && workingShift(y) && (x === y || rule.shifts.includes(x) && rule.shifts.includes(y))) warnings.push(`${date} · ${short(a)} and ${short(b)} are both working (${x} and ${y}); they must not work at the same time${tail}`);
      }
    } else if (rule.kind === 'not_shift') {
      const a = who(rule.person_a);
      if (a) for (const date of dates) { const c = byKey.get(cellKey(a.id, date)); if (c && rule.shifts.includes(newCode(c.shift))) warnings.push(`${date} · ${short(a)} is on ${newCode(c.shift)}, a shift this person must not work${tail}`); }
    } else if (rule.kind === 'weekend_off') {
      for (const person of inGroup(rule)) for (const date of dates) { const c = byKey.get(cellKey(person.id, date)); if (c && [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && workingShift(c.shift)) warnings.push(`${date} · ${short(person)} works on a weekend (${newCode(c.shift)}), which must be off${tail}`); }
    } else if (rule.kind === 'locum_nights') {
      const days = locumRuleDays(rule), slots = locumRuleSlots(rule);
      for (const person of inGroup(rule)) for (const date of dates) { const c = byKey.get(cellKey(person.id, date)); if (c && slots.includes(newCode(c.shift)) && days.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) warnings.push(`${date} · ${short(person)} is on ${newCode(c.shift)}, which is left for a locum${tail}`); }
    } else if (rule.kind === 'custom' && rule.condition) {
      // A rule made on screen: who, on which weekdays (none: every day), which shifts, and "never", "must", "at least" or "at most".
      const days = locumRuleDays(rule), slots = rule.shifts.filter((code) => ['AM', 'PM', 'OH', 'OFF'].includes(code));
      const codeOf = (shift: string) => { const code = newCode(shift); return code === 'REST' ? 'OFF' : code; };
      const onDay = (date: string) => !days.length || days.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
      const text = slots.join(' or ');
      if (slots.length && (rule.condition === 'never' || rule.condition === 'must')) {
        for (const person of inGroup(rule)) for (const date of dates.filter(onDay)) {
          const c = byKey.get(cellKey(person.id, date));
          if (!c || ['AL', 'MC', 'ML', 'UPL', 'EL', 'PH', 'NA', 'RESIGN'].includes(newCode(c.shift))) continue;
          const inSlot = slots.includes(codeOf(c.shift));
          if (rule.condition === 'never' && inSlot) warnings.push(`${date} · ${short(person)} is on ${codeOf(c.shift)}, which is not allowed by a rule${tail}`);
          if (rule.condition === 'must' && !inSlot) warnings.push(`${date} · ${short(person)} is on ${codeOf(c.shift)}, but must be on ${text}${tail}`);
        }
      } else if (slots.length && rule.amount != null && (rule.condition === 'min' || rule.condition === 'max')) {
        for (const company of [...new Set(inGroup(rule).map((p) => p.company))]) for (const date of dates.filter(onDay)) {
          const count = inGroup(rule).filter((p) => p.company === company && slots.includes(codeOf(byKey.get(cellKey(p.id, date))?.shift || ''))).length;
          if (rule.condition === 'min' && count < rule.amount) warnings.push(`${date} · ${company}: ${count} on ${text}, at least ${rule.amount} needed${tail}`);
          if (rule.condition === 'max' && count > rule.amount) warnings.push(`${date} · ${company}: ${count} on ${text}, at most ${rule.amount} allowed${tail}`);
        }
      }
    } else if (rule.kind === 'only_shift' && rule.shifts.length) {
      for (const person of inGroup(rule)) for (const date of dates) { const c = byKey.get(cellKey(person.id, date)); if (c && workingShift(c.shift) && !rule.shifts.includes(newCode(c.shift))) warnings.push(`${date} · ${short(person)} is on ${newCode(c.shift)}, but may only work ${rule.shifts.join(' / ')}${tail}`); }
    } else if (rule.kind === 'no_day_after_night' || rule.kind === 'max_consecutive' && rule.amount) {
      // Walks each person's days (the week before the month is read from the existing roster) for a night followed by a day shift, or too many working days in a row.
      for (const person of inGroup(rule)) {
        let run = 0, previous = '';
        for (let offset = -7; offset < dates.length; offset++) {
          const date = addDays(dates[0], offset), shift = offset < 0 ? existingMap.get(cellKey(person.id, date)) || '' : byKey.get(cellKey(person.id, date))?.shift || '';
          run = workingShift(shift) ? run + 1 : 0;
          if (rule.kind === 'no_day_after_night' && offset >= 0 && previous === 'PM' && dayShift(shift)) warnings.push(`${date} · ${person.name}: night-to-day transition; check recovery time${tail}`);
          if (rule.kind === 'max_consecutive' && offset >= 0 && run > rule.amount! && (run === rule.amount! + 1 || offset === 0)) warnings.push(`${date} · ${person.name}: ${run} consecutive working days; review rest days${tail}`);
          previous = shift;
        }
      }
    }
  }
  return { cells, locum, warnings: [...new Set(warnings)], blocked: warnings.some((w) => w.includes('draft export is blocked')), adjusted: 0 };
}

// Generates the draft and, when autoFix is on, tries to follow the rules: it swaps two days of the same person inside one week
// (so each person keeps the same number of nights and days off) whenever that gives fewer checks to review. Protected, requested,
// leave and edited days are never moved. Several rounds, each taking the first swap that helps.
export function generateRosterDraft(input: Parameters<typeof generateRosterCore>[0] & { autoFix?: boolean }) {
  let auto: Record<string, string> = {};
  let best = generateRosterCore({ ...input, auto });
  if (!input.autoFix || !best.warnings.length) return best;
  const monthDays = monthDates(input.month), enabled = input.people.filter((p) => input.patterns[p.id]?.enabled);
  const weekOf = (date: string) => { const start = addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7)); return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((d) => monthDays.includes(d)); };
  let tries = 0;
  for (let round = 0; round < 60 && best.warnings.length && tries < 4000; round++) {
    const cellMap = new Map(best.cells.map((c) => [cellKey(c.id, c.date), c]));
    const movable = (c?: DraftCell) => Boolean(c) && !c!.locked && ['pattern', 'auto'].includes(c!.source) && ['AM', 'AM-9', 'AM-12', 'AM-6', 'AM-5', 'OH', 'PM', 'OFF', 'REST'].includes(newCode(c!.shift));
    let improved = false;
    search: for (const date of [...new Set(best.warnings.map((w) => /^\d{4}-\d{2}-\d{2}/.exec(w)?.[0]).filter(Boolean) as string[])]) {
      const lines = best.warnings.filter((w) => w.startsWith(date));
      // The people a warning names; one that names nobody (a coverage shortfall) can be fixed by anyone.
      const named = enabled.filter((p) => lines.some((w) => w.includes(p.name) || w.includes(p.name.split(' ').slice(0, 2).join(' '))));
      // Move the people with no preferred night days first, so a doctor's chosen nights (Asyraf's Mon/Tue) are the last thing to be moved.
      for (const person of [...(named.length ? named : enabled)].sort((x, y) => Number(preferredNights(input.patterns[x.id]).length > 0) - Number(preferredNights(input.patterns[y.id]).length > 0))) {
        const here = cellMap.get(cellKey(person.id, date));
        if (!movable(here)) continue;
        for (const other of weekOf(date)) {
          const there = cellMap.get(cellKey(person.id, other));
          if (other === date || !movable(there) || newCode(there!.shift) === newCode(here!.shift)) continue;
          tries++;
          const trial = { ...auto, [cellKey(person.id, date)]: there!.shift, [cellKey(person.id, other)]: here!.shift };
          const result = generateRosterCore({ ...input, auto: trial });
          if (result.warnings.length < best.warnings.length) { auto = trial; best = result; improved = true; break search; }
          if (tries >= 4000) break search;
        }
      }
    }
    if (!improved) break;
  }
  return { ...best, adjusted: Math.round(Object.keys(auto).length / 2) };
}
