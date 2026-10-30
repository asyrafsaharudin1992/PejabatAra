import { createHash } from 'node:crypto';

// Attendance. Staff clock in and out on their own phone (Individual Sign In); HR sets where clocking is allowed and sees
// the day and the month. Rules follow Infotech and HR's answers:
//  - Late: up to the grace is not late; past it the full minutes are counted. It is a record for discipline reference only (no pay is deducted).
//  - Leaving early is not counted.
//  - OT: the extra time of a day (before the shift starts, after it ends, or a whole day worked on a day off) is captured
//    automatically; HR approves or rejects each one and chooses the rate. Pay is worked out later from basic salary.
//  - Everyone clocks in and out, except management (who do not clock). A forgotten clock is fixed with a request that the
//    supervisor or HR approves.
// Malaysia time is UTC+8 all year. Served inside the assessment (staff) and hr (office) functions, so no new Vercel function is added.
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTime = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const MIN = 60000, HOUR = 3600000;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const addDay = (date: string, by: number) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const at = (date: string, time: string) => Date.parse(`${date}T${time.slice(0, 5)}:00+08:00`);
const hhmm = (ms: number) => new Date(ms + 8 * HOUR).toISOString().slice(11, 16);
const monthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
const isDoctor = (designation: string) => /\b(DR|DOCTOR)\b/i.test(designation || '');
// Roster codes used before the KJ names, and the shift a person without a roster is expected on (office hours).
const OLD_CODES: Record<string, string> = { ASCL1: 'AM-9', ASCL2: 'AM-12', ASCL3: 'PM', ASCL4: 'AM-6' };
const OFFICE_CODE = 'AM-5';
const HOLIDAY_OFF_GROUPS = new Set(['SG-MNG', 'MLHL']);
const OT_RATES = [1, 1.5, 2, 3];

const sha = (value: string) => createHash('sha256').update(`clock:${value}`).digest('hex');
function metres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (degrees: number) => degrees * Math.PI / 180, earth = 6371000;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * earth * Math.asin(Math.sqrt(a)));
}

type Shift = { start: string; end: string };
type Rules = { lateGrace: number; earlyGrace: number; countEarly: boolean; otMin: number; times: Map<string, Shift> };
async function loadRules(db: any): Promise<Rules> {
  const [{ data: settings }, { data: times }] = await Promise.all([db.from('hr_attendance_settings').select('late_grace_min,early_grace_min,count_early_out,ot_min_minutes').eq('id', 1).maybeSingle(), db.from('hr_shift_times').select('code,kind,start_time,end_time')]);
  return { lateGrace: settings?.late_grace_min ?? 15, earlyGrace: settings?.early_grace_min ?? 15, countEarly: !!settings?.count_early_out, otMin: settings?.ot_min_minutes ?? 60, times: new Map((times || []).map((row: any) => [`${row.kind}|${row.code}`, { start: String(row.start_time).slice(0, 5), end: String(row.end_time).slice(0, 5) }])) };
}
function shiftTimes(rules: Rules, code: string, doctor: boolean) {
  const key = OLD_CODES[code] || code;
  return rules.times.get(`${doctor ? 'doctor' : 'staff'}|${key}`) || rules.times.get(`${doctor ? 'staff' : 'doctor'}|${key}`) || null;
}

export type Employee = { id: string; company: string; employee_code: string; full_name: string; designation: string; work_days: number[] | null; holiday_group: string | null; default_shift?: string | null; clock_required?: string | null };
export type Day = { date: string; code: string; start: string; end: string; status: string; inAt: string | null; outAt: string | null; late: number; lateCounted: number; early: number; earlyCounted: number; worked: number; ot: number; otCounted: number; otStatus: string; otApproved: number; otRate: number; otNote: string; leave: string };

