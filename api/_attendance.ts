import { attendanceFollowUps, emptyFollowUp } from '../src/lib/attendanceFollowUp.js';
import { createHash } from 'node:crypto';
import { NEW_CODE } from '../src/lib/shiftCodes.js';
import { branchId } from './_office-db.js';
import { isMissedClock } from '../src/lib/attendanceRequests.js';
import { classifyDay, cleanPolicy, DEFAULT_OT_POLICY, netMinutes, otParts, otSummary, parseVersions, paySummary, pickPolicy, wholeHours, type DayKind, type OtPart, type OtPolicy, type OtPolicyVersion } from './_ot-rules.js';

// Attendance. Staff clock in and out on their own phone (Individual Sign In); HR sets where clocking is allowed and sees
// the day and the month. Rules follow Infotech and HR's answers:
//  - Late: up to the grace is not late; past it the full minutes are counted. It is a record for discipline reference only (no pay is deducted).
//  - Leaving early is not counted.
//  - OT: the extra time of a day (before the shift starts, after it ends, or a whole day worked on a day off) is captured
//    automatically; HR approves or rejects each one. The rate is worked out from the kind of day (api/_ot-rules.ts). Pay is worked out later from basic salary.
//  - Everyone clocks in and out, except management (who do not clock). A forgotten clock is fixed with a request that the
//    supervisor or HR approves.
// Malaysia time is UTC+8 all year. Served inside the assessment (staff) and hr (office) functions, so no new Vercel function is added.
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
// Credit hours balance in minutes: the sum of a person's movements. `ok` is false when the table is not set up yet.
async function creditMinutes(db: any, ids?: string[]) {
  const totals = new Map<string, number>(); let ok = true;
  for (let from = 0; ; from += 1000) {
    let query = db.from('hr_credit_hours').select('employee_id,minutes').order('created_at').range(from, from + 999);
    if (ids) query = query.in('employee_id', ids);
    const { data, error } = await query;
    if (error) { ok = false; break; }
    for (const row of data || []) totals.set(row.employee_id, (totals.get(row.employee_id) || 0) + Number(row.minutes));
    if ((data || []).length < 1000) break;
  }
  return { totals, ok };
}
// The credit hours balance starts on this day (the Excel balance imported on 4 Nov 2026). A use dated before it only adjusts that day: it never touches the balance.
export const CREDIT_BALANCE_FROM = '2026-11-04';
const hm = (minutes: number) => { const sign = minutes < 0 ? '-' : '', m = Math.abs(minutes); return `${sign}${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
const isTime = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const MIN = 60000, HOUR = 3600000;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const addDay = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const at = (date: string, time: string) => Date.parse(`${date}T${time.slice(0, 5)}:00+08:00`);
const hhmm = (ms: number) => new Date(ms + 8 * HOUR).toISOString().slice(11, 16);
const monthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
// Staff with no OT at all: doctors, and people on flexible hours. The flexi staff are listed by code, because the Flexi flag in a profile is also set for some staff who do get OT.
const NO_OT_CODES = new Set(['ARA0035']);
export const hasNoOt = (person: { designation?: string; employee_code?: string }) => /\b(DR|DOCTOR)\b/i.test(person.designation || '') || NO_OT_CODES.has(person.employee_code || '');
const isDoctor = (designation: string) => /\b(DR|DOCTOR)\b/i.test(designation || '');
// Roster codes used before the KJ names, and the shift a person without a roster is expected on (office hours).
const OLD_CODES = NEW_CODE;
const OFFICE_CODE = 'AM-5';
const HOLIDAY_OFF_GROUPS = new Set(['SG-MNG', 'MLHL']);

const sha = (value: string) => createHash('sha256').update(`clock:${value}`).digest('hex');
function metres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (degrees: number) => degrees * Math.PI / 180, earth = 6371000;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * earth * Math.asin(Math.sqrt(a)));
}

// The address of a GPS point, for staff who may clock from anywhere (HR agreed; the staff were told). Only the point goes to OpenStreetMap (Nominatim),
// rounded to about 100 m: no name, code or time. A point near an earlier clock with an address reuses it, so each place is looked up once.
async function addressOf(db: any, lat: number, lng: number): Promise<string> {
  const rlat = Math.round(lat * 1000) / 1000, rlng = Math.round(lng * 1000) / 1000;
  try {
    const { data: known } = await db.from('hr_attendance_clocks').select('address').neq('address', '').gte('latitude', rlat - 0.0006).lte('latitude', rlat + 0.0006).gte('longitude', rlng - 0.0006).lte('longitude', rlng + 0.0006).order('clock_at', { ascending: false }).limit(1);
    if (known?.[0]?.address) return known[0].address;
  } catch { /* the column may not exist yet */ }
  try {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&lat=${rlat}&lon=${rlng}`, { signal: controller.signal, headers: { 'User-Agent': 'attendance-location-lookup/1.0' } });
    clearTimeout(timer);
    if (!response.ok) return '';
    const body: any = await response.json(), a = body.address || {};
    const parts = [body.name && body.name !== a.road ? body.name : '', a.road, a.neighbourhood || a.suburb || a.hamlet, a.city || a.town || a.village || a.city_district || a.county].filter(Boolean);
    return [...new Set(parts)].join(', ').slice(0, 200);
  } catch { return ''; }
}

type Shift = { start: string; end: string };
type Rules = { lateGrace: number; earlyGrace: number; countEarly: boolean; otMin: number; policy: OtPolicy; versions: OtPolicyVersion[]; policyFor: (date: string) => OtPolicy; times: Map<string, Shift> };
export async function loadRules(db: any): Promise<Rules> {
  // The OT policy HR edits is one more column; before it exists (or when it is empty) the memo defaults are used.
  const read = (columns: string) => db.from('hr_attendance_settings').select(columns).eq('id', 1).maybeSingle();
  let [{ data: settings, error: settingsError }, { data: times }] = await Promise.all([read('late_grace_min,early_grace_min,count_early_out,ot_min_minutes,ot_policy'), db.from('hr_shift_times').select('code,kind,start_time,end_time')]);
  if (settingsError) settings = (await read('late_grace_min,early_grace_min,count_early_out,ot_min_minutes')).data;
  const otMin = settings?.ot_min_minutes ?? 60;
  const versions = parseVersions(settings?.ot_policy, otMin);
  const policyFor = (date: string) => pickPolicy(versions, date);
  const policy = policyFor(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10));
  return { versions, policyFor, lateGrace: settings?.late_grace_min ?? 15, earlyGrace: settings?.early_grace_min ?? 15, countEarly: !!settings?.count_early_out, otMin, policy, times: new Map((times || []).map((row: any) => [`${row.kind}|${row.code}`, { start: String(row.start_time).slice(0, 5), end: String(row.end_time).slice(0, 5) }])) };
}
function shiftTimes(rules: Rules, code: string, doctor: boolean) {
  const key = OLD_CODES[code] || code;
  return rules.times.get(`${doctor ? 'doctor' : 'staff'}|${key}`) || rules.times.get(`${doctor ? 'staff' : 'doctor'}|${key}`) || null;
}

export type Employee = { id: string; company: string; employee_code: string; full_name: string; designation: string; work_days: number[] | null; holiday_group: string | null; default_shift?: string | null; clock_required?: string | null; join_date?: string | null; resign_date?: string | null };
export type Day = { date: string; code: string; start: string; end: string; status: string; inAt: string | null; outAt: string | null; late: number; lateCounted: number; early: number; earlyCounted: number; worked: number; ot: number; otCounted: number; otStatus: string; otApproved: number; otRate: number; otNote: string; otParts: OtPart[]; creditHours: number; leave: string; holiday?: boolean; ot2InAt?: string | null; ot2OutAt?: string | null };

// One entry per person and date between from and to: what was expected (roster, then holiday, then the usual shift on
// working weekdays), leave on that date, the clocks that match it, and HR's decision on its OT.
type Data = { roster: any[]; clocks: any[]; leave: any[]; waiting?: any[]; holidays: any[]; ot: any[]; credit: any[]; clockRequests?: any[] };
export function clockSource(device: string): 'request' | 'hr' | 'infotech' | 'phone' {
  if (device === 'request' || String(device).startsWith('request:')) return 'request';
  if (device === 'hr' || String(device).startsWith('hr:')) return 'hr';
  return String(device).startsWith('infotech') ? 'infotech' : 'phone';
}
// Annual leave credit used in hours counts 8 hours as one day.
export const CREDIT_HOURS_PER_DAY = 8;
// Everything a range needs, fetched at the same time (the database is far from the server, so one round of
// queries is much faster than several in turn). Pass ids to read only those people; leave it out for everyone.
// The database sends at most 1,000 rows for one request, whatever limit is asked for, so a long period was cut short (the Late tab showed only June).
// This reads in pages of 1,000 until everything is read. `build` makes a fresh query each time (it must have a stable order).
async function readAll(build: () => any): Promise<{ data: any[]; error: any }> {
  const rows: any[] = [];
  for (let offset = 0; offset < 200000; offset += 1000) {
    const { data, error } = await build().range(offset, offset + 999);
    if (error) return { data: rows, error };
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: rows, error: null };
}
export async function fetchData(db: any, from: string, to: string, ids?: string[]): Promise<Data> {
  const wide = { from: `${addDay(from, -1)}T00:00:00+08:00`, to: `${addDay(to, 2)}T00:00:00+08:00` };
  const only = (query: any) => ids ? query.in('employee_id', ids) : query;
  const [{ data: roster }, { data: clocks }, { data: leave }, { data: waiting }, { data: holidays }, { data: ot }, { data: credit }, clockRequests] = await Promise.all([
    readAll(() => only(db.from('hr_roster').select('employee_id,work_date,shift,works').gte('work_date', from).lte('work_date', to)).order('work_date').order('employee_id')),
    readAll(() => only(db.from('hr_attendance_clocks').select('employee_id,clock_at,kind,device').gte('clock_at', wide.from).lte('clock_at', wide.to)).order('clock_at').order('id')),
    readAll(() => only(db.from('hr_leave_requests').select('employee_id,leave_type,start_date,end_date').eq('status', 'approved').lte('start_date', to).gte('end_date', from)).order('start_date').order('id')),
    only(db.from('hr_leave_requests').select('employee_id,leave_type,start_date,end_date').in('status', ['pending', 'supervisor_approved']).lte('start_date', to).gte('end_date', from)).limit(2000),
    db.from('hr_holidays').select('group_code,holiday_date').gte('holiday_date', from).lte('holiday_date', to).limit(1000),
    (async () => { const read = (columns: string) => readAll(() => only(db.from('hr_attendance_ot').select(columns).gte('work_date', from).lte('work_date', to)).order('work_date').order('employee_id')); const first = await read('employee_id,work_date,status,captured_minutes,approved_minutes,multiplier,note,parts'); return first.error ? read('employee_id,work_date,status,captured_minutes,approved_minutes,multiplier,note') : first; })(),
    readAll(() => only(db.from('hr_credit_hour_use').select('employee_id,work_date,kind,hours').gte('work_date', from).lte('work_date', to)).order('work_date').order('id')),
    readAll(() => only(db.from('hr_attendance_requests').select('employee_id,work_date,in_time,out_time,reason,status').in('status', ['pending', 'supervisor_approved', 'approved']).gte('work_date', from).lte('work_date', to)).order('work_date').order('id')),
  ]);
  if (clockRequests.error) throw clockRequests.error;
  return { roster: roster || [], clocks: clocks || [], leave: leave || [], waiting: waiting || [], holidays: holidays || [], ot: ot || [], credit: credit || [], clockRequests: clockRequests.data };
}

export async function buildDays(db: any, people: Employee[], from: string, to: string, rules: Rules) {
  if (!people.length) return new Map<string, Day[]>();
  return buildDaysFrom(await fetchData(db, from, to, people.map((person) => person.id)), people, from, to, rules);
}

// One entry per person and date between from and to: what was expected (roster, then holiday, then the usual shift on
// working weekdays), leave on that date, the clocks that match it, and HR's decision on its OT.
// The first day AraOffice holds attendance for, at both clinics: the Infotech import and HR's rosters now cover January 2026 onward. Earlier days were never recorded here, so they show "No record" instead of absent.
export const RECORDS_FROM = '2026-01-01';
export const recordsFromFor = (_company?: string | null) => RECORDS_FROM;

export function buildDaysFrom(data: Data, people: Employee[], from: string, to: string, rules: Rules) {
  const out = new Map<string, Day[]>(people.map((person) => [person.id, []]));
  const { roster, clocks, leave, waiting, holidays, ot: otRows } = data;
  const creditOf = new Map<string, number>((data.credit || []).map((row: any) => [`${row.employee_id}|${row.work_date}|${row.kind}`, Number(row.hours)]));
  const rosterOf = new Map<string, { shift: string; works: boolean }>((roster || []).map((row: any) => [`${row.employee_id}|${row.work_date}`, row]));
  const holidayOn = new Set((holidays || []).map((row: any) => `${row.group_code}|${row.holiday_date}`));
  const decided = new Map<string, any>((otRows || []).map((row: any) => [`${row.employee_id}|${row.work_date}`, row]));
  // Older corrections have no date in their device tag. Recover their work date
  // from the approved request, including overnight out times. Ambiguous matches
  // keep the ordinary time-window rules instead of assigning the same clock twice.
  const approvedDates = new Map<string, string | null>();
  const assign = (id: string, kind: string, ms: number, date: string) => { const key = `${id}|${kind}|${ms}`; approvedDates.set(key, approvedDates.has(key) && approvedDates.get(key) !== date ? null : date); };
  const pendingCorrections = new Set((data.clockRequests || []).filter((request) => ['pending', 'supervisor_approved'].includes(request.status) && isMissedClock(request.reason)).map((request) => `${request.employee_id}|${request.work_date}`));
  for (const request of data.clockRequests || []) {
    if (request.status !== 'approved') continue;
    const inAt = request.in_time ? at(request.work_date, request.in_time) : null;
    if (inAt !== null) assign(request.employee_id, 'in', inAt, request.work_date);
    if (request.out_time) { let outAt = at(request.work_date, request.out_time); if (inAt !== null && outAt <= inAt) outAt += 24 * HOUR; assign(request.employee_id, 'out', outAt, request.work_date); }
  }
  const clocksOf = new Map<string, { at: number; kind: string; workDate?: string }[]>();
  for (const row of clocks || []) { const list = clocksOf.get(row.employee_id) || [], ms = Date.parse(row.clock_at); const tagged = /^(?:hr|request|infotech):(\d{4}-\d{2}-\d{2})$/.exec(String(row.device || ''))?.[1]; list.push({ at: ms, kind: row.kind, workDate: tagged || approvedDates.get(`${row.employee_id}|${row.kind}|${ms}`) || undefined }); clocksOf.set(row.employee_id, list); }
  for (const list of clocksOf.values()) list.sort((a, b) => a.at - b.at);
  const now = Date.now();

  for (const person of people) {
    const doctor = isDoctor(person.designation), noOt = hasNoOt(person);
    const required = person.clock_required || 'full';
    const mine = clocksOf.get(person.id) || [];
    // A doctor with no usual weekdays follows the doctor roster only: without a roster row nothing is expected.
    const workDays = Array.isArray(person.work_days) && person.work_days.length ? person.work_days : /\b(DR|DOCTOR)\b/i.test(person.designation || '') ? [] : [1, 2, 3, 4, 5, 6];
    const push = (day: Day) => {
      const decision = decided.get(`${person.id}|${day.date}`);
      if (decision && day.otCounted > 0) { day.otStatus = decision.status; day.otApproved = decision.approved_minutes; day.otRate = Number(decision.multiplier); day.otNote = decision.note || ''; day.otParts = Array.isArray(decision.parts) ? decision.parts : []; }
      out.get(person.id)!.push(day);
    };
    for (let date = from; date <= to; date = addDay(date, 1)) {
      const row = rosterOf.get(`${person.id}|${date}`);
      let code = '';
      if (row) code = row.works ? row.shift : '';
      else if (HOLIDAY_OFF_GROUPS.has(person.holiday_group || '') && holidayOn.has(`${person.holiday_group}|${date}`)) code = '';
      else if (workDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) code = person.default_shift || OFFICE_CODE;
      const leaveRow = (leave || []).find((item: any) => item.employee_id === person.id && item.start_date <= date && item.end_date >= date);
      // Leave applied for and not approved yet: shown as "leave, pending approval" and not as absent.
      const waitingRow = !leaveRow ? (waiting || []).find((item: any) => item.employee_id === person.id && item.start_date <= date && item.end_date >= date) : undefined;
      const shift = code ? shiftTimes(rules, code, doctor) : null;
      const blank: Day = { date, code, start: '', end: '', status: '', inAt: null, outAt: null, late: 0, lateCounted: 0, early: 0, earlyCounted: 0, worked: 0, ot: 0, otCounted: 0, otStatus: '', otApproved: 0, otRate: 0, otNote: '', otParts: [], creditHours: 0, leave: leaveRow?.leave_type || waitingRow?.leave_type || '', holiday: Boolean(person.holiday_group && holidayOn.has(`${person.holiday_group}|${date}`)) };
      // Before the person joined and after the last working day nothing is expected: not absent. A clock or approved leave on such a day is still shown.
      if (((person.join_date && date < person.join_date) || (person.resign_date && date > person.resign_date)) && !leaveRow && !mine.some((clock) => new Date(clock.at + 8 * HOUR).toISOString().slice(0, 10) === date)) { push({ ...blank, status: 'no-record' }); continue; }
      // Before the records start there is nothing to judge: not absent, not expected. Approved leave is still shown.
      if (date < recordsFromFor(person.company) && !leaveRow && !mine.some((clock) => new Date(clock.at + 8 * HOUR).toISOString().slice(0, 10) === date)) { push({ ...blank, status: 'no-record' }); continue; }
      if (!shift) {
        // A day off, a public holiday, or a code with no times set. A day worked anyway (a rest day) is captured as OT for HR to decide.
        const same = mine.filter((clock) => clock.workDate ? clock.workDate === date : new Date(clock.at + 8 * HOUR).toISOString().slice(0, 10) === date);
        const first = same.find((clock) => clock.kind === 'in'), last = [...same].reverse().find((clock) => clock.kind === 'out');
        // A lone clock out here is the end of last night's shift, not a day worked.
        const day: Day = { ...blank, status: leaveRow ? 'leave' : first ? 'extra' : code ? 'no-times' : 'off', inAt: first ? new Date(first.at).toISOString() : null, outAt: first && last ? new Date(last.at).toISOString() : null };
        if (!leaveRow && first && last && last.at > first.at && !noOt && required !== 'none') { day.worked = Math.round((last.at - first.at) / MIN); day.ot = day.worked; const pol = rules.policyFor(date); day.otCounted = day.worked >= pol.minMinutes ? wholeHours(day.worked, pol) : 0; }
        push(day); continue;
      }
      // Annual leave credit used in hours moves the start (late arrival) or the end (early leave), so those hours are not counted late or early.
      const lateCredit = creditOf.get(`${person.id}|${date}|late`) || 0, earlyCredit = creditOf.get(`${person.id}|${date}|early`) || 0;
      const shiftStart = at(date, shift.start); let shiftEnd = at(date, shift.end); if (shiftEnd <= shiftStart) shiftEnd += 24 * HOUR;
      const start = shiftStart + lateCredit * HOUR, end = shiftEnd - earlyCredit * HOUR;
      const day: Day = { ...blank, start: new Date(start).toISOString(), end: new Date(end).toISOString(), creditHours: lateCredit + earlyCredit };
      // Phone clocks use the shift window. A dated HR correction or approved
      // request belongs to its specified work date, even when work began earlier
      // than that window. A clock assigned to another shift date is never reused.
      const clockIn = mine.find((clock) => clock.kind === 'in' && (clock.workDate ? clock.workDate === date && clock.at >= at(date, '00:00') : clock.at >= start - 5 * HOUR) && clock.at <= Math.min(start + 10 * HOUR, end - 30 * MIN));
      const clockOut = clockIn ? [...mine].reverse().find((clock) => clock.kind === 'out' && (!clock.workDate || clock.workDate === date) && clock.at > clockIn.at && clock.at <= Math.min(end + 8 * HOUR, clockIn.at + 30 * HOUR)) : undefined;
      if (clockIn) day.inAt = new Date(clockIn.at).toISOString();
      if (clockOut) day.outAt = new Date(clockOut.at).toISOString();
      // A second pair of clocks straight after the shift (clock out, then clock in again): the extra hours worked on top of the shift, counted as OT.
      // It is not taken if that clock in belongs to the next day's rostered shift.
      const nextRow = rosterOf.get(`${person.id}|${addDay(date, 1)}`);
      const nextShift = nextRow?.works ? shiftTimes(rules, nextRow.shift, doctor) : null;
      const nextStart = nextShift ? at(addDay(date, 1), nextShift.start) : Infinity;
      const extraIn = clockOut ? mine.find((clock) => clock.kind === 'in' && (!clock.workDate || clock.workDate === date) && clock.at >= clockOut.at && clock.at - clockOut.at <= 90 * MIN && clock.at < nextStart - 5 * HOUR) : undefined;
      const extraOut = extraIn ? mine.find((clock) => clock.kind === 'out' && (!clock.workDate || clock.workDate === date) && clock.at > extraIn.at && clock.at <= extraIn.at + 16 * HOUR) : undefined;
      if (extraIn) day.ot2InAt = new Date(extraIn.at).toISOString();
      if (extraOut) day.ot2OutAt = new Date(extraOut.at).toISOString();
      if (leaveRow && !clockIn) { push({ ...day, status: 'leave' }); continue; }
      // Management do not clock: their working days count as present.
      // They may still clock: a clock in/out is shown and the hours are recorded, but nothing is counted against them (no late, early or OT).
      if (required === 'none') {
        if (clockIn) { push({ ...day, status: 'present', worked: clockOut ? Math.round((clockOut.at - clockIn.at) / MIN) : 0 }); continue; }
        push({ ...day, status: 'exempt' }); continue;
      }
      if (clockIn) {
        day.late = Math.max(0, Math.round((clockIn.at - start) / MIN));
        day.lateCounted = day.late > rules.lateGrace ? day.late : 0;
        if (clockOut) {
          day.worked = Math.round((clockOut.at - clockIn.at) / MIN);
          day.early = clockOut.at < end ? Math.round((end - clockOut.at) / MIN) : 0;
          day.earlyCounted = rules.countEarly && day.early > rules.earlyGrace ? day.early : 0;
          // Extra time: before the shift starts and after it ends (doctors have no OT).
          const before = Math.max(0, Math.round((start - clockIn.at) / MIN)), after = Math.max(0, Math.round((clockOut.at - end) / MIN));
          const extra = extraIn && extraOut ? Math.round((extraOut.at - extraIn.at) / MIN) : 0;
          day.ot = noOt ? 0 : before + after + extra;
          const pol = rules.policyFor(date); day.otCounted = day.ot >= pol.minMinutes ? wholeHours(day.ot, pol) : 0;
          day.status = 'present';
        } else if (required === 'in_only') day.status = 'present';
        else day.status = pendingCorrections.has(`${person.id}|${date}`) ? 'clock-pending' : now > end + 8 * HOUR ? 'missing-out' : 'working';
      } else day.status = waitingRow ? 'leave-pending' : pendingCorrections.has(`${person.id}|${date}`) ? 'clock-pending' : now >= end ? 'absent' : now >= start + rules.lateGrace * MIN ? 'not-in' : 'upcoming';
      push(day);
    }
  }
  return out;
}

const dayView = (day: Day) => ({ ...day, startTime: day.start ? hhmm(Date.parse(day.start)) : '', endTime: day.end ? hhmm(Date.parse(day.end)) : '', inTime: day.inAt ? hhmm(Date.parse(day.inAt)) : '', outTime: day.outAt ? hhmm(Date.parse(day.outAt)) : '', ot2InTime: day.ot2InAt ? hhmm(Date.parse(day.ot2InAt)) : '', ot2OutTime: day.ot2OutAt ? hhmm(Date.parse(day.ot2OutAt)) : '' });
const PERSON = 'id,company,employee_code,full_name,designation,work_days,holiday_group,default_shift,clock_required,join_date,resign_date';
const minutesText = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const requestRow = (row: any, names: Map<string, string>) => ({ id: row.id, employeeId: row.employee_id, name: names.get(row.employee_id) || '', date: row.work_date, inTime: row.in_time ? String(row.in_time).slice(0, 5) : '', outTime: row.out_time ? String(row.out_time).slice(0, 5) : '', otMinutes: Number(row.ot_minutes || 0), otText: minutesText(Number(row.ot_minutes || 0)), reason: row.reason, remarks: row.remarks || '', status: row.status, supervisorDecidedBy: row.supervisor_decided_by || '', supervisorNote: row.supervisor_note || '', decidedBy: row.decided_by, decidedAt: row.decided_at, note: row.decision_note, rate: row.ot_multiplier === null || row.ot_multiplier === undefined ? null : Number(row.ot_multiplier), createdAt: row.created_at });