// One entry per person and date between from and to: what was expected (roster, then holiday, then the usual shift on
// working weekdays), leave on that date, the clocks that match it, and HR's decision on its OT.
type Data = { roster: any[]; clocks: any[]; leave: any[]; holidays: any[]; ot: any[] };
// Everything a range needs, fetched at the same time (the database is far from the server, so one round of
// queries is much faster than several in turn). Pass ids to read only those people; leave it out for everyone.
export async function fetchData(db: any, from: string, to: string, ids?: string[]): Promise<Data> {
  const wide = { from: `${addDay(from, -1)}T00:00:00+08:00`, to: `${addDay(to, 2)}T00:00:00+08:00` };
  const only = (query: any) => ids ? query.in('employee_id', ids) : query;
  const [{ data: roster }, { data: clocks }, { data: leave }, { data: holidays }, { data: ot }] = await Promise.all([
    only(db.from('hr_roster').select('employee_id,work_date,shift,works').gte('work_date', from).lte('work_date', to)).limit(20000),
    only(db.from('hr_attendance_clocks').select('employee_id,clock_at,kind').gte('clock_at', wide.from).lte('clock_at', wide.to)).order('clock_at').limit(30000),
    only(db.from('hr_leave_requests').select('employee_id,leave_type,start_date,end_date').eq('status', 'approved').lte('start_date', to).gte('end_date', from)).limit(5000),
    db.from('hr_holidays').select('group_code,holiday_date').gte('holiday_date', from).lte('holiday_date', to).limit(1000),
    only(db.from('hr_attendance_ot').select('employee_id,work_date,status,approved_minutes,multiplier,note').gte('work_date', from).lte('work_date', to)).limit(10000),
  ]);
  return { roster: roster || [], clocks: clocks || [], leave: leave || [], holidays: holidays || [], ot: ot || [] };
}

export async function buildDays(db: any, people: Employee[], from: string, to: string, rules: Rules) {
  if (!people.length) return new Map<string, Day[]>();
  return buildDaysFrom(await fetchData(db, from, to, people.map((person) => person.id)), people, from, to, rules);
}