// Approving a correction adds the clocks it asks for (an out time before the in time means the next day, for a night shift).
// The kind of day (normal, off, rest or public holiday) for one person, from their roster, usual working days and the holidays of their group.
// The rest day is the last day off of the week, so the whole week is read.
async function dayKindFor(db: any, person: any, date: string): Promise<DayKind> {
  const base = Date.parse(`${date}T00:00:00Z`);
  const monday = new Date(base - ((new Date(base).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10), sunday = addDay(monday, 6);
  const [{ data: roster }, { data: holidays }] = await Promise.all([
    db.from('hr_roster').select('work_date,shift,works').eq('employee_id', person.id).gte('work_date', monday).lte('work_date', sunday).limit(20),
    person.holiday_group ? db.from('hr_holidays').select('holiday_date').eq('group_code', person.holiday_group).gte('holiday_date', monday).lte('holiday_date', sunday).limit(20) : Promise.resolve({ data: [] }),
  ]);
  const rows = new Map<string, any>((roster || []).map((row: any) => [row.work_date, row]));
  const holiday = new Set<string>((holidays || []).map((row: any) => row.holiday_date));
  const workDays = Array.isArray(person.work_days) && person.work_days.length ? person.work_days : /\b(DR|DOCTOR)\b/i.test(person.designation || '') ? [] : [1, 2, 3, 4, 5, 6];
  const working = (day: string) => {
    const row = rows.get(day);
    if (row) return Boolean(row.works && row.shift);
    if (HOLIDAY_OFF_GROUPS.has(person.holiday_group || '') && holiday.has(day)) return false;
    return workDays.includes(new Date(`${day}T00:00:00Z`).getUTCDay());
  };
  return classifyDay(date, working, (day) => holiday.has(day));
}
// What HR approves: the hours worked (rest taken off on a day off or public holiday), and the pay as hours at a rate.
async function otDecision(db: any, person: any, date: string, grossMinutes: number, policy: OtPolicy) {
  const kind = await dayKindFor(db, person, date);
  return { kind, net: netMinutes(kind, grossMinutes, policy), parts: otParts(kind, grossMinutes, policy) };
}
// What the clocks and the roster say about a day: the extra time (whole hours) the system counted, and whether there are clock in and out to judge by.
// An OT request cannot be for more than this when both clocks are there (a wrong entry like 19 h is stopped); with a clock missing the request is judged by HR.
async function clockOtFor(db: any, person: any, date: string, rules?: Rules) {
  const day = ((await buildDays(db, [person], date, date, rules || await loadRules(db))).get(person.id) || [])[0];
  const hasClocks = Boolean(day?.inAt && day?.outAt);
  // On a public holiday of the person's group the whole time worked counts (even a rostered shift), not only the time after the shift.
  const policy = (rules || await loadRules(db)).policyFor(date);
  const holiday = hasClocks && (await dayKindFor(db, person, date)) === 'ph';
  return { hasClocks, counted: day ? (holiday ? Math.max(day.otCounted, wholeHours(day.worked, policy)) : day.otCounted) : 0 };
}
const hoursMinutesText = (minutes: number) => `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} m` : ''}`;
// For the lists HR and supervisors decide from: one line saying how an OT request will be paid.
// The details shown under every OT line HR reads: the real clock in and out of the day, and how the OT is paid.
// Works from one read of the clocks, the roster and the holidays for all the lines at once.
type OtLine = { key: string; employee_id: string; work_date: string; asked: number; state: 'open' | 'approved' | 'closed' };
// Hours (as minutes) at each of the four rates, from the parts of a day's OT.
const ratesOf = (parts: OtPart[]) => { const out: Record<string, number> = { '1': 0, '1.5': 0, '2': 0, '3': 0 }; for (const part of parts) { const key = String(Number(part.multiplier)); if (key in out) out[key] += Number(part.minutes || 0); } return out; };
async function otDetails(db: any, lines: OtLine[]) {
  const result = new Map<string, { clockIn?: string; clockOut?: string; shiftCode?: string; shiftStart?: string; shiftEnd?: string; otMinutes?: number; kind?: DayKind; late?: number; early?: number; original?: Record<string, number>; requested?: Record<string, number>; pay: string }>();
  if (!lines.length) return result;
  const ids = [...new Set(lines.map((line) => line.employee_id))];
  const { data: people } = await db.from('hr_employees').select(PERSON).in('id', ids);
  const rules = await loadRules(db);
  const dates = lines.map((line) => line.work_date).sort();
  const from = dates[0], to = dates[dates.length - 1];
  const data = await fetchData(db, addDay(from, -7), addDay(to, 7), ids);
  const days = buildDaysFrom(data, people || [], from, to, rules);
  const rosterOf = new Map<string, any>((data.roster || []).map((row: any) => [`${row.employee_id}|${row.work_date}`, row]));
  const holidayOn = new Set<string>((data.holidays || []).map((row: any) => `${row.group_code}|${row.holiday_date}`));
  const decided = new Map<string, any>((data.ot || []).map((row: any) => [`${row.employee_id}|${row.work_date}`, row]));
  const kindOf = (person: any, date: string): DayKind => {
    const workDays = Array.isArray(person.work_days) && person.work_days.length ? person.work_days : /\b(DR|DOCTOR)\b/i.test(person.designation || '') ? [] : [1, 2, 3, 4, 5, 6];
    const working = (day: string) => {
      const row = rosterOf.get(`${person.id}|${day}`);
      if (row) return Boolean(row.works && row.shift);
      if (HOLIDAY_OFF_GROUPS.has(person.holiday_group || '') && holidayOn.has(`${person.holiday_group}|${day}`)) return false;
      return workDays.includes(new Date(`${day}T00:00:00Z`).getUTCDay());
    };
    return classifyDay(date, working, (day) => holidayOn.has(`${person.holiday_group}|${day}`));
  };
  const byId = new Map<string, any>((people || []).map((p: any) => [p.id, p]));
  for (let line of lines) {
    const person = byId.get(line.employee_id); if (!person) continue;
    const policy = rules.policyFor(line.work_date);
    const day = (days.get(person.id) || []).find((item) => item.date === line.work_date);
    const kind = kindOf(person, line.work_date);
    let pay = '', otMinutes: number | undefined;
    // A request with times and no OT hours (rest day work, an older request): the hours come from what HR approved, or from the clocks.
    const saved0 = decided.get(`${person.id}|${line.work_date}`);
    if (!line.asked) { otMinutes = line.state === 'approved' && saved0 ? Number(saved0.captured_minutes || saved0.approved_minutes || 0) : day ? day.otCounted : 0; line = { ...line, asked: otMinutes }; }
    if (line.state === 'closed') pay = 'none (not approved)';
    else if (line.state === 'approved') {
      const saved = decided.get(`${person.id}|${line.work_date}`);
      if (saved && saved.status === 'approved') {
        const net = Number(saved.approved_minutes || 0), gross = Number(saved.captured_minutes || 0);
        pay = paySummary(kind, net, Array.isArray(saved.parts) && saved.parts.length ? saved.parts : [{ minutes: net, multiplier: Number(saved.multiplier) }], net < gross && gross - net === policy.restMinutes && gross > policy.restAfterMinutes, policy);
      } else pay = otSummary(kind, line.asked, policy);
    } else {
      const hasClocks = Boolean(day?.inAt && day?.outAt), shown = day ? (kind === 'ph' ? Math.max(day.otCounted, wholeHours(day.worked, policy)) : day.otCounted) : 0;
      const capped = hasClocks && wholeHours(line.asked, policy) > shown;
      const counted = capped ? shown : line.asked;
      pay = capped ? (counted < policy.minMinutes ? `Asked ${hoursMinutesText(line.asked)}, but the clocks and roster show less than ${hoursMinutesText(policy.minMinutes)} of extra time: no OT can be confirmed` : `Asked ${hoursMinutesText(line.asked)}, but the clocks and roster show ${hoursMinutesText(shown)}. ${otSummary(kind, counted, policy)}`) : otSummary(kind, counted, policy);
    }
    result.set(line.key, { ...(day && day.inAt ? { clockIn: hhmm(Date.parse(day.inAt)), clockOut: day.outAt ? hhmm(Date.parse(day.outAt)) : '' } : {}), ...(day ? { shiftCode: day.code || '', shiftStart: day.start ? hhmm(Date.parse(day.start)) : '', shiftEnd: day.end ? hhmm(Date.parse(day.end)) : '' } : {}), ...(otMinutes !== undefined ? { otMinutes } : {}), kind, ...(day ? { late: day.late, early: day.early, original: ratesOf(otParts(kind, kind === 'ph' ? Math.max(day.otCounted, wholeHours(day.worked, policy)) : day.otCounted, policy)) } : {}), requested: ratesOf(otParts(kind, line.asked, policy)), pay });
  }
  return result;
}
// For the lists HR and supervisors decide from: every OT line gets its real clocks and a Pay line.
async function withOtPreview(db: any, rows: any[], requests: any[]) {
  const otRequests = requests.filter((row: any) => !isMissedClock(row.reason) && (Number(row.ot_minutes) > 0 || /^(overtime|worked on rest day)/i.test(String(row.reason || ''))));
  const details = await otDetails(db, otRequests.map((row: any) => ({ key: row.id, employee_id: row.employee_id, work_date: String(row.work_date), asked: Number(row.ot_minutes), state: ['pending', 'supervisor_approved'].includes(row.status) ? 'open' : row.status === 'approved' ? 'approved' : 'closed' } as OtLine)));
  return rows.map((row: any) => { const detail = details.get(row.id); return { ...row, otPreview: detail?.pay || '', ...(detail?.clockIn !== undefined ? { clockIn: detail.clockIn, clockOut: detail.clockOut } : {}), ...(detail?.shiftCode !== undefined ? { shiftCode: detail.shiftCode, shiftStart: detail.shiftStart, shiftEnd: detail.shiftEnd } : {}), ...(detail?.otMinutes !== undefined ? { otShown: detail.otMinutes } : {}) }; });
}
async function applyRequest(db: any, request: any) {
  const rows: any[] = [];
  if (request.in_time) rows.push({ employee_id: request.employee_id, kind: 'in', clock_at: new Date(at(request.work_date, String(request.in_time))).toISOString(), within_place: null, device: `request:${request.work_date}` });
  if (request.out_time) {
    let outAt = at(request.work_date, String(request.out_time));
    const inAt = request.in_time ? at(request.work_date, String(request.in_time)) : null;
    if (inAt !== null && outAt <= inAt) outAt += 24 * HOUR;
    rows.push({ employee_id: request.employee_id, kind: 'out', clock_at: new Date(outAt).toISOString(), within_place: null, device: `request:${request.work_date}` });
  }
  if (rows.length) { const { error } = await db.from('hr_attendance_clocks').insert(rows); if (error) throw error; }
}
// Infotech's way: the supervisor approves first, then HR confirms. Only HR's confirmation adds the clocks and the OT.
async function readRequest(db: any, id: string) {
  const { data: request, error } = await db.from('hr_attendance_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!request) throw fail(404, 'That request was not found.');
  return request;
}
async function supervisorDecide(db: any, id: string, decision: string, note: string, by: string, supervisorId: string) {
  if (!['approved', 'rejected'].includes(decision)) throw fail(400, 'Choose approve or reject.');
  const request = await readRequest(db, id);
  if (request.approver_id !== supervisorId) throw fail(403, 'This request is not waiting for you.');
  if (request.status !== 'pending') throw fail(409, 'This request has already been decided.');
  const now = new Date().toISOString();
  const patch = decision === 'approved' ? { status: 'supervisor_approved', supervisor_decided_by: by, supervisor_decided_at: now, supervisor_note: note } : { status: 'rejected', supervisor_decided_by: by, supervisor_decided_at: now, supervisor_note: note, decided_by: by, decided_at: now, decision_note: note };
  const { error } = await db.from('hr_attendance_requests').update(patch).eq('id', id).eq('status', 'pending');
  if (error) throw error;
}
async function hrDecide(db: any, id: string, decision: string, note: string, by: string, _rate: number, minutes: unknown) {
  if (!['approved', 'rejected'].includes(decision)) throw fail(400, 'Choose approve or reject.');
  const request = await readRequest(db, id);
  if (!['pending', 'supervisor_approved'].includes(request.status)) throw fail(409, 'This request has already been decided.');
  const requested = Number(request.ot_minutes || 0);
  const rules = await loadRules(db), policy = rules.policyFor(request.work_date);
  // The hours the person applied for (in whole blocks). The rate and the rest are worked out from the kind of day, not chosen.
  const gross = decision === 'approved' && requested > 0 ? wholeHours(Math.min(requested, Math.round(Number(minutes ?? requested))), policy) : 0;
  if (decision === 'approved' && requested > 0 && gross < policy.minMinutes) throw fail(400, `OT is counted in whole hours, at least ${hoursMinutesText(policy.minMinutes)}.`);
  let pay: { kind: DayKind; net: number; parts: OtPart[] } | null = null;
  if (gross > 0) {
    const { data: one } = await db.from('hr_employees').select(PERSON).eq('id', request.employee_id).maybeSingle();
    if (!one) throw fail(404, 'Staff member not found.');
    // Never more than the clocks and the roster show (when both clocks are there).
    if (hasNoOt(one)) throw fail(400, 'This staff member has flexible hours or is a doctor, so there is no OT. Reject the request.');
    const clock = await clockOtFor(db, one, request.work_date, rules);
    const allowed = clock.hasClocks ? Math.min(gross, clock.counted) : gross;
    if (allowed < policy.minMinutes) throw fail(400, `The clocks and roster show less than ${hoursMinutesText(policy.minMinutes)} of extra time that day. Reject it, or fix the clock first.`);
    pay = await otDecision(db, one, request.work_date, allowed, policy);
    if (!pay.parts.length) throw fail(400, `OT is counted in whole hours, at least ${hoursMinutesText(policy.minMinutes)}.`);
  }
  const { error } = await db.from('hr_attendance_requests').update({ status: decision, decided_by: by, decided_at: new Date().toISOString(), decision_note: note, ot_multiplier: pay ? pay.parts[0].multiplier : null }).eq('id', id).in('status', ['pending', 'supervisor_approved']);
  if (error) throw error;
  if (decision !== 'approved') return;
  await applyRequest(db, request);
  if (pay) {
    // The OT table is what Payroll reads: the approved hours, and the parts (hours at each rate) the pay is made of (never less than what the clocks captured).
    const { data: one } = await db.from('hr_employees').select(PERSON).eq('id', request.employee_id).maybeSingle();
    let captured = gross;
    if (one) { const day = ((await buildDays(db, [one], request.work_date, request.work_date, rules)).get(request.employee_id) || [])[0]; captured = Math.max(day?.otCounted || 0, gross); }
    const { error: otError } = await db.from('hr_attendance_ot').upsert({ employee_id: request.employee_id, work_date: request.work_date, captured_minutes: captured, status: 'approved', approved_minutes: pay.net, multiplier: pay.parts[0].multiplier, parts: pay.parts, note: text(`Requested by staff. ${otSummary(pay.kind, gross, policy)}. ${note}`, 300), decided_by: by, decided_at: new Date().toISOString() }, { onConflict: 'employee_id,work_date' });
    if (otError) throw otError;
  }
}

// The credit hours a staff member could use for the clock they are about to make: a late arrival (clocking in after the shift starts) or an early
// leave (clocking out before it ends). `basis` is the time to measure from (the shift start or end), so the phone can work out the minutes as time
// passes; `creditNeed` works them out now. The amount used is 30 minutes, then whole hours up to 12 (and no more than the balance). `days` are yesterday's and today's days of this person.
const MAX_CREDIT_USE_HOURS = 12;
const creditChoiceOk = (hours: number) => hours === 0.5 || (Number.isInteger(hours) && hours >= 1 && hours <= MAX_CREDIT_USE_HOURS);
function creditBasis(days: Day[], nextKind: 'in' | 'out') {
  if (nextKind === 'in') {
    const day = days.find((item) => item.date === today());
    return day?.start && day.status !== 'leave' && !day.inAt ? { kind: 'late' as const, date: day.date, at: day.start } : null;
  }
  const day = [...days].reverse().find((item) => item.inAt && !item.outAt && item.end);
  return day ? { kind: 'early' as const, date: day.date, at: day.end } : null;
}
function creditNeed(days: Day[], nextKind: 'in' | 'out', nowMs: number) {
  const basis = creditBasis(days, nextKind); if (!basis) return null;
  const minutes = Math.round((basis.kind === 'late' ? nowMs - Date.parse(basis.at) : Date.parse(basis.at) - nowMs) / MIN);
  return minutes > 0 ? { ...basis, minutes } : null;
}

// ---- Staff side (Individual Sign In) ----
export async function attendanceStaffAction(req: any, res: any, db: any, staff: { id: string }, action: string, body: any) {
  const [{ data: me, error }, rules] = await Promise.all([db.from('hr_employees').select(`${PERSON},status,clock_mode,clock_place_ids,leave_approver_id,final_approver_id`).eq('assessment_staff_id', staff.id).maybeSingle(), loadRules(db)]);
  if (error) throw error;
  if (!me) throw fail(400, 'Your sign-in is not linked to your staff record yet. Ask HR.');

  // Places this person may clock at: their company's places plus any HR added by hand.
  const allowedPlaces = async () => {
    const { data } = await db.from('hr_clock_places').select('id,name,company,latitude,longitude,radius_m').eq('active', true);
    return (data || []).filter((place: any) => place.company === me.company || (me.clock_place_ids || []).includes(place.id));
  };
  const state = async () => {
    const day = today();
    const [days, { data: recent }, places] = await Promise.all([buildDays(db, [me], addDay(day, -1), day, rules), db.from('hr_attendance_clocks').select('kind,clock_at').eq('employee_id', me.id).gte('clock_at', new Date(Date.now() - 36 * HOUR).toISOString()).order('clock_at', { ascending: false }).limit(10), allowedPlaces()]);
    const last = (recent || [])[0];
    const nextKind = last && last.kind === 'in' && Date.now() - Date.parse(last.clock_at) < 20 * HOUR ? 'out' : 'in';
    const mine = days.get(me.id) || [];
    return { today: day, name: me.full_name, mode: me.clock_mode, places: places.map((place: any) => ({ name: place.name })), nextKind, recent: (recent || []).map((row: any) => ({ kind: row.kind, at: row.clock_at })), shift: dayView(mine.find((item) => item.date === day) || { date: day } as Day), yesterday: dayView(mine.find((item) => item.date === addDay(day, -1)) || { date: addDay(day, -1) } as Day), required: me.clock_required || 'full', creditMinutes: (await creditMinutes(db, [me.id])).totals.get(me.id) || 0, creditBasis: creditBasis(mine, nextKind) };
  };

  if (req.method === 'GET' && action === 'attendance_today') return res.status(200).json(await state());

  if (req.method === 'GET' && action === 'attendance_history') {
    // One day only (the Apply OT form fills in the times for the date chosen).
    if (isDate(req.query.date)) {
      const date = String(req.query.date);
      const days = (await buildDays(db, [me], date, date, rules)).get(me.id) || [];
      return res.status(200).json({ month: date.slice(0, 7), today: today(), days: days.map(dayView) });
    }
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : today().slice(0, 7);
    if (Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12) throw fail(400, 'Choose a valid month.');
    const days = (await buildDays(db, [me], `${month}-01`, monthEnd(month), rules)).get(me.id) || [];
    return res.status(200).json({ month, today: today(), days: days.map(dayView) });
  }

  if (req.method === 'POST' && action === 'attendance_clock') {
    if (me.status !== 'Active') throw fail(403, 'Your staff record is not active. Ask HR.');
    const deviceId = text(body.deviceId, 80);
    if (deviceId.length < 16) throw fail(400, 'This browser could not identify the clock attempt. Reload the page and try again.');
    const hash = sha(deviceId);
    // Browser IDs are retained only as clock audit metadata, never as an access restriction.
    const lat = Number(body.lat), lng = Number(body.lng), accuracy = Number(body.accuracy);
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && body.lat !== null && body.lat !== '';
    let place: any = null, distance: number | null = null, within: boolean | null = null;
    if (me.clock_mode === 'places') {
      const places = await allowedPlaces();
      if (!places.length) throw fail(400, 'No clock place has been set for you yet. Ask HR.');
      if (!hasLocation) throw fail(400, 'Turn on location for this page, then try again.');
      if (Number.isFinite(accuracy) && accuracy > 200) throw fail(400, 'Your location is not accurate enough. Turn on precise location, go outside or near a window, then try again.');
      const nearest = places.map((item: any) => ({ item, distance: metres(lat, lng, item.latitude, item.longitude) })).sort((a: any, b: any) => a.distance - b.distance)[0];
      // A weak GPS fix is allowed some room (the phone's own accuracy, at most 50 m), so staff inside the building are not turned away for no reason.
      const room = Number.isFinite(accuracy) ? Math.min(Math.max(accuracy, 0), 50) : 0;
      if (nearest.distance > nearest.item.radius_m + room) throw fail(403, `You are about ${nearest.distance} m from ${nearest.item.name}. Clock in within ${nearest.item.radius_m} m.`);
      place = nearest.item; distance = nearest.distance; within = true;
    }
    const { data: last } = await db.from('hr_attendance_clocks').select('kind,clock_at').eq('employee_id', me.id).order('clock_at', { ascending: false }).limit(1);
    const prev = last?.[0];
    if (prev && Date.now() - Date.parse(prev.clock_at) < 60000) throw fail(429, 'You just clocked. Wait a minute before clocking again.');
    const kind = prev && prev.kind === 'in' && Date.now() - Date.parse(prev.clock_at) < 20 * HOUR ? 'out' : 'in';
    // The staff member chose to cover a late arrival or an early leave with their credit hours: checked before the clock is saved.
    let credit: { kind: 'late' | 'early'; date: string; hours: number } | null = null;
    const chosen = Number(body.creditHours); // 30 minutes (0.5), then 1, 2, 3 ... 12 hours
    if (chosen > 0) {
      const day = today();
      const need = creditNeed((await buildDays(db, [me], addDay(day, -1), day, rules)).get(me.id) || [], kind, Date.now());
      if (!need) throw fail(400, kind === 'in' ? 'You are not late, so there is nothing to cover with credit hours. Clock again without it.' : 'You are not leaving early, so there is nothing to cover with credit hours. Clock again without it.');
      if (!creditChoiceOk(chosen)) throw fail(400, 'Choose 30 minutes, or 1 to 12 whole hours.');
      const balance = await creditMinutes(db, [me.id]);
      if (!balance.ok) throw fail(409, 'Credit hours are not set up yet. Ask HR.');
      if ((balance.totals.get(me.id) || 0) < Math.round(chosen * 60)) throw fail(400, `You have ${hm(balance.totals.get(me.id) || 0)} of credit hours, and ${hm(Math.round(chosen * 60))} was chosen. Choose less, or clock without it.`);
      const { data: already } = await db.from('hr_credit_hour_use').select('id').eq('employee_id', me.id).eq('work_date', need.date).eq('kind', need.kind).maybeSingle();
      if (already) throw fail(409, 'Credit hours are already used for this. Clock again without it.');
      credit = { kind: need.kind, date: need.date, hours: chosen };
    }
    const base = { employee_id: me.id, kind, latitude: hasLocation ? lat : null, longitude: hasLocation ? lng : null, accuracy_m: Number.isFinite(accuracy) ? accuracy : null, place_id: place?.id || null, distance_m: distance, within_place: within, device: hash.slice(0, 12) };
    const remarks = text(body.remarks, 200);
    const address = me.clock_mode === 'anywhere' && hasLocation ? await addressOf(db, lat, lng) : '';
    let { error: insertError } = await db.from('hr_attendance_clocks').insert({ ...base, remarks, address });
    if (insertError && insertError.code === '42703') ({ error: insertError } = await db.from('hr_attendance_clocks').insert(base)); // before the migration
    if (insertError) throw insertError;
    let creditNote = '';
    if (credit) {
      // The same record HR makes (Attendance > Credit hrs), marked as made by the staff member, so HR can see it and remove it.
      const minutes = Math.round(credit.hours * 60), label = `${me.full_name} (staff, at the clock)`;
      const { data: inserted, error: useError } = await db.from('hr_credit_hour_use').insert({ employee_id: me.id, work_date: credit.date, kind: credit.kind, hours: credit.hours, days: Math.round((credit.hours / CREDIT_HOURS_PER_DAY) * 100) / 100 || 0.01, note: 'Used by the staff member when clocking', created_by: label }).select('id').single();
      if (useError) creditNote = 'Your clock was saved, but the credit hours could not be recorded. Tell HR.';
      else {
        await db.from('hr_credit_hours').insert({ employee_id: me.id, entry_date: credit.date, minutes: -minutes, kind: 'use', note: `${credit.kind === 'late' ? 'Came in late' : 'Left early'}: used when clocking`, use_id: inserted.id, created_by: label });
        await db.from('hr_audit').insert({ employee_id: me.id, action: 'update', changes: { credit_hours_used: `${credit.hours} h for ${credit.kind === 'late' ? 'a late arrival' : 'an early leave'} on ${credit.date}`, note: 'Used by the staff member when clocking', by: label } });
        creditNote = `${hm(minutes)} of credit hours used for ${credit.kind === 'late' ? 'coming in late' : 'leaving early'}.`;
      }
    }
    return res.status(200).json({ success: true, kind, creditNote, ...(await state()) });
  }

  // Corrections: ask for a missed clock to be added; the supervisor (or HR) approves.
  if (req.method === 'GET' && action === 'attendance_requests') {
    const { data, error: listError } = await db.from('hr_attendance_requests').select('*').eq('employee_id', me.id).order('created_at', { ascending: false }).limit(30);
    if (listError) throw listError;
    return res.status(200).json({ requests: (data || []).map((row: any) => requestRow(row, new Map([[me.id, me.full_name]]))) });
  }
  // Create, or edit a draft: the staff member asks for a corrected clock and/or OT hours for a day, as in Infotech's Attendance / OT Request.
  if (req.method === 'POST' && (action === 'attendance_request_create' || action === 'attendance_request_update')) {
    const date = isDate(body.date) ? String(body.date) : '', inTime = body.inTime ? String(body.inTime) : '', outTime = body.outTime ? String(body.outTime) : '', reason = text(body.reason, 300), remarks = text(body.remarks, 500);
    const otText = body.otTime ? String(body.otTime) : '';
    if (otText && !isTime(otText)) throw fail(400, 'Enter the OT hours as hh:mm.');
    const otRaw = otText ? Number(otText.slice(0, 2)) * 60 + Number(otText.slice(3, 5)) : 0;
    const policy = rules.policyFor(date);
    if (otRaw > 0 && otRaw < policy.minMinutes) throw fail(400, `OT is counted in whole hours, at least ${hoursMinutesText(policy.minMinutes)}.`);
    const otMinutes = wholeHours(otRaw, policy);
    const draft = body.draft === true;
    if (!date || date > today() || date.slice(0, 7) !== today().slice(0, 7)) throw fail(400, 'Choose a date in this month. Once the month ends, ask HR.');
    if (!inTime && !outTime && !otMinutes) throw fail(400, 'Enter the time you clocked in or out, the OT hours, or both.');
    if ((inTime && !isTime(inTime)) || (outTime && !isTime(outTime))) throw fail(400, 'Enter the times as hh:mm.');
    if (!reason) throw fail(400, 'Choose or write the reason.');
    // A forgotten clock can only be asked for when that clock is really missing on the day (the clocks the person made, or ones already added).
    if (/forgot to clock/i.test(reason) && !(action === 'attendance_request_update')) {
      const day = ((await buildDays(db, [me], date, date, rules)).get(me.id) || [])[0];
      if (day?.inAt && day?.outAt) throw fail(400, 'You already have both a clock in and a clock out on that date, so there is nothing to correct. If you worked extra hours, use OT request.');
      if (inTime && !outTime && day?.inAt) throw fail(400, 'You already have a clock in on that date. Ask for the clock out you missed.');
      if (outTime && !inTime && day?.outAt) throw fail(400, 'You already have a clock out on that date. Ask for the clock in you missed.');
    }
    if (otMinutes > 0 && hasNoOt(me)) throw fail(400, 'Your hours are flexible or you are a doctor, so there is no OT to apply for.');
    // OT cannot be more than the clocks and roster show for that day (when both clocks are there).
    if (otMinutes > 0) {
      const clock = await clockOtFor(db, me, date, rules);
      if (clock.hasClocks && otMinutes > clock.counted) throw fail(400, clock.counted >= policy.minMinutes ? `Your clocks and roster show ${hoursMinutesText(clock.counted)} of OT on that date. Apply for ${hoursMinutesText(clock.counted)} or less.` : 'Your clocks and roster show less than 1 hour of OT on that date. If a clock is missing, send a Forgot to clock request first.');
    }
    const supervisor = [me.leave_approver_id, me.final_approver_id].find((id: string | null) => id && id !== me.id) || null;
    const waiting = await db.from('hr_attendance_requests').select('id,reason').eq('employee_id', me.id).eq('work_date', date).in('status', ['pending', 'supervisor_approved']).limit(1);
    if (waiting.data?.length && !(action === 'attendance_request_update' && waiting.data[0].id === text(body.id, 60))) throw fail(409, isMissedClock(String(waiting.data[0].reason || '')) && !isMissedClock(reason) ? 'You have a Forgot to clock request waiting for that date. Wait for it to be approved, then apply for the OT.' : 'You already have a request waiting for that date.');
    // No supervisor set: it goes straight to HR.
    const fields = { work_date: date, in_time: inTime || null, out_time: outTime || null, ot_minutes: otMinutes, reason, remarks, approver_id: supervisor, status: draft ? 'draft' : supervisor ? 'pending' : 'supervisor_approved' };
    if (action === 'attendance_request_update') {
      const id = text(body.id, 60), mine = await readRequest(db, id);
      if (mine.employee_id !== me.id || mine.status !== 'draft') throw fail(403, 'Only your own draft can be changed.');
      const { error: updateError } = await db.from('hr_attendance_requests').update(fields).eq('id', id).eq('status', 'draft');
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await db.from('hr_attendance_requests').insert({ employee_id: me.id, ...fields });
      if (insertError) { if (insertError.code === '42703' || insertError.code === '23514') throw fail(400, 'OT requests are not set up yet. Ask HR (the database update has not been run).'); throw insertError; }
    }
    return res.status(200).json({ success: true });
  }
  // "Not OT": the staff member says the extra time on a day was not overtime, so the reminder goes away. It is kept as a "rejected" OT line marked as the staff's own, and can be undone.
  if (req.method === 'POST' && action === 'attendance_ot_dismiss') {
    const date = isDate(body.date) ? String(body.date) : '';
    if (!date || date >= today() || date.slice(0, 7) !== today().slice(0, 7)) throw fail(400, 'Choose a day earlier this month.');
    const { data: line } = await db.from('hr_attendance_ot').select('status,decided_by').eq('employee_id', me.id).eq('work_date', date).maybeSingle();
    if (body.undo === true) {
      if (line && line.status === 'rejected' && String(line.decided_by).endsWith('(staff)')) await db.from('hr_attendance_ot').delete().eq('employee_id', me.id).eq('work_date', date).eq('status', 'rejected');
      return res.status(200).json({ success: true });
    }
    if (line) throw fail(409, 'That day already has an OT decision.');
    const clock = await clockOtFor(db, me, date, rules);
    const { error: dismissError } = await db.from('hr_attendance_ot').insert({ employee_id: me.id, work_date: date, captured_minutes: clock.counted, status: 'rejected', approved_minutes: 0, multiplier: 1.5, note: 'The staff member said this was not OT.', decided_by: `${me.full_name} (staff)`, decided_at: new Date().toISOString() });
    if (dismissError) throw dismissError;
    return res.status(200).json({ success: true });
  }
  if (req.method === 'POST' && action === 'attendance_request_cancel') {
    const id = text(body.id, 60), mine = await readRequest(db, id);
    if (mine.employee_id !== me.id) throw fail(403, 'That is not your request.');
    if (!['draft', 'pending', 'supervisor_approved'].includes(mine.status)) throw fail(409, 'Only a draft or a request still waiting can be cancelled.');
    const { error: cancelError } = await db.from('hr_attendance_requests').update({ status: 'cancelled', decided_by: me.full_name, decided_at: new Date().toISOString() }).eq('id', id).in('status', ['draft', 'pending', 'supervisor_approved']);
    if (cancelError) throw cancelError;
    return res.status(200).json({ success: true });
  }
  // HR officers decide in their Individual Sign In too: the requests a supervisor has approved (waiting for HR) are listed after the ones waiting for their own approval.
  const isHr = /\bHR\b|HUMAN RESOURCE|CHRO/i.test(String(me.designation || ''));
  if (req.method === 'GET' && action === 'attendance_request_approvals') {
    const [{ data: mineRows, error: listError }, hrRows] = await Promise.all([
      db.from('hr_attendance_requests').select('*').eq('approver_id', me.id).eq('status', 'pending').order('created_at').limit(50),
      isHr ? db.from('hr_attendance_requests').select('*').eq('status', 'supervisor_approved').neq('employee_id', me.id).order('created_at').limit(50) : Promise.resolve({ data: [], error: null }),
    ]);
    if (listError || hrRows.error) throw listError || hrRows.error;
    const seen = new Set<string>();
    const rows = [...(mineRows || []).map((row: any) => ({ row, stage: 'supervisor' })), ...(hrRows.data || []).map((row: any) => ({ row, stage: 'hr' }))].filter(({ row }) => !seen.has(row.id) && seen.add(row.id));
    const ids = [...new Set(rows.map(({ row }) => row.employee_id))];
    const { data: people } = ids.length ? await db.from('hr_employees').select('id,full_name').in('id', ids) : { data: [] };
    const names = new Map<string, string>((people || []).map((p: any) => [p.id, p.full_name] as [string, string]));
    return res.status(200).json({ requests: await withOtPreview(db, rows.map(({ row, stage }) => ({ ...requestRow(row, names), stage })), rows.map(({ row }) => row)) });
  }
  if (req.method === 'POST' && action === 'attendance_request_decide') {
    const id = text(body.id, 60);
    const waiting = await readRequest(db, id);
    if (waiting.employee_id === me.id) throw fail(403, 'You cannot approve your own request. Another HR officer or your supervisor decides it.');
    // A request a supervisor has approved is waiting for HR: an HR officer confirms it here (OT at the chosen rate, or the forgotten clock).
    if (waiting.status === 'supervisor_approved' && isHr) await hrDecide(db, id, String(body.decision), text(body.note, 300), me.full_name, Number(body.rate) || 1.5, body.minutes);
    else await supervisorDecide(db, id, String(body.decision), text(body.note, 300), me.full_name, me.id);
    return res.status(200).json({ success: true });
  }
  throw fail(404, 'Unknown attendance action.');
}

export const TEAM_COLUMNS = PERSON;

// ---- Office HR side ----
// A clock on a date in a payroll month that is already locked (run in AraOffice, from November 2026) cannot be added, changed or removed: the pay was worked out from it.
// The pay period is the 20th to the 19th. Unlock the month in Payroll first if it really has to change.
const PAY_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export async function assertPayrollOpen(db: any, employeeId: string, date: string) {
  let [year, month] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
  if (Number(date.slice(8, 10)) >= 20) { month += 1; if (month > 12) { month = 1; year += 1; } }
  if (`${year}-${String(month).padStart(2, '0')}` < '2026-11') return;
  const { data } = await db.from('hr_payslips').select('status').eq('employee_id', employeeId).eq('year', year).eq('month', month).maybeSingle();
  if (data?.status === 'locked') throw fail(409, `${date.split('-').reverse().join('/')} is in the ${PAY_MONTHS[month - 1]} ${year} payroll, which is locked. Unlock the month in Payroll first if this must change.`);
}

export async function attendanceHrAction(req: any, res: any, db: any, action: string, body: any, userLabel: string, only?: Set<string>, userId?: string) {
  // `only` limits the people to a team (the COO's own team); HR sees everyone.
  const active = async () => { const { data, error } = await db.from('hr_employees').select(PERSON).eq('status', 'Active').order('full_name').limit(500); if (error) throw error; return ((data || []) as Employee[]).filter((p) => !only || only.has(p.id)); };
  const person = (p: Employee) => ({ id: p.id, company: p.company, code: p.employee_code, name: p.full_name, doctor: isDoctor(p.designation), group: /CLINIC ASSISTANT/i.test(p.designation || '') ? 'CA' : 'Others' });
  const monthOf = (value: unknown) => { const month = /^\d{4}-\d{2}$/.test(String(value)) ? String(value) : today().slice(0, 7); if (Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12) throw fail(400, 'Choose a valid month.'); return month; };

  if (req.method === 'GET' && action === 'attendance_daily') {
    const date = isDate(req.query.date) ? String(req.query.date) : today();
    const before = addDay(date, -1);
    const [people, rules, data] = await Promise.all([active(), loadRules(db), fetchData(db, before, date)]);
    const days = buildDaysFrom(data, people, before, date, rules);
    return res.status(200).json({ date, today: today(), rows: people.map((p) => {
      const list = days.get(p.id) || [];
      let day = list.find((item) => item.date === date) || { date } as Day;
      // Post night: the clock out on a day off that ends last night's shift (for example out at 12:00 after a night shift) is shown on the day it happened.
      const last = list.find((item) => item.date === before);
      if (last?.outAt && new Date(Date.parse(last.outAt) + 8 * 3600000).toISOString().slice(0, 10) === date && (day.status === 'off' || day.status === 'no-times')) day = { ...day, status: 'post-call', outAt: last.outAt, start: last.start, end: last.end, code: last.code };
      const { code: shift, ...rest } = dayView(day);
      return { ...person(p), ...rest, shift };
    }).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name)) });
  }

  if (req.method === 'GET' && action === 'attendance_month') {
    const month = monthOf(req.query.month);
    const [people, rules, data] = await Promise.all([active(), loadRules(db), fetchData(db, `${month}-01`, monthEnd(month))]);
    const days = buildDaysFrom(data, people, `${month}-01`, monthEnd(month), rules);
    const rows = people.map((p) => {
      const list = days.get(p.id) || [];
      const sum = (pick: (day: Day) => number) => list.reduce((total, day) => total + pick(day), 0);
      const count = (status: string) => list.filter((day) => day.status === status).length;
      return { ...person(p), expected: list.filter((day) => day.start || day.status === 'leave').length, present: list.filter((day) => ['present', 'working', 'missing-out', 'exempt'].includes(day.status)).length, absent: count('absent'), leave: count('leave') + count('leave-pending'), missingOut: count('missing-out'), lateDays: list.filter((day) => day.lateCounted > 0).length, lateMinutes: sum((day) => day.lateCounted), workedMinutes: sum((day) => day.worked), otApprovedMinutes: sum((day) => day.otStatus === 'approved' ? day.otApproved : 0), otWaitingMinutes: sum((day) => day.otCounted > 0 && !day.otStatus ? day.otCounted : 0), exempt: count('exempt') };
    }).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
    // Companies with nothing recorded for the whole month: the screen shows one "No record for this month" line instead of empty rows.
    const noRecord = ['KJ', 'SK'].filter((company) => monthEnd(month) < recordsFromFor(company));
    return res.status(200).json({ month, rows, noRecord, rules: { lateGrace: rules.lateGrace, otMin: rules.otMin } });
  }

  // Individual attendance (like Infotech's Individual Attendance Report): every day of a person with the shift, the clocks, late, early out, hours and OT, and
  // a "Check" column for the odd days. Without a person it lists everyone with how many odd days they have in the period, so the strange ones show first.
  if (req.method === 'GET' && action === 'attendance_individual') {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const from = iso.test(String(req.query.from)) ? String(req.query.from) : `${today().slice(0, 7)}-01`, to = iso.test(String(req.query.to)) ? String(req.query.to) : today();
    if (to < from || Date.parse(to) - Date.parse(from) > 62 * 86400000) throw fail(400, 'Choose a period of at most two months.');
    const one = text(req.query.id, 60);
    // The week around the period is read too, so the rest day (the last day off of each Monday to Sunday week) is right on the first and last week.
    const wideFrom = addDay(from, -6), wideTo = addDay(to, 6);
    const onlyRequested = (query: any) => one ? query.eq('employee_id', one) : query;
    const [people, rules, data, requests, creditUses] = await Promise.all([
      active(), loadRules(db), fetchData(db, wideFrom, wideTo),
      readAll(() => onlyRequested(db.from('hr_attendance_requests').select('employee_id,work_date,reason,status').neq('status', 'draft').gte('work_date', from).lte('work_date', to)).order('created_at', { ascending: false }).order('id', { ascending: false })),
      readAll(() => onlyRequested(db.from('hr_credit_hour_use').select('employee_id,work_date,kind,hours').gte('work_date', from).lte('work_date', to)).order('work_date').order('id')),
    ]);
    if (requests.error) throw requests.error;
    if (creditUses.error) throw creditUses.error;
    const followUps = attendanceFollowUps(requests.data, creditUses.data, data.ot || []);
    const chosen = one ? people.filter((p) => p.id === one) : people;
    const days = buildDaysFrom(data, chosen, wideFrom, wideTo, rules);
    // The odd days: absent, a clock in with no clock out, a clock on a day off, a very long day, a very short day. Late and early out are shown too but are not "odd".
    const flagsOf = (day: Day) => {
      const odd: string[] = [], soft: string[] = [];
      if (day.status === 'absent') odd.push('Absent');
      if (day.status === 'missing-out') odd.push('No clock out');
      if (day.status === 'extra') odd.push('Clocked on a day off');
      if (['present', 'missing-out'].includes(day.status) && day.worked > 14 * 60) odd.push('More than 14 hours');
      if (day.status === 'present' && day.worked > 0 && day.worked < 4 * 60) odd.push('Less than 4 hours');
      if (day.lateCounted > 0) soft.push('Late');
      if (day.earlyCounted > 0) soft.push('Early out');
      if (day.status === 'clock-pending') soft.push('Clock correction pending');
      return { odd, soft };
    };
    // For one person the clocks themselves are sent too (with their ids), so the screen can edit them in place like Infotech's Update By Individual.
    const rawClocks = new Map<string, { id: string; kind: string; ms: number }[]>();
    if (one) {
      const { data: rows, error: clockError } = await db.from('hr_attendance_clocks').select('id,kind,clock_at').eq('employee_id', one).gte('clock_at', `${wideFrom}T00:00:00+08:00`).lte('clock_at', `${addDay(wideTo, 1)}T06:00:00+08:00`).order('clock_at').limit(2000);
      if (clockError) throw clockError;
      for (const row of rows || []) { const ms = Date.parse(row.clock_at), date = new Date(ms + 8 * HOUR).toISOString().slice(0, 10); const list = rawClocks.get(date) || []; list.push({ id: row.id, kind: row.kind, ms }); rawClocks.set(date, list); }
    }
    const allClocks = [...rawClocks.values()].flat();
    const decidedOt = new Map<string, any>((data.ot || []).map((row: any) => [`${row.employee_id}|${row.work_date}`, row]));
    // Everyone chosen (or the one person), each with every day: the report is drawn from this, and the odd-days summary is worked out from the same days.
    const out = chosen.map((p) => {
      const all = days.get(p.id) || [];
      const byDate = new Map(all.map((day) => [day.date, day]));
      const kindOf = (date: string): DayKind => classifyDay(date, (d) => Boolean(byDate.get(d)?.code), (d) => Boolean(byDate.get(d)?.holiday));
      const list = all.filter((day) => day.date >= from && day.date <= to).map((day) => {
        const v = dayView(day), f = flagsOf(day);
        // OT hours at each rate: what HR approved (read from the decision itself, so a day HR approved is shown even when the clocks no longer show OT),
        // and, for a day with OT that is not decided yet, what the OT policy would pay (shown apart, as waiting).
        const byRate: Record<string, number> = {}, waiting: Record<string, number> = {};
        const decision = decidedOt.get(`${p.id}|${day.date}`);
        if (decision?.status === 'approved') {
          const parts: OtPart[] = Array.isArray(decision.parts) && decision.parts.length ? decision.parts : Number(decision.approved_minutes) > 0 ? [{ minutes: Number(decision.approved_minutes), multiplier: Number(decision.multiplier) || 1.5 }] : [];
          for (const part of parts) byRate[String(part.multiplier)] = (byRate[String(part.multiplier)] || 0) + part.minutes;
        } else if (day.otCounted > 0 && (!decision || decision.status === 'pending')) {
          for (const part of otParts(kindOf(day.date), day.ot, rules.policyFor(day.date))) waiting[String(part.multiplier)] = (waiting[String(part.multiplier)] || 0) + part.minutes;
        }
        return { date: day.date, shift: day.code, startTime: v.startTime, endTime: v.endTime, inTime: v.inTime, outTime: v.outTime, status: day.status, leave: day.leave, holiday: Boolean(day.holiday), kind: kindOf(day.date), clocks: (rawClocks.get(day.date) || []).map((clock) => ({ id: clock.id, kind: clock.kind, time: hhmm(clock.ms) })), inId: day.inAt ? allClocks.find((clock) => clock.ms === Date.parse(day.inAt!))?.id || '' : '', outId: day.outAt ? allClocks.find((clock) => clock.ms === Date.parse(day.outAt!))?.id || '' : '', ot2InTime: v.ot2InTime, ot2OutTime: v.ot2OutTime, ot2InId: day.ot2InAt ? allClocks.find((clock) => clock.ms === Date.parse(day.ot2InAt!))?.id || '' : '', ot2OutId: day.ot2OutAt ? allClocks.find((clock) => clock.ms === Date.parse(day.ot2OutAt!))?.id || '' : '', late: day.lateCounted, early: day.earlyCounted, worked: day.worked, ot: day.otCounted, otByRate: byRate, otWaiting: waiting, credit: day.creditHours, odd: f.odd, soft: f.soft, followUp: followUps.get(`${p.id}|${day.date}`) || emptyFollowUp() };
      });
      return { person: { ...person(p), designation: p.designation }, days: list };
    });
    if (one && !out.length) throw fail(404, 'Staff member not found.');
    return res.status(200).json({ from, to, people: out });
  }

  // Every day counted late in a period, one line each (date, shift, clock in, minutes late), for the Late Attendance report.
  if (req.method === 'GET' && action === 'attendance_late_days') {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const from = iso.test(String(req.query.from)) ? String(req.query.from) : `${today().slice(0, 7)}-01`, to = iso.test(String(req.query.to)) ? String(req.query.to) : today();
    if (to < from || Date.parse(to) - Date.parse(from) > 400 * 86400000) throw fail(400, 'Choose a period of at most a year.');
    const [people, rules] = await Promise.all([active(), loadRules(db)]);
    const days = buildDaysFrom(await fetchData(db, from, to, people.map((p) => p.id)), people, from, to, rules);
    const rows = people.flatMap((p) => (days.get(p.id) || []).filter((day) => day.date >= from && day.date <= to && day.lateCounted > 0).map((day) => ({ ...person(p), date: day.date, shift: day.code || '', startTime: day.start ? hhmm(Date.parse(day.start)) : '', inTime: day.inAt ? hhmm(Date.parse(day.inAt)) : '', lateMinutes: day.lateCounted })))
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    return res.status(200).json({ from, to, grace: rules.lateGrace, rows });
  }

  // Late pattern, for discipline reference: the days counted late in each of the last months.
  if (req.method === 'GET' && action === 'attendance_late_pattern') {
    const thisMonth = today().slice(0, 7);
    const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5)) - 1 - (5 - index), 1)).toISOString().slice(0, 7));
    const [people, rules] = await Promise.all([active(), loadRules(db)]);
    // The days counted late in each month, for each person, kept as a small summary (days and minutes, no clock times) so the clocks are read as little as possible:
    //  - a month that has finished is worked out once and kept;
    //  - this month is kept up to yesterday, and each time only the days since then are read (normally just today, which can still change);
    //  - Refresh (refresh=1) works everything out again, for when an old day was corrected.
    type Sum = Record<string, { days: number; minutes: number }>;
    const KEY = 'late_pattern_cache', BRANCH = 'AraOffice Charts Cache';
    const refresh = req.query.refresh === '1';
    let kept: { grace?: number; months?: Record<string, Sum>; current?: { month: string; through: string; people: Sum } } = {};
    let branch: any = null;
    try {
      branch = await branchId(db, BRANCH, false);
      if (branch && !refresh) { const { data: row } = await db.from('portal_state').select('payload').eq('branch_id', branch).eq('state_key', KEY).maybeSingle(); if (row?.payload?.grace === rules.lateGrace) kept = row.payload; }
    } catch { /* no saved summary: work it out */ }
    const summarize = async (from: string, to: string): Promise<Sum> => {
      const days = buildDaysFrom(await fetchData(db, from, to, people.map((p) => p.id)), people, from, to, rules);
      const out: Sum = {};
      for (const p of people) { const own = (days.get(p.id) || []).filter((day) => day.lateCounted > 0); if (own.length) out[p.id] = { days: own.length, minutes: own.reduce((total, day) => total + day.lateCounted, 0) }; }
      return out;
    };
    const add = (a: Sum, b: Sum): Sum => { const out: Sum = { ...a }; for (const [id, v] of Object.entries(b)) out[id] = { days: (out[id]?.days || 0) + v.days, minutes: (out[id]?.minutes || 0) + v.minutes }; return out; };
    const month: Record<string, Sum> = {}, closed: Record<string, Sum> = { ...(kept.months || {}) };
    let learned = false;
    for (const name of months) {
      if (name < thisMonth) {
        if (!closed[name]) { const last = new Date(Date.UTC(Number(name.slice(0, 4)), Number(name.slice(5)), 0)).toISOString().slice(0, 10); closed[name] = await summarize(`${name}-01`, last); learned = true; }
        month[name] = closed[name];
      }
    }
    const first = `${thisMonth}-01`, yesterday = addDay(today(), -1);
    let current = kept.current && kept.current.month === thisMonth ? kept.current : { month: thisMonth, through: addDay(first, -1), people: {} as Sum };
    if (current.through < yesterday) { current = { month: thisMonth, through: yesterday, people: add(current.people, await summarize(addDay(current.through, 1), yesterday)) }; learned = true; }
    month[thisMonth] = add(current.people, await summarize(today(), today()));
    if (learned && userId) {
      try {
        const id = branch || await branchId(db, BRANCH, true);
        const keep = Object.fromEntries(Object.entries(closed).filter(([name]) => name < thisMonth).slice(-12));
        const row: any = { branch_id: id, state_key: KEY, payload: { grace: rules.lateGrace, months: keep, current }, updated_at: new Date().toISOString(), updated_by: userId };
        const { data: existing } = await db.from('portal_state').select('state_key').eq('branch_id', id).eq('state_key', KEY).maybeSingle();
        if (existing) await db.from('portal_state').update(row).eq('branch_id', id).eq('state_key', KEY); else await db.from('portal_state').insert(row);
      } catch { /* the figures are still returned; they are just not kept */ }
    }
    const rows = people.map((p) => {
      const perMonth = months.map((name) => ({ month: name, days: month[name]?.[p.id]?.days || 0, minutes: month[name]?.[p.id]?.minutes || 0 }));
      return { ...person(p), perMonth, total: perMonth.reduce((total, item) => total + item.days, 0) };
    }).filter((row) => row.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return res.status(200).json({ months, rows, grace: rules.lateGrace });
  }

  // OT: every day with extra time, and HR's decision on it.
  if (req.method === 'GET' && action === 'attendance_ot') {
    const month = monthOf(req.query.month);
    const [people, rules, data] = await Promise.all([active(), loadRules(db), fetchData(db, `${month}-01`, monthEnd(month))]);
    const days = buildDaysFrom(data, people, `${month}-01`, monthEnd(month), rules);
    const rows: any[] = [];
    for (const p of people) for (const day of days.get(p.id) || []) if (day.otCounted > 0) { const view = dayView(day); rows.push({ ...person(p), date: day.date, shift: day.code, startTime: view.startTime, endTime: view.endTime, inTime: view.inTime, outTime: view.outTime, dayOff: !day.start, captured: day.otCounted, status: day.otStatus, approved: day.otApproved, rate: day.otRate, parts: day.otParts, note: day.otNote }); }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    return res.status(200).json({ month, rows });
  }
  if (req.method === 'POST' && action === 'attendance_ot_decide') {
    const id = text(body.id, 60), date = isDate(body.date) ? String(body.date) : '', status = String(body.status);
    if (!id || !date) throw fail(400, 'Choose a person and a date.');
    if (!['approved', 'rejected'].includes(status)) throw fail(400, 'Choose approve or reject.');
    const { data: one } = await db.from('hr_employees').select(PERSON).eq('id', id).maybeSingle();
    if (!one) throw fail(404, 'Staff member not found.');
    const rules = await loadRules(db);
    const day = ((await buildDays(db, [one], date, date, rules)).get(id) || [])[0];
    if (!day || day.otCounted <= 0) throw fail(400, 'There is no extra time to decide on that date.');
    const gross = status === 'approved' ? wholeHours(Math.min(day.otCounted, Math.round(Number(body.minutes ?? day.otCounted))), rules.policyFor(date)) : 0;
    const pay = gross > 0 ? await otDecision(db, one, date, gross, rules.policyFor(date)) : null;
    if (status === 'approved' && !pay?.parts.length) throw fail(400, `OT is counted in whole hours, at least ${hoursMinutesText(rules.policyFor(date).minMinutes)}.`);
    const { error } = await db.from('hr_attendance_ot').upsert({ employee_id: id, work_date: date, captured_minutes: day.otCounted, status, approved_minutes: pay ? pay.net : 0, multiplier: pay ? pay.parts[0].multiplier : 1.5, parts: pay ? pay.parts : [], note: text(body.note, 300), decided_by: userLabel, decided_at: new Date().toISOString() }, { onConflict: 'employee_id,work_date' });
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  // Corrections asked by staff: HR can decide any of them.
  if (req.method === 'GET' && action === 'attendance_requests') {
    const status = req.query.status === 'all' ? 'all' : 'pending';
    // A range of dates (from and to, YYYY-MM-DD): a calendar month, or a payroll period (20th to 19th). Any range can be looked at, not only the latest 100 requests.
    const dateOk = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    const from = dateOk(req.query.from) ? String(req.query.from) : '', to = dateOk(req.query.to) ? String(req.query.to) : '';
    let query = db.from('hr_attendance_requests').select('*').neq('status', 'draft').order('created_at', { ascending: false }).limit(from && to ? 400 : 100);
    if (from && to) query = query.gte('work_date', from).lte('work_date', to);
    if (status === 'pending') query = query.in('status', ['pending', 'supervisor_approved']);
    const { data, error } = await query;
    if (error) throw error;
    // OT that HR approved without a request (the ones brought over from Infotech) is listed too, read only, when decided requests are shown.
    let extra: any[] = [];
    if (status === 'all') {
      const since = from || addDay(today(), -90);
      let otQuery = db.from('hr_attendance_ot').select('id,employee_id,work_date,status,approved_minutes,multiplier,parts,note,decided_by,decided_at').eq('status', 'approved').gte('work_date', since).order('work_date', { ascending: false }).limit(400);
      if (to) otQuery = otQuery.lte('work_date', to);
      const { data: otRows } = await otQuery;
      const asked = new Set((data || []).filter((row: any) => !['rejected', 'cancelled'].includes(row.status) && !isMissedClock(row.reason)).map((row: any) => `${row.employee_id}|${row.work_date}`));
      extra = (otRows || []).filter((row: any) => !asked.has(`${row.employee_id}|${row.work_date}`));
    }
    const ids = [...new Set([...(data || []), ...extra].map((row: any) => row.employee_id))];
    const { data: people } = ids.length ? await db.from('hr_employees').select('id,full_name,company,employee_code').in('id', ids) : { data: [] };
    const names = new Map<string, string>((people || []).map((p: any) => [p.id, `${p.full_name} (${p.company} ${p.employee_code})`]));
    const companyOf = new Map<string, string>((people || []).map((p: any) => [p.id, p.company]));
    const extraDetails = await otDetails(db, extra.map((row: any) => ({ key: `ot-${row.id}`, employee_id: row.employee_id, work_date: String(row.work_date), asked: Number(row.approved_minutes || 0), state: 'approved' as const })));
    const listed = (extra || []).map((row: any) => {
      const detail = extraDetails.get(`ot-${row.id}`), there = /approved there: ([^)]*)\)/.exec(String(row.note || ''))?.[1];
      return {
        id: `ot-${row.id}`, employeeId: row.employee_id, name: names.get(row.employee_id) || '', date: row.work_date, inTime: '', outTime: '', otMinutes: Number(row.approved_minutes || 0), otText: minutesText(Number(row.approved_minutes || 0)), reason: 'Overtime', remarks: row.decided_by === 'Infotech migration' ? `Brought over from Infotech${there ? ` (${there} there)` : ''}` : String(row.note || ''),
        status: 'approved', supervisorDecidedBy: '', supervisorNote: '', decidedBy: row.decided_by, decidedAt: row.decided_at, note: '', rate: null, createdAt: row.decided_at, company: companyOf.get(row.employee_id) || '', otPreview: detail?.pay || '', ...(detail?.clockIn !== undefined ? { clockIn: detail.clockIn, clockOut: detail.clockOut } : {}), ...(detail?.shiftCode !== undefined ? { shiftCode: detail.shiftCode, shiftStart: detail.shiftStart, shiftEnd: detail.shiftEnd } : {}), readOnly: true,
      };
    });
    const requests = await withOtPreview(db, (data || []).map((row: any) => ({ ...requestRow(row, names), company: companyOf.get(row.employee_id) || '' })), data || []);
    return res.status(200).json({ requests: [...requests, ...listed] });
  }
  if (req.method === 'POST' && action === 'attendance_request_decide') {
    await hrDecide(db, text(body.id, 60), String(body.decision), text(body.note, 300), userLabel || 'HR', Number(body.rate), body.minutes);
    return res.status(200).json({ success: true });
  }

  if (req.method === 'GET' && action === 'attendance_clocks') {
    const id = text(req.query.id, 60), date = isDate(req.query.date) ? String(req.query.date) : today();
    const readClocks = (columns: string) => db.from('hr_attendance_clocks').select(columns).eq('employee_id', id).gte('clock_at', `${addDay(date, -1)}T12:00:00+08:00`).lte('clock_at', `${addDay(date, 1)}T12:00:00+08:00`).order('clock_at');
    let { data, error } = await readClocks('id,kind,clock_at,distance_m,within_place,accuracy_m,device,remarks,address,latitude,longitude,hr_clock_places(name)');
    if (error) ({ data, error } = await readClocks('id,kind,clock_at,distance_m,within_place,accuracy_m,device,hr_clock_places(name)')); // before the migration
    if (error) throw error;
    return res.status(200).json({ clocks: (data || []).map((row: any) => ({ id: row.id, source: clockSource(row.device), kind: row.kind, at: row.clock_at, time: hhmm(Date.parse(row.clock_at)), date: new Date(Date.parse(row.clock_at) + 8 * HOUR).toISOString().slice(0, 10), place: row.hr_clock_places?.name || '', remarks: row.remarks || '', address: row.address || '', map: row.latitude != null ? `https://www.google.com/maps?q=${row.latitude},${row.longitude}` : '', distance: row.distance_m, accuracy: row.accuracy_m === null ? null : Math.round(row.accuracy_m), anywhere: row.within_place === null && clockSource(row.device) === 'phone', fromRequest: clockSource(row.device) === 'request', device: row.device })) });
  }

  // Annual leave credit used in hours: what a day already has, and the person's Annual Leave balance.
  // Credit hours balances: everyone's balance, one person's movements, adding earned hours (or a correction), and removing a wrong entry.
  if (req.method === 'GET' && action === 'attendance_credit_hours_list') {
    const { data: people, error } = await db.from('hr_employees').select('id,company,employee_code,full_name,designation').eq('status', 'Active').order('company').order('employee_code').limit(300);
    if (error) throw error;
    const balance = await creditMinutes(db);
    if (!balance.ok) throw fail(409, 'Credit hours are not set up yet. Run the migration 202611040002_credit_hours_balance first.');
    return res.status(200).json({ rows: (people || []).map((p: any) => ({ id: p.id, company: p.company, code: p.employee_code, name: p.full_name, designation: p.designation || '', minutes: balance.totals.get(p.id) || 0 })) });
  }
  // The credit hours report (Reports tab): each staff member's balance, what was earned and used in a period, and the entries.
  if (req.method === 'GET' && action === 'attendance_credit_hours_report') {
    const dateOk = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    const from = dateOk(req.query.from) ? String(req.query.from) : `${today().slice(0, 4)}-01-01`, to = dateOk(req.query.to) ? String(req.query.to) : today();
    const { data: people, error } = await db.from('hr_employees').select('id,company,employee_code,full_name,designation').eq('status', 'Active').order('company').order('employee_code').limit(300);
    if (error) throw error;
    const balance = await creditMinutes(db);
    if (!balance.ok) throw fail(409, 'Credit hours are not set up yet. Run the migration 202611040002_credit_hours_balance first.');
    const { data: entries } = await db.from('hr_credit_hours').select('employee_id,entry_date,minutes,kind,note,created_by').gte('entry_date', from).lte('entry_date', to).order('entry_date').limit(5000);
    const scope = only ? new Set<string>(only) : null;
    const rows = (people || []).filter((p: any) => !scope || scope.has(p.id)).map((p: any) => {
      const mine = (entries || []).filter((entry: any) => entry.employee_id === p.id);
      return { id: p.id, company: p.company, code: p.employee_code, name: p.full_name, designation: p.designation || '', balance: balance.totals.get(p.id) || 0, earned: mine.filter((entry: any) => Number(entry.minutes) > 0).reduce((total: number, entry: any) => total + Number(entry.minutes), 0), used: mine.filter((entry: any) => Number(entry.minutes) < 0).reduce((total: number, entry: any) => total + Math.abs(Number(entry.minutes)), 0), entries: mine.map((entry: any) => ({ date: entry.entry_date, minutes: Number(entry.minutes), kind: entry.kind, note: entry.note || '', by: entry.created_by || '' })) };
    });
    return res.status(200).json({ from, to, rows });
  }
  if (req.method === 'GET' && action === 'attendance_credit_hours_entries') {
    const id = text(req.query.id, 60);
    const { data, error } = await db.from('hr_credit_hours').select('id,entry_date,minutes,kind,note,created_by').eq('employee_id', id).order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    return res.status(200).json({ entries: data || [] });
  }
  // Bulk: the same credit hours for several staff at once (for example everyone who went to an outside programme).
  if (req.method === 'POST' && action === 'attendance_credit_hours_add_bulk') {
    const ids: string[] = [...new Set<string>((Array.isArray(body.ids) ? body.ids : []).map((item: unknown) => text(item, 60)).filter(Boolean))].slice(0, 300);
    const date = isDate(body.date) ? String(body.date) : today(), minutes = Math.round(Number(body.minutes)), note = text(body.note, 200);
    if (!ids.length) throw fail(400, 'Choose at least one staff member.');
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 6000) throw fail(400, 'Enter the hours earned as a number more than zero, for example 2 or 1.5.');
    if (note.length < 2) throw fail(400, 'Write why (for example: outside programme 14/11).');
    const balance = await creditMinutes(db);
    if (!balance.ok) throw fail(409, 'Credit hours are not set up yet. Run the migration 202611040002_credit_hours_balance first.');
    const { data: people, error: peopleError } = await db.from('hr_employees').select('id,full_name').eq('status', 'Active').in('id', ids);
    if (peopleError) throw peopleError;
    const scope = only ? new Set<string>(only) : null;
    const chosen = (people || []).filter((p: any) => !scope || scope.has(p.id));
    if (!chosen.length) throw fail(400, 'None of the chosen staff can be given credit hours.');
    const { error } = await db.from('hr_credit_hours').insert(chosen.map((p: any) => ({ employee_id: p.id, entry_date: date, minutes, kind: 'earn', note, created_by: userLabel })));
    if (error) throw error;
    await db.from('hr_audit').insert(chosen.map((p: any) => ({ employee_id: p.id, action: 'update', changes: { credit_hours: `+${hm(minutes)} (earn) on ${date}`, note, by: userLabel, bulk: chosen.length } })));
    return res.status(200).json({ success: true, added: chosen.length, skipped: ids.length - chosen.length });
  }
  if (req.method === 'POST' && action === 'attendance_credit_hours_add') {
    const id = text(body.id, 60), date = isDate(body.date) ? String(body.date) : today(), kind = body.kind === 'adjust' ? 'adjust' : 'earn';
    const minutes = Math.round(Number(body.minutes));
    if (!id) throw fail(400, 'Choose a person.');
    if (!Number.isFinite(minutes) || minutes === 0 || Math.abs(minutes) > 6000) throw fail(400, 'Enter the hours as a number, for example 1 hour or 90 minutes.');
    if (kind === 'earn' && minutes < 0) throw fail(400, 'Hours earned must be more than zero. Use a correction to take hours off.');
    if (text(body.note, 200).length < 2) throw fail(400, 'Write why (for example: meeting 17/4, reset hours).');
    const balance = await creditMinutes(db, [id]);
    if (!balance.ok) throw fail(409, 'Credit hours are not set up yet. Run the migration 202611040002_credit_hours_balance first.');
    if ((balance.totals.get(id) || 0) + minutes < 0) throw fail(400, `That would take the balance below zero (${hm(balance.totals.get(id) || 0)} now).`);
    const { error } = await db.from('hr_credit_hours').insert({ employee_id: id, entry_date: date, minutes, kind, note: text(body.note, 200), created_by: userLabel });
    if (error) throw error;
    await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { credit_hours: `${minutes > 0 ? '+' : ''}${hm(minutes)} (${kind}) on ${date}`, note: text(body.note, 200), by: userLabel } });
    return res.status(200).json({ success: true });
  }
  if (req.method === 'POST' && action === 'attendance_credit_hours_entry_delete') {
    const entryId = text(body.entryId, 60);
    const { data: entry } = await db.from('hr_credit_hours').select('id,employee_id,minutes,kind,entry_date,use_id').eq('id', entryId).maybeSingle();
    if (!entry) throw fail(404, 'That entry was not found.');
    if (entry.use_id) throw fail(400, 'This was taken when credit hours were used on a day. Remove it from that day on the Today tab.');
    const balance = await creditMinutes(db, [entry.employee_id]);
    if (Number(entry.minutes) > 0 && (balance.totals.get(entry.employee_id) || 0) - Number(entry.minutes) < 0) throw fail(400, 'Removing this would take the balance below zero.');
    const { error } = await db.from('hr_credit_hours').delete().eq('id', entryId);
    if (error) throw error;
    await db.from('hr_audit').insert({ employee_id: entry.employee_id, action: 'update', changes: { credit_hours_entry_removed: `${hm(Number(entry.minutes))} (${entry.kind}) of ${entry.entry_date}`, by: userLabel } });
    return res.status(200).json({ success: true });
  }
  if (req.method === 'GET' && action === 'attendance_credit_info') {
    const id = text(req.query.id, 60), date = isDate(req.query.date) ? String(req.query.date) : today();
    const year = date.slice(0, 4);
    const [uses, yearUses] = await Promise.all([
      db.from('hr_credit_hour_use').select('id,kind,hours,note,created_by').eq('employee_id', id).eq('work_date', date),
      db.from('hr_credit_hour_use').select('hours').eq('employee_id', id).gte('work_date', `${year}-01-01`).lte('work_date', `${year}-12-31`),
    ]);
    if (uses.error) throw fail(409, 'Credit hours are not set up yet. Run the migration 202611040001_credit_hour_use first.');
    const balance = await creditMinutes(db, [id]);
    return res.status(200).json({ balanceMinutes: balance.ok ? (balance.totals.get(id) || 0) : null, uses: uses.data || [], usedThisYear: (yearUses.data || []).reduce((sum: number, row: any) => sum + Number(row.hours), 0) });
  }
  if (req.method === 'POST' && action === 'attendance_credit_use_add') {
    const id = text(body.id, 60), date = isDate(body.date) ? String(body.date) : '', kind = body.kind === 'early' ? 'early' : 'late';
    const hours = Math.round(Number(body.hours) * 4) / 4;
    if (!id || !date) throw fail(400, 'Choose a person and a date.');
    if (!(hours >= 0.25 && hours <= 12)) throw fail(400, 'Enter the hours, from 0.25 to 12.');
    // Credit hours are a record only (as in Infotech): they do not come off the Annual Leave balance, so no part-days appear there.
    // `alreadyCounted`: the hours were already taken off in the Excel balance that was imported, so only the day is adjusted and the balance is left alone.
    const alreadyCounted = body.alreadyCounted === true || date < CREDIT_BALANCE_FROM;
    const minutes = Math.round(hours * 60), balance = await creditMinutes(db, [id]);
    if (!alreadyCounted && balance.ok && (balance.totals.get(id) || 0) < minutes) throw fail(400, `Only ${hm(balance.totals.get(id) || 0)} of credit hours left, and ${hm(minutes)} was asked for.`);
    const { data: inserted, error } = await db.from('hr_credit_hour_use').insert({ employee_id: id, work_date: date, kind, hours, days: Math.round((hours / CREDIT_HOURS_PER_DAY) * 100) / 100 || 0.01, note: text(body.note, 200), created_by: userLabel }).select('id').single();
    if (error) throw fail(error.code === '23505' ? 409 : 400, error.code === '23505' ? `Credit hours are already recorded for this ${kind === 'late' ? 'late arrival' : 'early leave'}. Remove it first to change it.` : error.message);
    if (balance.ok && !alreadyCounted) await db.from('hr_credit_hours').insert({ employee_id: id, entry_date: date, minutes: -minutes, kind: 'use', note: `${kind === 'late' ? 'Came in late' : 'Left early'}${text(body.note, 150) ? ': ' + text(body.note, 150) : ''}`, use_id: inserted.id, created_by: userLabel });
    await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { credit_hours_used: `${hours} h for ${kind === 'late' ? 'a late arrival' : 'an early leave'} on ${date}`, note: text(body.note, 200), by: userLabel } });
    return res.status(200).json({ success: true });
  }
  if (req.method === 'POST' && action === 'attendance_credit_use_delete') {
    const useId = text(body.useId, 60);
    const { data: use } = await db.from('hr_credit_hour_use').select('id,employee_id,work_date,kind,hours,days').eq('id', useId).maybeSingle();
    if (!use) throw fail(404, 'That credit use was not found.');
    const { error } = await db.from('hr_credit_hour_use').delete().eq('id', useId);
    if (error) throw error;
    await db.from('hr_audit').insert({ employee_id: use.employee_id, action: 'update', changes: { credit_hours_removed: `${use.hours} h on ${use.work_date}`, by: userLabel } });
    return res.status(200).json({ success: true });
  }

  // HR adds or removes a clock directly (for example a clock the person could not make). Each change is written to the audit trail.
  if (req.method === 'POST' && action === 'attendance_clock_add') {
    const id = text(body.id, 60), date = isDate(body.date) ? String(body.date) : '';
    let kind = body.kind === 'out' ? 'out' : 'in';
    if (!id || !date) throw fail(400, 'Choose a person and a date.');
    if (!isTime(body.time)) throw fail(400, 'Enter the time as hh:mm.');
    let clockAt = at(date, String(body.time)); if (body.nextDay === true) clockAt += 24 * HOUR;
    if (clockAt > Date.now() + 5 * MIN) throw fail(400, 'A clock cannot be in the future.');
    await assertPayrollOpen(db, id, date);
    // kind 'auto' (the in-place edit screen): the clock after an in is an out, otherwise it is an in, going by the clock just before it.
    if (body.kind === 'auto') { const { data: before } = await db.from('hr_attendance_clocks').select('kind').eq('employee_id', id).lt('clock_at', new Date(clockAt).toISOString()).gte('clock_at', new Date(clockAt - 20 * HOUR).toISOString()).order('clock_at', { ascending: false }).limit(1); kind = before?.[0]?.kind === 'in' ? 'out' : 'in'; }
    const { data: existing, error: existingError } = await db.from('hr_attendance_clocks').select('id').eq('employee_id', id).eq('kind', kind).eq('clock_at', new Date(clockAt).toISOString()).limit(1);
    if (existingError) throw existingError;
    if (existing?.length) return res.status(200).json({ success: true, duplicate: true });
    const { error } = await db.from('hr_attendance_clocks').insert({ employee_id: id, kind, clock_at: new Date(clockAt).toISOString(), within_place: null, device: `hr:${date}` });
    if (error) throw error;
    await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { clock_added: `${kind} ${date} ${body.time}${body.nextDay === true ? ' (next day)' : ''}`, note: text(body.note, 200), by: userLabel } });
    return res.status(200).json({ success: true });
  }
  // Change the time of a clock (the in-place edit screen). The date stays the one the clock is on, unless the new time is marked as the next day (a night shift's out).
  if (req.method === 'POST' && action === 'attendance_clock_update') {
    const clockId = text(body.clockId, 60);
    if (!isTime(body.time)) throw fail(400, 'Enter the time as hh:mm.');
    const { data: one } = await db.from('hr_attendance_clocks').select('employee_id,kind,clock_at').eq('id', clockId).maybeSingle();
    if (!one) throw fail(404, 'That clock was not found.');
    const date = isDate(body.date) ? String(body.date) : new Date(Date.parse(one.clock_at) + 8 * HOUR).toISOString().slice(0, 10);
    let clockAt = at(date, String(body.time)); if (body.nextDay === true) clockAt += 24 * HOUR;
    if (clockAt > Date.now() + 5 * MIN) throw fail(400, 'A clock cannot be in the future.');
    await assertPayrollOpen(db, one.employee_id, new Date(Date.parse(one.clock_at) + 8 * HOUR).toISOString().slice(0, 10));
    await assertPayrollOpen(db, one.employee_id, new Date(clockAt + 8 * HOUR).toISOString().slice(0, 10));
    const { error } = await db.from('hr_attendance_clocks').update({ clock_at: new Date(clockAt).toISOString(), device: `hr:${date}` }).eq('id', clockId);
    if (error) throw error;
    await db.from('hr_audit').insert({ employee_id: one.employee_id, action: 'update', changes: { clock_changed: `${one.kind} ${new Date(Date.parse(one.clock_at) + 8 * HOUR).toISOString().slice(0, 16).replace('T', ' ')} to ${new Date(clockAt + 8 * HOUR).toISOString().slice(0, 16).replace('T', ' ')}`, note: text(body.note, 200), by: userLabel } });
    return res.status(200).json({ success: true });
  }
  if (req.method === 'POST' && action === 'attendance_clock_delete') {
    const clockId = text(body.clockId, 60);
    const { data: one } = await db.from('hr_attendance_clocks').select('employee_id,kind,clock_at').eq('id', clockId).maybeSingle();
    if (!one) throw fail(404, 'That clock was not found.');
    await assertPayrollOpen(db, one.employee_id, new Date(Date.parse(one.clock_at) + 8 * HOUR).toISOString().slice(0, 10));
    const { error } = await db.from('hr_attendance_clocks').delete().eq('id', clockId);
    if (error) throw error;
    await db.from('hr_audit').insert({ employee_id: one.employee_id, action: 'update', changes: { clock_deleted: `${one.kind} ${hhmm(Date.parse(one.clock_at))} on ${new Date(Date.parse(one.clock_at) + 8 * HOUR).toISOString().slice(0, 10)}`, note: text(body.note, 200), by: userLabel } });
    return res.status(200).json({ success: true });
  }

  // Import of an Infotech Individual Attendance report (its Export CSV). Every clock imported is tagged with the shift date it
  // belongs to, so importing again replaces those days with what Infotech now says (for example after a correction there)
  // and leaves everything else, including clocks made on the phones, alone. Days with a clock and no roster row get one from the report.
  if (req.method === 'POST' && action === 'attendance_import') {
    const rows: any[] = Array.isArray(body.rows) ? body.rows.slice(0, 20000) : [];
    if (!rows.length) throw fail(400, 'No attendance rows were found in that file.');
    const { data: people, error: peopleError } = await db.from('hr_employees').select('id,company,employee_code');
    if (peopleError) throw peopleError;
    const idOf = new Map<string, string>((people || []).map((p: any) => [`${p.company}|${String(p.employee_code).toUpperCase()}`, p.id]));
    const unknown = new Set<string>(); const clocks: any[] = []; const touched = new Map<string, Set<string>>(); const rosterWant: any[] = []; const dates = new Set<string>();
    const hm = (value: number) => { const h = Math.trunc(value), m = Math.round((value - h) * 100); return h >= 0 && h < 24 && m >= 0 && m < 60 ? [h, m] : null; };
    for (const row of rows) {
      const date = isDate(row.date) ? String(row.date) : '';
      const code = `${text(row.company, 4).toUpperCase()}|${text(row.code, 30).toUpperCase()}`;
      if (!date) continue;
      const id = idOf.get(code);
      if (!id) { unknown.add(code.replace('|', ' ')); continue; }
      dates.add(date); if (!touched.has(date)) touched.set(date, new Set()); touched.get(date)!.add(id);
      const shift = text(row.shift, 20).toUpperCase(), tin = Number(row.in), tout = Number(row.out);
      const a = tin > 0 ? hm(tin) : null, b = tout > 0 ? hm(tout) : null;
      if (a) {
        const stamp = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        clocks.push({ employee_id: id, kind: 'in', clock_at: new Date(at(date, stamp(a[0], a[1]))).toISOString(), within_place: null, device: `infotech:${date}` });
        if (b) clocks.push({ employee_id: id, kind: 'out', clock_at: new Date(at(date, stamp(b[0], b[1])) + (b[0] * 60 + b[1] <= a[0] * 60 + a[1] ? 24 * HOUR : 0)).toISOString(), within_place: null, device: `infotech:${date}` });
      }
      if (shift === 'RD' || shift === 'OD') rosterWant.push({ employee_id: id, work_date: date, shift, works: false, note: '' });
      else if (a && shift && shift !== 'DOCRSD') rosterWant.push({ employee_id: id, work_date: date, shift: shift === 'DR96' ? 'OH' : shift, works: true, note: '' });
    }
    if (!dates.size) throw fail(400, unknown.size ? `None of the staff in this file are in HR: ${[...unknown].slice(0, 6).join(', ')}.` : 'No dates were found. Use the Export CSV of the Individual Attendance report.');
    // replace what an earlier import said for these people and days, then add what the report says now
    let removed = 0;
    for (const [date, set] of touched) { const { count } = await db.from('hr_attendance_clocks').delete({ count: 'exact' }).in('employee_id', [...set]).eq('device', `infotech:${date}`); removed += count || 0; }
    for (let i = 0; i < clocks.length; i += 300) { const { error } = await db.from('hr_attendance_clocks').insert(clocks.slice(i, i + 300)); if (error) throw error; }
    const sorted = [...dates].sort();
    // A day that already has a roster row keeps it: only missing days are added (one row per person and day). The database ignores a clash instead of failing,
    // so this does not depend on reading back every existing row (a read stops at 1,000 rows).
    const seen = new Set<string>();
    const rosterAdd = rosterWant.filter((r) => { const key = `${r.employee_id}|${r.work_date}`; if (seen.has(key)) return false; seen.add(key); return true; });
    for (let i = 0; i < rosterAdd.length; i += 300) { const { error } = await db.from('hr_roster').upsert(rosterAdd.slice(i, i + 300), { onConflict: 'employee_id,work_date', ignoreDuplicates: true }); if (error) throw error; }
    return res.status(200).json({ success: true, from: sorted[0], to: sorted[sorted.length - 1], days: dates.size, people: new Set([...touched.values()].flatMap((set) => [...set])).size, added: clocks.length, replaced: removed, rosterAdded: rosterAdd.length, unknown: [...unknown] });
  }

  if (req.method === 'GET' && action === 'attendance_places') {
    const { data, error } = await db.from('hr_clock_places').select('id,name,company,latitude,longitude,radius_m,active').order('company').order('name');
    if (error) throw error;
    return res.status(200).json({ places: (data || []).map((row: any) => ({ id: row.id, name: row.name, company: row.company, latitude: row.latitude, longitude: row.longitude, radius: row.radius_m, active: row.active })) });
  }
  if (req.method === 'POST' && action === 'attendance_place_save') {
    const name = text(body.name, 80), lat = Number(body.latitude), lng = Number(body.longitude), radius = Math.round(Number(body.radius));
    if (!name) throw fail(400, 'Enter a name for the place.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw fail(400, 'Enter the latitude and longitude, or use your current location.');
    if (!Number.isFinite(radius) || radius < 20 || radius > 2000) throw fail(400, 'The distance must be between 20 and 2000 metres.');
    const row = { name, company: ['KJ', 'SK'].includes(String(body.company)) ? String(body.company) : '', latitude: lat, longitude: lng, radius_m: radius, active: body.active !== false };
    const id = text(body.id, 60);
    const { error } = id ? await db.from('hr_clock_places').update(row).eq('id', id) : await db.from('hr_clock_places').insert(row);
    if (error) throw error;
    return res.status(200).json({ success: true });
  }
  if (req.method === 'POST' && action === 'attendance_place_delete') {
    const { error } = await db.from('hr_clock_places').delete().eq('id', text(body.id, 60));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (req.method === 'GET' && action === 'attendance_people') {
    const { data, error } = await db.from('hr_employees').select(`${PERSON},clock_mode,clock_place_ids`).eq('status', 'Active').order('full_name').limit(500);
    if (error) throw error;
    return res.status(200).json({ people: (data || []).map((row: any) => ({ ...person(row), mode: row.clock_mode, placeIds: row.clock_place_ids || [], clockRequired: row.clock_required || 'full', defaultShift: row.default_shift || '' })) });
  }
  if (req.method === 'POST' && action === 'attendance_person_save') {
    const id = text(body.id, 60), mode = body.mode === 'anywhere' ? 'anywhere' : 'places';
    const required = ['full', 'in_only', 'none'].includes(String(body.clockRequired)) ? String(body.clockRequired) : 'full';
    const defaultShift = text(body.defaultShift, 20).toUpperCase();
    const placeIds = (Array.isArray(body.placeIds) ? body.placeIds : []).map((item: unknown) => text(item, 60)).filter(Boolean).slice(0, 20);
    if (defaultShift) { const { data } = await db.from('hr_shift_times').select('code').eq('code', defaultShift).limit(1); if (!data?.length) throw fail(400, `The shift ${defaultShift} is not set up. Add it under Rules first.`); }
    const { error } = await db.from('hr_employees').update({ clock_mode: mode, clock_place_ids: placeIds, clock_required: required, default_shift: defaultShift, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { clock_mode: mode, clock_place_ids: placeIds, clock_required: required, default_shift: defaultShift, by: userLabel } });
    return res.status(200).json({ success: true });
  }
  // ---- OT policy (HR edits it in OT > Settings) and the OT summary ----
  if (req.method === 'GET' && action === 'attendance_ot_policy') {
    if (only) throw fail(403, 'Only HR can see the OT policy.');
    const rules = await loadRules(db);
    return res.status(200).json({ policy: rules.policy, defaults: DEFAULT_OT_POLICY, versions: rules.versions, today: today() });
  }
  // A change is saved as a new version "from" a date: OT dated on or after it follows the new settings, OT before it keeps the old ones.
  if (req.method === 'POST' && action === 'attendance_ot_policy_save') {
    if (only) throw fail(403, 'Only HR can change the OT policy.');
    let versions: OtPolicyVersion[] | null = null;
    if (body.reset !== true) {
      if (!isDate(body.from)) throw fail(400, 'Choose the date the new settings start from.');
      let policy: OtPolicy;
      try { policy = cleanPolicy(body.policy); } catch (cause) { throw fail(400, cause instanceof Error ? cause.message : 'Check the OT settings.'); }
      const current = await loadRules(db);
      versions = [...current.versions.filter((version) => version.from !== String(body.from)), { from: String(body.from), policy }].sort((a, b) => a.from.localeCompare(b.from));
      // The first version covers every date; it is kept only when it is not just the memo defaults.
      if (versions[0].from === '' && JSON.stringify({ ...versions[0].policy, minMinutes: 0 }) === JSON.stringify({ ...DEFAULT_OT_POLICY, minMinutes: 0 })) versions = versions.slice(1);
    }
    const patch: any = { id: 1, ot_policy: versions };
    if (versions && versions.length) patch.ot_min_minutes = versions[versions.length - 1].policy.minMinutes;
    const { error } = await db.from('hr_attendance_settings').upsert(patch, { onConflict: 'id' });
    if (error) { if (error.code === '42703') throw fail(400, 'The OT settings are not set up yet. Run supabase/migrations/202611170005_ot_policy.sql in Supabase first.'); throw error; }
    await db.from('hr_audit').insert({ employee_id: null, action: 'update', changes: { ot_policy: versions ? { from: String(body.from), settings: versions[versions.length - 1].policy } : 'reset to the memo defaults' }, changed_by: null });
    const rules = await loadRules(db);
    return res.status(200).json({ success: true, policy: rules.policy, versions: rules.versions });
  }
  // The OT claim status report (like Infotech's Attendance Request Status Report): every OT claim in a date range, grouped by staff member.
  if (req.method === 'GET' && action === 'attendance_ot_claims') {
    const dateOk = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    const from = dateOk(req.query.from) ? String(req.query.from) : `${today().slice(0, 7)}-01`, to = dateOk(req.query.to) ? String(req.query.to) : today();
    const { data: asked, error: askedError } = await db.from('hr_attendance_requests').select('*').neq('status', 'draft').gte('work_date', from).lte('work_date', to).order('work_date').limit(1500);
    if (askedError) throw askedError;
    const requests = (asked || []).filter((row: any) => !isMissedClock(row.reason) && (Number(row.ot_minutes) > 0 || /^(overtime|worked on rest day)/i.test(String(row.reason || ''))));
    const { data: decidedRows } = await db.from('hr_attendance_ot').select('id,employee_id,work_date,status,captured_minutes,approved_minutes,multiplier,parts,note,decided_by,decided_at').eq('status', 'approved').gte('work_date', from).lte('work_date', to).limit(3000);
    // A day that HR approved without an approved request (brought over from Infotech) is listed too, even when a new request for the same day is still waiting.
    const askedKey = new Set(requests.filter((row: any) => row.status === 'approved').map((row: any) => `${row.employee_id}|${row.work_date}`));
    const broughtOver = (decidedRows || []).filter((row: any) => !askedKey.has(`${row.employee_id}|${row.work_date}`));
    const ids = [...new Set([...requests, ...broughtOver].map((row: any) => row.employee_id))];
    const { data: people } = ids.length ? await db.from('hr_employees').select('id,company,employee_code,full_name,designation').in('id', ids) : { data: [] };
    const scope = only ? new Set<string>(only) : null;
    const byId = new Map<string, any>((people || []).filter((p: any) => !scope || scope.has(p.id)).map((p: any) => [p.id, p]));
    const approverIds = [...new Set(requests.map((row: any) => row.approver_id).filter(Boolean))];
    const { data: approvers } = approverIds.length ? await db.from('hr_employees').select('id,full_name').in('id', approverIds) : { data: [] };
    const approverName = new Map<string, string>((approvers || []).map((p: any) => [p.id, p.full_name]));
    const lines: OtLine[] = [...requests.map((row: any) => ({ key: row.id, employee_id: row.employee_id, work_date: String(row.work_date), asked: Number(row.ot_minutes), state: (row.status === 'approved' ? 'approved' : ['pending', 'supervisor_approved'].includes(row.status) ? 'open' : 'closed') as OtLine['state'] })), ...broughtOver.map((row: any) => ({ key: `ot-${row.id}`, employee_id: row.employee_id, work_date: String(row.work_date), asked: Number(row.approved_minutes || 0), state: 'approved' as const }))].filter((line) => byId.has(line.employee_id));
    const details = await otDetails(db, lines);
    const savedOt = new Map<string, any>((decidedRows || []).map((row: any) => [`${row.employee_id}|${row.work_date}`, row]));
    const day = (iso: string) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${iso}T00:00:00Z`).getUTCDay()];
    const atRates = (row: any) => { const out: Record<string, number> = { '1': 0, '1.5': 0, '2': 0, '3': 0 }; if (!row) return out; const parts: OtPart[] = Array.isArray(row.parts) && row.parts.length ? row.parts : [{ minutes: Number(row.approved_minutes || 0), multiplier: Number(row.multiplier) }]; for (const part of parts) { const key = String(Number(part.multiplier)); if (key in out) out[key] += Number(part.minutes || 0); } return out; };
    type Claim = { kind: string; late: number; early: number; original: Record<string, number>; requested: Record<string, number>; typedIn: string; typedOut: string; date: string; day: string; shift: string; shiftStart: string; shiftEnd: string; clockIn: string; clockOut: string; askedMinutes: number; approved: Record<string, number>; approvedMinutes: number; status: string; pendingWith: string; approvedBy: string; remarks: string; comments: string; applied: string; decided: string; pay: string; source: 'request' | 'infotech' };
    const claims = new Map<string, Claim[]>();
    const add = (employeeId: string, claim: Claim) => { const list = claims.get(employeeId) || []; list.push(claim); claims.set(employeeId, list); };
    for (const row of requests) {
      if (!byId.has(row.employee_id)) continue;
      const detail = details.get(row.id), saved = row.status === 'approved' ? savedOt.get(`${row.employee_id}|${row.work_date}`) : null;
      const status = row.status === 'pending' || row.status === 'supervisor_approved' ? 'Pending' : row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Cancelled';
      add(row.employee_id, { kind: detail?.kind || 'normal', late: detail?.late || 0, early: detail?.early || 0, original: detail?.original || atRates(null), requested: detail?.requested || atRates(null), typedIn: row.in_time ? String(row.in_time).slice(0, 5) : '', typedOut: row.out_time ? String(row.out_time).slice(0, 5) : '', date: row.work_date, day: day(row.work_date), shift: detail?.shiftCode || '', shiftStart: detail?.shiftStart || '', shiftEnd: detail?.shiftEnd || '', clockIn: detail?.clockIn || '', clockOut: detail?.clockOut || '', askedMinutes: detail?.otMinutes ?? Number(row.ot_minutes || 0), approved: atRates(saved), approvedMinutes: saved ? Number(saved.approved_minutes || 0) : 0, status, pendingWith: row.status === 'pending' ? approverName.get(row.approver_id) || 'Supervisor' : row.status === 'supervisor_approved' ? 'HR' : '', approvedBy: row.status === 'approved' ? row.decided_by || '' : '', remarks: row.remarks || '', comments: row.status === 'rejected' || row.status === 'approved' ? row.decision_note || row.supervisor_note || '' : '', applied: String(row.created_at || '').slice(0, 10), decided: row.decided_at ? String(row.decided_at).slice(0, 10) : '', pay: detail?.pay || '', source: 'request' });
    }
    for (const row of broughtOver) {
      if (!byId.has(row.employee_id)) continue;
      const detail = details.get(`ot-${row.id}`), there = /approved there: ([^)]*)\)/.exec(String(row.note || ''))?.[1];
      add(row.employee_id, { kind: detail?.kind || 'normal', late: detail?.late || 0, early: detail?.early || 0, original: detail?.original || atRates(null), requested: detail?.requested || atRates(row), typedIn: '', typedOut: '', date: row.work_date, day: day(row.work_date), shift: detail?.shiftCode || '', shiftStart: detail?.shiftStart || '', shiftEnd: detail?.shiftEnd || '', clockIn: detail?.clockIn || '', clockOut: detail?.clockOut || '', askedMinutes: Number(row.captured_minutes || row.approved_minutes || 0), approved: atRates(row), approvedMinutes: Number(row.approved_minutes || 0), status: 'Approved', pendingWith: '', approvedBy: row.decided_by === 'Infotech migration' ? 'Infotech' : row.decided_by || '', remarks: row.decided_by === 'Infotech migration' ? `Brought over from Infotech${there ? ` (${there} there)` : ''}` : String(row.note || ''), comments: '', applied: '', decided: row.decided_by === 'Infotech migration' ? '' : row.decided_at ? String(row.decided_at).slice(0, 10) : '', pay: detail?.pay || '', source: 'infotech' });
    }
    const staff = [...byId.values()].filter((p: any) => claims.has(p.id)).sort((a: any, b: any) => a.company.localeCompare(b.company) || a.employee_code.localeCompare(b.employee_code)).map((p: any) => ({ id: p.id, company: p.company, code: p.employee_code, name: p.full_name, designation: p.designation || '', group: /CLINIC ASSISTANT/i.test(p.designation || '') ? 'CA' : 'Others', claims: (claims.get(p.id) || []).sort((a, b) => a.date.localeCompare(b.date)) }));
    return res.status(200).json({ from, to, staff });
  }
  // OT approved in a date range (a month, or a payroll period), per staff member: hours at each rate, and what is still waiting.
  if (req.method === 'GET' && action === 'attendance_ot_summary') {
    const dateOk = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    const from = dateOk(req.query.from) ? String(req.query.from) : `${today().slice(0, 7)}-01`, to = dateOk(req.query.to) ? String(req.query.to) : today();
    const [{ data: approved, error: otError }, { data: waiting, error: waitError }] = await Promise.all([
      db.from('hr_attendance_ot').select('employee_id,work_date,approved_minutes,multiplier,parts').eq('status', 'approved').gte('work_date', from).lte('work_date', to).limit(5000),
      db.from('hr_attendance_requests').select('employee_id,work_date,ot_minutes,reason').in('status', ['pending', 'supervisor_approved']).gt('ot_minutes', 0).gte('work_date', from).lte('work_date', to).limit(2000),
    ]);
    if (otError || waitError) throw otError || waitError;
    const ids = [...new Set([...(approved || []), ...(waiting || [])].map((row: any) => row.employee_id))];
    const { data: people } = ids.length ? await db.from('hr_employees').select('id,company,employee_code,full_name,designation').in('id', ids) : { data: [] };
    const scope = only ? new Set<string>(only) : null;
    type Sum = { id: string; company: string; code: string; name: string; group: string; days: number; worked: number; at: Record<string, number>; hrp: number; waitingMinutes: number; waitingCount: number };
    const sums = new Map<string, Sum>();
    for (const p of people || []) { if (scope && !scope.has(p.id)) continue; sums.set(p.id, { id: p.id, company: p.company, code: p.employee_code, name: p.full_name, group: /CLINIC ASSISTANT/i.test(p.designation || '') ? 'CA' : 'Others', days: 0, worked: 0, at: { '1': 0, '1.5': 0, '2': 0, '3': 0 }, hrp: 0, waitingMinutes: 0, waitingCount: 0 }); }
    for (const row of approved || []) {
      const sum = sums.get(row.employee_id); if (!sum) continue;
      const parts: OtPart[] = Array.isArray(row.parts) && row.parts.length ? row.parts : [{ minutes: Number(row.approved_minutes || 0), multiplier: Number(row.multiplier) }];
      sum.days += 1; sum.worked += Number(row.approved_minutes || 0);
      for (const part of parts) { const key = String(Number(part.multiplier)); if (key in sum.at) sum.at[key] += Number(part.minutes || 0); sum.hrp += (Number(part.minutes || 0) / 60) * Number(part.multiplier); }
    }
    for (const row of waiting || []) { const sum = sums.get(row.employee_id); if (!sum || isMissedClock(row.reason)) continue; sum.waitingMinutes += Number(row.ot_minutes || 0); sum.waitingCount += 1; }
    const rows = [...sums.values()].filter((sum) => sum.days || sum.waitingCount).sort((a, b) => b.hrp - a.hrp || a.name.localeCompare(b.name));
    return res.status(200).json({ from, to, rows });
  }
  if (req.method === 'GET' && action === 'attendance_rules') {
    const rules = await loadRules(db);
    return res.status(200).json({ lateGrace: rules.lateGrace, earlyGrace: rules.earlyGrace, otMin: rules.otMin, times: [...rules.times.entries()].map(([key, value]) => ({ kind: key.split('|')[0], code: key.split('|')[1], start: value.start, end: value.end })).sort((a, b) => a.kind.localeCompare(b.kind) || a.start.localeCompare(b.start) || a.code.localeCompare(b.code)) });
  }
  if (req.method === 'POST' && action === 'attendance_rules_save') {
    const minutes = (value: unknown, label: string) => { const number = Math.round(Number(value)); if (!Number.isFinite(number) || number < 0 || number > 240) throw fail(400, `${label} must be between 0 and 240 minutes.`); return number; };
    const { error } = await db.from('hr_attendance_settings').upsert({ id: 1, late_grace_min: minutes(body.lateGrace, 'Late grace'), early_grace_min: minutes(body.earlyGrace, 'Early-out grace'), ot_min_minutes: minutes(body.otMin, 'Smallest extra time') });
    if (error) throw error;
    const rows = (Array.isArray(body.times) ? body.times : []).slice(0, 80).map((item: any) => {
      const code = text(item?.code, 20).toUpperCase(), kind = item?.kind === 'doctor' ? 'doctor' : 'staff';
      if (!code || !isTime(item?.start) || !isTime(item?.end)) throw fail(400, `Check the times for ${code || 'a shift'} (use hh:mm).`);
      return { code, kind, start_time: item.start, end_time: item.end };
    });
    if (rows.length) { const { error: timesError } = await db.from('hr_shift_times').upsert(rows, { onConflict: 'code,kind' }); if (timesError) throw timesError; }
    return res.status(200).json({ success: true });
  }
  throw fail(404, 'Unknown attendance action.');
}