// One entry per person and date between from and to: what was expected (roster, then holiday, then the usual shift on
// working weekdays), leave on that date, the clocks that match it, and HR's decision on its OT.
export function buildDaysFrom(data: Data, people: Employee[], from: string, to: string, rules: Rules) {
  const out = new Map<string, Day[]>(people.map((person) => [person.id, []]));
  const { roster, clocks, leave, holidays, ot: otRows } = data;
  const rosterOf = new Map<string, { shift: string; works: boolean }>((roster || []).map((row: any) => [`${row.employee_id}|${row.work_date}`, row]));
  const holidayOn = new Set((holidays || []).map((row: any) => `${row.group_code}|${row.holiday_date}`));
  const decided = new Map<string, any>((otRows || []).map((row: any) => [`${row.employee_id}|${row.work_date}`, row]));
  const clocksOf = new Map<string, { at: number; kind: string }[]>();
  for (const row of clocks || []) { const list = clocksOf.get(row.employee_id) || []; list.push({ at: Date.parse(row.clock_at), kind: row.kind }); clocksOf.set(row.employee_id, list); }
  const now = Date.now();

  for (const person of people) {
    const doctor = isDoctor(person.designation);
    const required = person.clock_required || 'full';
    const mine = clocksOf.get(person.id) || [];
    const workDays = Array.isArray(person.work_days) && person.work_days.length ? person.work_days : [1, 2, 3, 4, 5, 6];
    const push = (day: Day) => {
      const decision = decided.get(`${person.id}|${day.date}`);
      if (decision && day.otCounted > 0) { day.otStatus = decision.status; day.otApproved = decision.approved_minutes; day.otRate = Number(decision.multiplier); day.otNote = decision.note || ''; }
      out.get(person.id)!.push(day);
    };
    for (let date = from; date <= to; date = addDay(date, 1)) {
      const row = rosterOf.get(`${person.id}|${date}`);
      let code = '';
      if (row) code = row.works ? row.shift : '';
      else if (HOLIDAY_OFF_GROUPS.has(person.holiday_group || '') && holidayOn.has(`${person.holiday_group}|${date}`)) code = '';
      else if (workDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) code = person.default_shift || OFFICE_CODE;
      const leaveRow = (leave || []).find((item: any) => item.employee_id === person.id && item.start_date <= date && item.end_date >= date);
      const shift = code ? shiftTimes(rules, code, doctor) : null;
      const blank: Day = { date, code, start: '', end: '', status: '', inAt: null, outAt: null, late: 0, lateCounted: 0, early: 0, earlyCounted: 0, worked: 0, ot: 0, otCounted: 0, otStatus: '', otApproved: 0, otRate: 0, otNote: '', leave: leaveRow?.leave_type || '' };
      if (!shift) {
        // A day off, a public holiday, or a code with no times set. A day worked anyway (a rest day) is captured as OT for HR to decide.
        const same = mine.filter((clock) => new Date(clock.at + 8 * HOUR).toISOString().slice(0, 10) === date);
        const first = same.find((clock) => clock.kind === 'in'), last = [...same].reverse().find((clock) => clock.kind === 'out');
        // A lone clock out here is the end of last night's shift, not a day worked.
        const day: Day = { ...blank, status: leaveRow ? 'leave' : first ? 'extra' : code ? 'no-times' : 'off', inAt: first ? new Date(first.at).toISOString() : null, outAt: first && last ? new Date(last.at).toISOString() : null };
        if (!leaveRow && first && last && last.at > first.at && !doctor && required !== 'none') { day.worked = Math.round((last.at - first.at) / MIN); day.ot = day.worked; day.otCounted = day.worked >= rules.otMin ? day.worked : 0; }
        push(day); continue;
      }
      const start = at(date, shift.start); let end = at(date, shift.end); if (end <= start) end += 24 * HOUR;
      const day: Day = { ...blank, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
      // A clock in counts for this shift from 5 hours before it starts until 10 hours after, but not once the shift is nearly over (that is a clock out recorded as an in).
      const clockIn = mine.find((clock) => clock.kind === 'in' && clock.at >= start - 5 * HOUR && clock.at <= Math.min(start + 10 * HOUR, end - 30 * MIN));
      const clockOut = clockIn ? [...mine].reverse().find((clock) => clock.kind === 'out' && clock.at > clockIn.at && clock.at <= Math.min(end + 8 * HOUR, clockIn.at + 30 * HOUR)) : undefined;
      if (clockIn) day.inAt = new Date(clockIn.at).toISOString();
      if (clockOut) day.outAt = new Date(clockOut.at).toISOString();
      if (leaveRow && !clockIn) { push({ ...day, status: 'leave' }); continue; }
      // Management do not clock: their working days count as present.
      if (required === 'none') { push({ ...day, status: 'exempt' }); continue; }
      if (clockIn) {
        day.late = Math.max(0, Math.round((clockIn.at - start) / MIN));
        day.lateCounted = day.late > rules.lateGrace ? day.late : 0;
        if (clockOut) {
          day.worked = Math.round((clockOut.at - clockIn.at) / MIN);
          day.early = clockOut.at < end ? Math.round((end - clockOut.at) / MIN) : 0;
          day.earlyCounted = rules.countEarly && day.early > rules.earlyGrace ? day.early : 0;
          // Extra time: before the shift starts and after it ends (doctors have no OT).
          const before = Math.max(0, Math.round((start - clockIn.at) / MIN)), after = Math.max(0, Math.round((clockOut.at - end) / MIN));
          day.ot = doctor ? 0 : before + after;
          day.otCounted = day.ot >= rules.otMin ? day.ot : 0;
          day.status = 'present';
        } else if (required === 'in_only') day.status = 'present';
        else day.status = now > end + 8 * HOUR ? 'missing-out' : 'working';
      } else day.status = now >= end ? 'absent' : now >= start + rules.lateGrace * MIN ? 'not-in' : 'upcoming';
      push(day);
    }
  }
  return out;
}

const dayView = (day: Day) => ({ ...day, startTime: day.start ? hhmm(Date.parse(day.start)) : '', endTime: day.end ? hhmm(Date.parse(day.end)) : '', inTime: day.inAt ? hhmm(Date.parse(day.inAt)) : '', outTime: day.outAt ? hhmm(Date.parse(day.outAt)) : '' });
const PERSON = 'id,company,employee_code,full_name,designation,work_days,holiday_group,default_shift,clock_required';
const requestRow = (row: any, names: Map<string, string>) => ({ id: row.id, employeeId: row.employee_id, name: names.get(row.employee_id) || '', date: row.work_date, inTime: row.in_time ? String(row.in_time).slice(0, 5) : '', outTime: row.out_time ? String(row.out_time).slice(0, 5) : '', reason: row.reason, status: row.status, decidedBy: row.decided_by, decidedAt: row.decided_at, note: row.decision_note, createdAt: row.created_at });

// Approving a correction adds the clocks it asks for (an out time before the in time means the next day, for a night shift).
async function applyRequest(db: any, request: any) {
  const rows: any[] = [];
  if (request.in_time) rows.push({ employee_id: request.employee_id, kind: 'in', clock_at: new Date(at(request.work_date, String(request.in_time))).toISOString(), within_place: null, device: 'request' });
  if (request.out_time) {
    let outAt = at(request.work_date, String(request.out_time));
    const inAt = request.in_time ? at(request.work_date, String(request.in_time)) : null;
    if (inAt !== null && outAt <= inAt) outAt += 24 * HOUR;
    rows.push({ employee_id: request.employee_id, kind: 'out', clock_at: new Date(outAt).toISOString(), within_place: null, device: 'request' });
  }
  if (rows.length) { const { error } = await db.from('hr_attendance_clocks').insert(rows); if (error) throw error; }
}
async function decideRequest(db: any, id: string, decision: string, note: string, by: string, allow: (request: any) => boolean) {
  if (!['approved', 'rejected'].includes(decision)) throw fail(400, 'Choose approve or reject.');
  const { data: request, error } = await db.from('hr_attendance_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!request) throw fail(404, 'That request was not found.');
  if (!allow(request)) throw fail(403, 'This request is not waiting for you.');
  if (request.status !== 'pending') throw fail(409, 'This request has already been decided.');
  const { error: updateError } = await db.from('hr_attendance_requests').update({ status: decision, decided_by: by, decided_at: new Date().toISOString(), decision_note: note }).eq('id', id).eq('status', 'pending');
  if (updateError) throw updateError;
  if (decision === 'approved') await applyRequest(db, request);
}

// ---- Staff side (Individual Sign In) ----
export async function attendanceStaffAction(req: any, res: any, db: any, staff: { id: string }, action: string, body: any) {
  const [{ data: me, error }, rules] = await Promise.all([db.from('hr_employees').select(`${PERSON},status,clock_mode,clock_place_ids,clock_device_hash,leave_approver_id,final_approver_id`).eq('assessment_staff_id', staff.id).maybeSingle(), loadRules(db)]);
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
    return { today: day, name: me.full_name, mode: me.clock_mode, places: places.map((place: any) => ({ name: place.name })), nextKind, recent: (recent || []).map((row: any) => ({ kind: row.kind, at: row.clock_at })), shift: dayView(mine.find((item) => item.date === day) || { date: day } as Day), yesterday: dayView(mine.find((item) => item.date === addDay(day, -1)) || { date: addDay(day, -1) } as Day), deviceRegistered: !!me.clock_device_hash, required: me.clock_required || 'full' };
  };

  if (req.method === 'GET' && action === 'attendance_today') return res.status(200).json(await state());

  if (req.method === 'GET' && action === 'attendance_history') {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : today().slice(0, 7);
    if (Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12) throw fail(400, 'Choose a valid month.');
    const days = (await buildDays(db, [me], `${month}-01`, monthEnd(month), rules)).get(me.id) || [];
    return res.status(200).json({ month, today: today(), days: days.map(dayView) });
  }

  if (req.method === 'POST' && action === 'attendance_clock') {
    if (me.status !== 'Active') throw fail(403, 'Your staff record is not active. Ask HR.');
    const deviceId = text(body.deviceId, 80);
    if (deviceId.length < 16) throw fail(400, 'This phone could not be identified. Reload the page and try again.');
    const hash = sha(deviceId);
    if (me.clock_device_hash && me.clock_device_hash !== hash) throw fail(403, 'You can only clock in on the phone you first used. Ask HR to reset it if you changed phones.');
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
    const { error: insertError } = await db.from('hr_attendance_clocks').insert({ employee_id: me.id, kind, latitude: hasLocation ? lat : null, longitude: hasLocation ? lng : null, accuracy_m: Number.isFinite(accuracy) ? accuracy : null, place_id: place?.id || null, distance_m: distance, within_place: within, device: hash.slice(0, 12) });
    if (insertError) throw insertError;
    if (!me.clock_device_hash) await db.from('hr_employees').update({ clock_device_hash: hash, clock_device_at: new Date().toISOString() }).eq('id', me.id);
    return res.status(200).json({ success: true, kind, ...(await state()) });
  }

  // Corrections: ask for a missed clock to be added; the supervisor (or HR) approves.
  if (req.method === 'GET' && action === 'attendance_requests') {
    const { data, error: listError } = await db.from('hr_attendance_requests').select('*').eq('employee_id', me.id).order('created_at', { ascending: false }).limit(30);
    if (listError) throw listError;
    return res.status(200).json({ requests: (data || []).map((row: any) => requestRow(row, new Map([[me.id, me.full_name]]))) });
  }
  if (req.method === 'POST' && action === 'attendance_request_create') {
    const date = isDate(body.date) ? String(body.date) : '', inTime = body.inTime ? String(body.inTime) : '', outTime = body.outTime ? String(body.outTime) : '', reason = text(body.reason, 300);
    if (!date || date > today() || date < addDay(today(), -30)) throw fail(400, 'Choose a date within the last 30 days.');
    if (!inTime && !outTime) throw fail(400, 'Enter the time you clocked in, the time you clocked out, or both.');
    if ((inTime && !isTime(inTime)) || (outTime && !isTime(outTime))) throw fail(400, 'Enter the times as hh:mm.');
    if (!reason) throw fail(400, 'Say why (for example: forgot to clock out).');
    const { data: waiting } = await db.from('hr_attendance_requests').select('id').eq('employee_id', me.id).eq('work_date', date).eq('status', 'pending').limit(1);
    if (waiting?.length) throw fail(409, 'You already have a request waiting for that date.');
    const { error: insertError } = await db.from('hr_attendance_requests').insert({ employee_id: me.id, work_date: date, in_time: inTime || null, out_time: outTime || null, reason, approver_id: me.leave_approver_id || me.final_approver_id || null });
    if (insertError) throw insertError;
    return res.status(200).json({ success: true });
  }
  if (req.method === 'GET' && action === 'attendance_request_approvals') {
    const { data, error: listError } = await db.from('hr_attendance_requests').select('*').eq('approver_id', me.id).eq('status', 'pending').order('created_at').limit(50);
    if (listError) throw listError;
    const ids = [...new Set((data || []).map((row: any) => row.employee_id))];
    const { data: people } = ids.length ? await db.from('hr_employees').select('id,full_name').in('id', ids) : { data: [] };
    return res.status(200).json({ requests: (data || []).map((row: any) => requestRow(row, new Map((people || []).map((p: any) => [p.id, p.full_name])))) });
  }
  if (req.method === 'POST' && action === 'attendance_request_decide') {
    await decideRequest(db, text(body.id, 60), String(body.decision), text(body.note, 300), me.full_name, (request) => request.approver_id === me.id);
    return res.status(200).json({ success: true });
  }
  throw fail(404, 'Unknown attendance action.');
}

// ---- Office HR side ----
export async function attendanceHrAction(req: any, res: any, db: any, action: string, body: any, userLabel: string) {
  const active = async () => { const { data, error } = await db.from('hr_employees').select(PERSON).eq('status', 'Active').order('full_name').limit(500); if (error) throw error; return (data || []) as Employee[]; };
  const person = (p: Employee) => ({ id: p.id, company: p.company, code: p.employee_code, name: p.full_name, doctor: isDoctor(p.designation) });
  const monthOf = (value: unknown) => { const month = /^\d{4}-\d{2}$/.test(String(value)) ? String(value) : today().slice(0, 7); if (Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12) throw fail(400, 'Choose a valid month.'); return month; };

  if (req.method === 'GET' && action === 'attendance_daily') {
    const date = isDate(req.query.date) ? String(req.query.date) : today();
    const [people, rules, data] = await Promise.all([active(), loadRules(db), fetchData(db, date, date)]);
    const days = buildDaysFrom(data, people, date, date, rules);
    return res.status(200).json({ date, today: today(), rows: people.map((p) => { const { code: shift, ...rest } = dayView((days.get(p.id) || [])[0] || { date } as Day); return { ...person(p), ...rest, shift }; }).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name)) });
  }

  if (req.method === 'GET' && action === 'attendance_month') {
    const month = monthOf(req.query.month);
    const [people, rules, data] = await Promise.all([active(), loadRules(db), fetchData(db, `${month}-01`, monthEnd(month))]);
    const days = buildDaysFrom(data, people, `${month}-01`, monthEnd(month), rules);
    const rows = people.map((p) => {
      const list = days.get(p.id) || [];
      const sum = (pick: (day: Day) => number) => list.reduce((total, day) => total + pick(day), 0);
      const count = (status: string) => list.filter((day) => day.status === status).length;
      return { ...person(p), expected: list.filter((day) => day.start || day.status === 'leave').length, present: list.filter((day) => ['present', 'working', 'missing-out', 'exempt'].includes(day.status)).length, absent: count('absent'), leave: count('leave'), missingOut: count('missing-out'), lateDays: list.filter((day) => day.lateCounted > 0).length, lateMinutes: sum((day) => day.lateCounted), workedMinutes: sum((day) => day.worked), otApprovedMinutes: sum((day) => day.otStatus === 'approved' ? day.otApproved : 0), otWaitingMinutes: sum((day) => day.otCounted > 0 && !day.otStatus ? day.otCounted : 0), exempt: count('exempt') };
    }).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
    return res.status(200).json({ month, rows, rules: { lateGrace: rules.lateGrace, otMin: rules.otMin } });
  }

  // Late pattern, for discipline reference: the days counted late in each of the last months.
  if (req.method === 'GET' && action === 'attendance_late_pattern') {
    const thisMonth = today().slice(0, 7);
    const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5)) - 1 - (5 - index), 1)).toISOString().slice(0, 7));
    const [people, rules, data] = await Promise.all([active(), loadRules(db), fetchData(db, `${months[0]}-01`, today())]);
    const days = buildDaysFrom(data, people, `${months[0]}-01`, today(), rules);
    const rows = people.map((p) => {
      const list = days.get(p.id) || [];
      const perMonth = months.map((month) => { const own = list.filter((day) => day.date.startsWith(month) && day.lateCounted > 0); return { month, days: own.length, minutes: own.reduce((total, day) => total + day.lateCounted, 0) }; });
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
    for (const p of people) for (const day of days.get(p.id) || []) if (day.otCounted > 0) { const view = dayView(day); rows.push({ ...person(p), date: day.date, shift: day.code, startTime: view.startTime, endTime: view.endTime, inTime: view.inTime, outTime: view.outTime, dayOff: !day.start, captured: day.otCounted, status: day.otStatus, approved: day.otApproved, rate: day.otRate, note: day.otNote }); }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    return res.status(200).json({ month, rows });
  }
  if (req.method === 'POST' && action === 'attendance_ot_decide') {
    const id = text(body.id, 60), date = isDate(body.date) ? String(body.date) : '', status = String(body.status);
    if (!id || !date) throw fail(400, 'Choose a person and a date.');
    if (!['approved', 'rejected'].includes(status)) throw fail(400, 'Choose approve or reject.');
    const rate = Number(body.rate);
    if (status === 'approved' && !OT_RATES.includes(rate)) throw fail(400, 'Choose the OT rate: 1.0, 1.5, 2.0 or 3.0.');
    const { data: one } = await db.from('hr_employees').select(PERSON).eq('id', id).maybeSingle();
    if (!one) throw fail(404, 'Staff member not found.');
    const rules = await loadRules(db);
    const day = ((await buildDays(db, [one], date, date, rules)).get(id) || [])[0];
    if (!day || day.otCounted <= 0) throw fail(400, 'There is no extra time to decide on that date.');
    const minutes = status === 'approved' ? Math.max(0, Math.min(day.otCounted, Math.round(Number(body.minutes ?? day.otCounted)))) : 0;
    const { error } = await db.from('hr_attendance_ot').upsert({ employee_id: id, work_date: date, captured_minutes: day.otCounted, status, approved_minutes: minutes, multiplier: status === 'approved' ? rate : 1.5, note: text(body.note, 300), decided_by: userLabel, decided_at: new Date().toISOString() }, { onConflict: 'employee_id,work_date' });
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  // Corrections asked by staff: HR can decide any of them.
  if (req.method === 'GET' && action === 'attendance_requests') {
    const status = req.query.status === 'all' ? 'all' : 'pending';
    let query = db.from('hr_attendance_requests').select('*').order('created_at', { ascending: false }).limit(100);
    if (status === 'pending') query = query.eq('status', 'pending');
    const { data, error } = await query;
    if (error) throw error;
    const ids = [...new Set((data || []).map((row: any) => row.employee_id))];
    const { data: people } = ids.length ? await db.from('hr_employees').select('id,full_name,company,employee_code').in('id', ids) : { data: [] };
    const names = new Map<string, string>((people || []).map((p: any) => [p.id, `${p.full_name} (${p.company} ${p.employee_code})`]));
    return res.status(200).json({ requests: (data || []).map((row: any) => requestRow(row, names)) });
  }
  if (req.method === 'POST' && action === 'attendance_request_decide') {
    await decideRequest(db, text(body.id, 60), String(body.decision), text(body.note, 300), userLabel || 'HR', () => true);
    return res.status(200).json({ success: true });
  }

  if (req.method === 'GET' && action === 'attendance_clocks') {
    const id = text(req.query.id, 60), date = isDate(req.query.date) ? String(req.query.date) : today();
    const { data, error } = await db.from('hr_attendance_clocks').select('id,kind,clock_at,distance_m,within_place,accuracy_m,device,hr_clock_places(name)').eq('employee_id', id).gte('clock_at', `${addDay(date, -1)}T12:00:00+08:00`).lte('clock_at', `${addDay(date, 1)}T12:00:00+08:00`).order('clock_at');
    if (error) throw error;
    return res.status(200).json({ clocks: (data || []).map((row: any) => ({ id: row.id, source: row.device === 'request' ? 'request' : row.device === 'hr' ? 'hr' : String(row.device).startsWith('infotech') ? 'infotech' : 'phone', kind: row.kind, at: row.clock_at, time: hhmm(Date.parse(row.clock_at)), date: new Date(Date.parse(row.clock_at) + 8 * HOUR).toISOString().slice(0, 10), place: row.hr_clock_places?.name || '', distance: row.distance_m, accuracy: row.accuracy_m === null ? null : Math.round(row.accuracy_m), anywhere: row.within_place === null && !['request', 'hr'].includes(row.device) && !String(row.device).startsWith('infotech'), fromRequest: row.device === 'request', device: row.device })) });
  }

  // HR adds or removes a clock directly (for example a clock the person could not make). Each change is written to the audit trail.
  if (req.method === 'POST' && action === 'attendance_clock_add') {
    const id = text(body.id, 60), date = isDate(body.date) ? String(body.date) : '', kind = body.kind === 'out' ? 'out' : 'in';
    if (!id || !date) throw fail(400, 'Choose a person and a date.');
    if (!isTime(body.time)) throw fail(400, 'Enter the time as hh:mm.');
    let clockAt = at(date, String(body.time)); if (body.nextDay === true) clockAt += 24 * HOUR;
    if (clockAt > Date.now() + 5 * MIN) throw fail(400, 'A clock cannot be in the future.');
    const { error } = await db.from('hr_attendance_clocks').insert({ employee_id: id, kind, clock_at: new Date(clockAt).toISOString(), within_place: null, device: 'hr' });
    if (error) throw error;
    await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { clock_added: `${kind} ${date} ${body.time}${body.nextDay === true ? ' (next day)' : ''}`, note: text(body.note, 200), by: userLabel } });
    return res.status(200).json({ success: true });
  }
  if (req.method === 'POST' && action === 'attendance_clock_delete') {
    const clockId = text(body.clockId, 60);
    const { data: one } = await db.from('hr_attendance_clocks').select('employee_id,kind,clock_at').eq('id', clockId).maybeSingle();
    if (!one) throw fail(404, 'That clock was not found.');
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
    const { data: have } = await db.from('hr_roster').select('employee_id,work_date').gte('work_date', sorted[0]).lte('work_date', sorted[sorted.length - 1]).limit(20000);
    const haveSet = new Set((have || []).map((r: any) => `${r.employee_id}|${r.work_date}`)); const seen = new Set<string>();
    const rosterAdd = rosterWant.filter((r) => { const key = `${r.employee_id}|${r.work_date}`; if (haveSet.has(key) || seen.has(key)) return false; seen.add(key); return true; });
    for (let i = 0; i < rosterAdd.length; i += 300) { const { error } = await db.from('hr_roster').insert(rosterAdd.slice(i, i + 300)); if (error) throw error; }
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
    const { data, error } = await db.from('hr_employees').select(`${PERSON},clock_mode,clock_place_ids,clock_device_hash,clock_device_at`).eq('status', 'Active').order('full_name').limit(500);
    if (error) throw error;
    return res.status(200).json({ people: (data || []).map((row: any) => ({ ...person(row), mode: row.clock_mode, placeIds: row.clock_place_ids || [], clockRequired: row.clock_required || 'full', defaultShift: row.default_shift || '', deviceRegistered: !!row.clock_device_hash, deviceAt: row.clock_device_at })) });
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
  if (req.method === 'POST' && action === 'attendance_device_reset') {
    const id = text(body.id, 60);
    const { error } = await db.from('hr_employees').update({ clock_device_hash: null, clock_device_at: null }).eq('id', id);
    if (error) throw error;
    await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { clock_device: 'reset', by: userLabel } });
    return res.status(200).json({ success: true });
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
