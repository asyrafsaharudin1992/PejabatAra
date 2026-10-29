import { calendarAccessFor } from './_leave-calendar-access.js';
import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { activeAccount, hashSecret, serviceDb } from './_office-db.js';
import { claimTotal, INCENTIVE_BRANCHES, INCENTIVE_CODES, IncentiveEntry } from '../src/lib/incentiveCodes.js';

// Assessment Room. Served from /api/status?resource=assessment because the
// Vercel Hobby plan allows only 12 functions.
//
// Staff sign in with name + staff code + last 4 IC digits (no shared account, no device lock) and
// send the session token as x-assessment-token. Management actions need a
// System Admin Supabase session instead.
const SESSION_HOURS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
// Every assessment is passed only with full marks; anything less must be retaken.
const PASS_MARK = 100;

// Staff may type the code with spaces, dashes or lower case.
const normaliseCode = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Names match ignoring case, spacing and punctuation ("Nur Aisyah" = "nur  aisyah.").
const nameKey = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I lookalikes
const newStaffCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const normaliseIc4 = (value: unknown) => String(value || '').replace(/\D/g, '');

// Last 4 IC digits: only a salted scrypt hash is stored, never the digits.
function hashIc4(digits: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(digits, salt, 32).toString('hex')}`;
}
function ic4Matches(digits: string, stored: string | null) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  return timingSafeEqual(scryptSync(digits, salt, expected.length), expected);
}
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

async function staffSession(db: any, req: any) {
  const token = String(req.headers['x-assessment-token'] || '');
  if (!token) throw fail(401, 'Please sign in to the Assessment Room.');
  const { data, error } = await db.from('assessment_sessions').select('staff_id,expires_at,assessment_staff(id,name,staff_code,branch,active,can_preview,password_hash)')
    .eq('token_hash', hashSecret(token)).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw error;
  if (!data?.assessment_staff?.active) throw fail(401, 'Your session has ended. Please sign in again.');
  return data.assessment_staff as { id: string; name: string; branch: string; can_preview: boolean; staff_code: string; password_hash: string | null };
}

// Validates an admin-submitted question list; returns it with ids filled in.
function cleanQuestions(value: unknown) {
  if (!Array.isArray(value) || !value.length) throw fail(400, 'Add at least one question.');
  return value.map((question: any, index: number) => {
    const options = (Array.isArray(question?.options) ? question.options : []).map((option: unknown) => text(option, 300)).filter(Boolean);
    const questionText = text(question?.text, 1000);
    const answer = Number(question?.answer);
    if (!questionText) throw fail(400, `Question ${index + 1} has no text.`);
    if (options.length < 2) throw fail(400, `Question ${index + 1} needs at least two options.`);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw fail(400, `Choose the correct answer for question ${index + 1}.`);
    return { id: text(question?.id, 60) || randomUUID(), text: questionText, options, answer };
  });
}

// Staff incentive claims: one per staff member per month, built up entry by entry and
// submitted at month end. The API fixes each entry's RM from the code, so a claim
// cannot be inflated from the browser.
const FIRST_CLAIM_MONTH = '2026-10';
const malaysiaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const decodeClaim = (row: any, staff: { branch: string }, month: string) => ({
  month, branch: row?.branch || INCENTIVE_BRANCHES[staff.branch] || '', entries: row?.entries || [], status: row?.status || 'draft',
  adminNote: row?.admin_note || '', approvedBy: row?.approved_by || '', submittedAt: row?.submitted_at || null, decidedAt: row?.decided_at || null,
});

function claimMonth(value: unknown) {
  const month = text(value, 7);
  if (!/^\d{4}-\d{2}$/.test(month) || month < FIRST_CLAIM_MONTH || month > malaysiaToday().slice(0, 7)) throw fail(400, 'Choose a month from October 2026 up to this month.');
  return month;
}

async function editableClaim(db: any, staffId: string, month: string) {
  const { data, error } = await db.from('incentive_claims').select('*').eq('staff_id', staffId).eq('month', month).maybeSingle();
  if (error) throw error;
  if (data && !['draft', 'returned'].includes(data.status)) throw fail(409, data.status === 'approved' ? 'This claim has been approved and can no longer be changed.' : 'This claim has been submitted. Ask your Clinical Admin to return it if something needs fixing.');
  return data;
}

async function saveClaim(db: any, staffId: string, month: string, existing: any, patch: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { data, error } = existing
    ? await db.from('incentive_claims').update({ ...patch, updated_at: now }).eq('id', existing.id).select('*').single()
    : await db.from('incentive_claims').insert({ staff_id: staffId, month, ...patch }).select('*').single();
  if (error) throw error;
  return data;
}

async function incentiveAction(req: any, res: any, db: any, staff: { id: string; branch: string; can_preview: boolean }, action: string, body: any) {
  if (req.method === 'GET' && action === 'incentive') {
    const month = claimMonth(req.query.month || malaysiaToday().slice(0, 7));
    const { data, error } = await db.from('incentive_claims').select('month,branch,entries,status,admin_note,approved_by,submitted_at,decided_at').eq('staff_id', staff.id).order('month', { ascending: false });
    if (error) throw error;
    const row = (data || []).find((claim: any) => claim.month === month);
    return res.status(200).json({
      claim: decodeClaim(row, staff, month),
      history: (data || []).map((claim: any) => ({ month: claim.month, status: claim.status, total: claimTotal(claim.entries || []), count: (claim.entries || []).length })),
    });
  }
  if (staff.can_preview) throw fail(403, 'Preview accounts cannot make claims.');
  const month = claimMonth(body.month);
  const branch = Object.values(INCENTIVE_BRANCHES).includes(body.branch) ? body.branch : '';

  if (req.method === 'POST' && action === 'incentive_add') {
    const existing = await editableClaim(db, staff.id, month);
    const entry = body.entry || {};
    const code = INCENTIVE_CODES.find((item) => item.code === entry.code);
    if (!code) throw fail(400, 'Choose an incentive code.');
    const date = text(entry.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== month || date > malaysiaToday()) throw fail(400, 'The date must be in the claim month and not in the future.');
    const clinicId = text(entry.clinicId, 40);
    const patient = text(entry.patient, 120);
    // Procedures are done on a patient; the other incentives (A–I) are not.
    if (/^(\d|L)/.test(code.code) && (!patient || !clinicId)) throw fail(400, 'Enter the patient name and clinic ID.');
    const rm = code.ownAmount ? Math.round(Number(entry.rm) * 100) / 100 : code.rate;
    if (!Number.isFinite(rm) || rm <= 0 || rm > 2000) throw fail(400, 'Enter the amount (RM) for this incentive.');
    const next: IncentiveEntry = { id: randomUUID(), date, patient, clinicId, outstanding: text(entry.outstanding, 60), code: code.code, rm };
    const entries = [...(existing?.entries || []), next].sort((a: IncentiveEntry, b: IncentiveEntry) => a.date.localeCompare(b.date));
    if (entries.length > 500) throw fail(400, 'A claim can hold up to 500 entries.');
    // The branch is set from the first entry, so the Clinical Admin sees the claim while it is still being filled in.
    const claimBranch = branch || existing?.branch || INCENTIVE_BRANCHES[staff.branch] || '';
    const saved = await saveClaim(db, staff.id, month, existing, { entries, branch: claimBranch });
    return res.status(200).json({ claim: decodeClaim(saved, staff, month) });
  }

  if (req.method === 'POST' && action === 'incentive_remove') {
    const existing = await editableClaim(db, staff.id, month);
    if (!existing) throw fail(404, 'Entry not found.');
    const saved = await saveClaim(db, staff.id, month, existing, { entries: (existing.entries || []).filter((entry: IncentiveEntry) => entry.id !== text(body.id, 60)) });
    return res.status(200).json({ claim: decodeClaim(saved, staff, month) });
  }

  if (req.method === 'POST' && action === 'incentive_submit') {
    const existing = await editableClaim(db, staff.id, month);
    if (!existing?.entries?.length) throw fail(400, 'Add at least one entry before submitting.');
    const claimBranch = branch || existing.branch || INCENTIVE_BRANCHES[staff.branch];
    if (!claimBranch) throw fail(400, 'Choose your branch before submitting.');
    const saved = await saveClaim(db, staff.id, month, existing, { branch: claimBranch, status: 'submitted', submitted_at: new Date().toISOString() });
    return res.status(200).json({ claim: decodeClaim(saved, staff, month) });
  }
  throw fail(405, 'Method not allowed.');
}

// Leave: apply, history, cancel, and the approver's queue. The staff member is found through the HR record
// linked to their sign-in; an approver is whoever HR has set as `leave_approver_id` on the applicant.
const LEAVE_TYPES: Record<string, { name: string; group: string; half: boolean }> = {
  AL: { name: 'Annual Leave', group: 'AL', half: true }, EL: { name: 'Emergency Leave', group: 'AL', half: false },
  ML: { name: 'Medical Leave', group: 'ML', half: true }, HOSP: { name: 'Hospitalization Leave', group: 'HOSP', half: false },
  MARRG: { name: 'Marriage Leave', group: 'MARRG', half: false }, HAJUMR: { name: 'Haji / Umrah Leave', group: 'HAJUMR', half: false },
  UL: { name: 'Unpaid Leave', group: 'UL', half: true },
};
// As in Infotech: leave must be applied for at least 1 day before the leave date, except medical, hospitalization and emergency leave
// (which can be applied for after the day). Annual leave can be taken up to the full year's entitlement, which is shared by month in the year someone joins.
const APPLY_AFTER_THE_DAY = new Set(['ML', 'HOSP', 'EL', 'MATN', 'ULEL']);
function yearAllowance(eligible: number, joinDate: string | null, year: string) {
  if (!joinDate || joinDate.slice(0, 4) !== year) return eligible;
  return Math.round(eligible * (12 - Number(joinDate.slice(5, 7)) + 1) / 12);
}
const isoDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? String(value) : '';
// Days between two dates that are working days for the person: a date on their uploaded duty roster counts
// when the roster says they work it; any other date counts when its weekday is one of their usual working
// weekdays (0 = Sunday ... 6 = Saturday). Public holidays that are not on the roster are not taken off.
function leaveDays(start: string, end: string, half: string | null, workDays: number[], roster: Record<string, boolean> = {}) {
  let count = 0;
  for (let day = new Date(`${start}T00:00:00Z`); day <= new Date(`${end}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    if (iso in roster ? roster[iso] : workDays.includes(day.getUTCDay())) count++;
  }
  return half ? (start === end && count ? 0.5 : 0) : count;
}
// Holiday groups whose public holidays are days off. Operations staff (SG-OPS) usually work through public holidays,
// so for them only the duty roster decides; management and admin staff (SG-MNG) and MLHL have the day off.
const HOLIDAY_OFF_GROUPS = new Set(['SG-MNG', 'MLHL']);
// The person's calendar between two dates: false for a public holiday of their holiday group, then the duty
// roster on top (a roster day says whether they really work it). Dates not in the map use the usual weekdays.
async function rosterFor(db: any, employeeId: string, from: string, to: string, holidayGroup = '') {
  const calendar: Record<string, boolean> = {};
  if (HOLIDAY_OFF_GROUPS.has(holidayGroup)) {
    const { data } = await db.from('hr_holidays').select('holiday_date').eq('group_code', holidayGroup).gte('holiday_date', from).lte('holiday_date', to).limit(400);
    for (const row of data || []) calendar[row.holiday_date] = false; // holiday tables not set up yet: no holidays
  }
  const { data, error } = await db.from('hr_roster').select('work_date,works').eq('employee_id', employeeId).gte('work_date', from).lte('work_date', to).limit(1000);
  if (!error) for (const row of data || []) calendar[row.work_date] = !!row.works; // roster table not set up yet: weekdays only
  return calendar;
}
const requestRow = (r: any, extra: Record<string, unknown> = {}) => ({ id: r.id, type: r.leave_type, typeName: LEAVE_TYPES[r.leave_type]?.name || r.leave_type, group: r.leave_group, start: r.start_date, end: r.end_date, half: r.half_day, days: Number(r.days), reason: r.reason, status: r.status, note: r.decision_note, decidedAt: r.decided_at, supervisorNote: r.supervisor_note || '', supervisorDecidedAt: r.supervisor_decided_at || null, twoLevel: !!r.final_approver_id, backupApproverId: r.backup_approver_id || null, createdAt: r.created_at, ...extra });

// Which decision is waiting on this person for the request, if any.
const stageFor = (r: any, personId: string) => r.status === 'pending' && (r.approver_id === personId || r.backup_approver_id === personId) ? (r.approver_id === personId ? 'supervisor' : 'backup') : r.status === 'supervisor_approved' && r.final_approver_id === personId ? 'final' : '';

async function leaveAction(req: any, res: any, db: any, staff: { id: string }, action: string, body: any) {
  const { data: me, error: meError } = await db.from('hr_employees').select('id,full_name,company,branch,department,leave_calendar_companies,leave_approver_id,leave_backup_approver_id,final_approver_id,work_days,holiday_group,join_date').eq('assessment_staff_id', staff.id).maybeSingle();
  if (meError) throw meError;
  const workDays: number[] = Array.isArray(me?.work_days) && me.work_days.length ? me.work_days : [1, 2, 3, 4, 5, 6];
  if (!me) throw fail(400, 'Your sign-in is not linked to your staff record yet. Ask HR.');
  const today = malaysiaToday();

  if (req.method === 'GET' && action === 'leave_options') {
    let approver = '', backupApprover = '', finalApprover = '';
    if (me.leave_approver_id) { const { data } = await db.from('hr_employees').select('full_name').eq('id', me.leave_approver_id).maybeSingle(); approver = data?.full_name || ''; }
    if (me.leave_backup_approver_id) { const { data } = await db.from('hr_employees').select('full_name').eq('id', me.leave_backup_approver_id).maybeSingle(); backupApprover = data?.full_name || ''; }
    if (me.final_approver_id && me.final_approver_id !== me.leave_approver_id) { const { data } = await db.from('hr_employees').select('full_name').eq('id', me.final_approver_id).maybeSingle(); finalApprover = data?.full_name || ''; }
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10), to = new Date(Date.parse(`${today}T00:00:00Z`) + 180 * 86400000).toISOString().slice(0, 10);
    return res.status(200).json({ approver, backupApprover, finalApprover, workDays, roster: await rosterFor(db, me.id, from, to, me.holiday_group || ''), types: Object.entries(LEAVE_TYPES).map(([code, type]) => ({ code, name: type.name, group: type.group, half: type.half })) });
  }

  if (req.method === 'GET' && action === 'leave_calendar') {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : today.slice(0, 7);
    if (Number(month.slice(5, 7)) < 1 || Number(month.slice(5, 7)) > 12) throw fail(400, 'Choose a valid month.');
    const start = `${month}-01`, end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
    const access = calendarAccessFor(me);
    let peopleQuery = db.from('hr_employees').select('id,full_name,employee_code,department,company').in('company', access.companies).eq('status', 'Active');
    if (access.scope === 'department') peopleQuery = peopleQuery.eq('department', access.department);
    if (access.scope === 'self') peopleQuery = peopleQuery.eq('id', me.id);
    const { data: people, error: peopleError } = await peopleQuery.order('full_name').limit(500);
    if (peopleError) throw peopleError;
    const ids = (people || []).map((person: any) => person.id);
    const { data: rows, error } = ids.length ? await db.from('hr_leave_requests').select('employee_id,leave_type,start_date,end_date,half_day,days').in('employee_id', ids).eq('status', 'approved').lte('start_date', end).gte('end_date', start).order('start_date').limit(2000) : { data: [], error: null };
    if (error) throw error;
    const names = new Map<string, { full_name: string; employee_code: string; department: string; company: string }>((people || []).map((person: any) => [person.id, person]));
    return res.status(200).json({ month, start, end, group: access.label, scope: access.scope, notice: access.notice, items: (rows || []).map((row: any) => ({ name: names.get(row.employee_id)?.full_name || '', code: names.get(row.employee_id)?.employee_code || '', department: names.get(row.employee_id)?.department || '', company: names.get(row.employee_id)?.company || '', type: LEAVE_TYPES[row.leave_type]?.name || row.leave_type, start: row.start_date, end: row.end_date, half: row.half_day, days: Number(row.days) })) });
  }

  if (req.method === 'POST' && action === 'leave_apply') {
    const type = LEAVE_TYPES[text(body.type, 10)];
    if (!type) throw fail(400, 'Choose the type of leave.');
    const start = isoDate(body.start), end = isoDate(body.end || body.start);
    if (!start || !end) throw fail(400, 'Choose the dates.');
    if (end < start) throw fail(400, 'The end date is before the start date.');
    if (start.slice(0, 4) !== end.slice(0, 4)) throw fail(400, 'Submit separate requests for dates in different leave years.');
    const earliest = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
    if (start < earliest) throw fail(400, 'Leave can be applied up to 30 days after the fact. Ask HR for older dates.');
    if (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`) > 90 * 86400000) throw fail(400, 'That is more than 90 days. Split it or ask HR.');
    const reason = text(body.reason, 500);
    if (reason.length < 2) throw fail(400, 'Write the reason for your leave.');
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    if (!APPLY_AFTER_THE_DAY.has(text(body.type, 10)) && start < tomorrow) throw fail(400, 'Apply at least 1 day before the leave date. Only medical, hospitalization and emergency leave can be applied for after the day.');
    const half = body.half === 'AM' || body.half === 'PM' ? body.half : null;
    if (half && !type.half) throw fail(400, `${type.name} cannot be taken as half a day.`);
    if (half && start !== end) throw fail(400, 'A half day is for a single date.');
    const days = leaveDays(start, end, half, workDays, await rosterFor(db, me.id, start, end, me.holiday_group || ''));
    if (!days) throw fail(400, 'Those dates have no working day for you (rest days and public holidays are not counted).');
    if (!me.leave_approver_id) throw fail(400, 'HR has not set who approves your leave yet. Ask HR.');
    // Annual leave (and emergency leave, which comes off it): no more than the year's entitlement, counting what is already waiting for approval.
    if (type.group === 'AL') {
      const leaveYear = Number(start.slice(0, 4));
      const { data: rows, error: balanceError } = await db.from('hr_leave_balances').select('eligible,brought_forward,credit,earn,forfeit,taken').eq('employee_id', me.id).eq('leave_group', 'AL').eq('year', leaveYear).limit(1);
      if (balanceError) throw balanceError;
      const b = rows?.[0];
      if (!b) throw fail(400, `Your annual leave balance for ${leaveYear} has not been set up. Ask HR.`);
      {
        const year = String(leaveYear);
        const allowance = yearAllowance(Number(b.eligible), me.join_date || null, year);
        const cap = Number(b.brought_forward) + Number(b.credit) - Number(b.forfeit) + Math.max(Number(b.earn), allowance);
        const { data: waiting } = await db.from('hr_leave_requests').select('days').eq('employee_id', me.id).eq('leave_group', 'AL').in('status', ['pending', 'supervisor_approved']).gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`);
        const used = Number(b.taken) + (waiting || []).reduce((sum: number, row: any) => sum + Number(row.days), 0);
        if (used + days > cap + 0.001) throw fail(400, `That is more than your annual leave for ${year}: ${Math.round(cap * 100) / 100} days in all, ${Math.round(used * 100) / 100} already used or waiting for approval. Ask HR if you need more.`);
      }
    }
    const { count: clash } = await db.from('hr_leave_requests').select('id', { count: 'exact', head: true }).eq('employee_id', me.id).in('status', ['pending', 'supervisor_approved', 'approved']).lte('start_date', end).gte('end_date', start);
    if (clash) throw fail(409, 'You already have a leave request on some of those dates.');
    const { data, error } = await db.from('hr_leave_requests').insert({ employee_id: me.id, approver_id: me.leave_approver_id, backup_approver_id: me.leave_backup_approver_id && me.leave_backup_approver_id !== me.leave_approver_id ? me.leave_backup_approver_id : null, final_approver_id: me.final_approver_id && me.final_approver_id !== me.leave_approver_id ? me.final_approver_id : null, leave_type: body.type, leave_group: type.group, start_date: start, end_date: end, half_day: half, days, reason }).select('*').single();
    if (error) throw error;
    return res.status(200).json({ request: requestRow(data) });
  }

  if (req.method === 'GET' && action === 'leave_history') {
    const { data, error } = await db.from('hr_leave_requests').select('*').eq('employee_id', me.id).order('start_date', { ascending: false }).limit(200);
    if (error) throw error;
    return res.status(200).json({ requests: (data || []).map((r: any) => requestRow(r)) });
  }

  if (req.method === 'POST' && action === 'leave_cancel') {
    const { data, error } = await db.from('hr_leave_requests').update({ status: 'cancelled' }).eq('id', text(body.id, 60)).eq('employee_id', me.id).in('status', ['pending', 'supervisor_approved']).select('id');
    if (error) throw error;
    if (!data?.length) throw fail(409, 'Only a request that has not been finally decided can be cancelled.');
    return res.status(200).json({ success: true });
  }

  // The approver's queue, in two levels as in Infotech: the supervisor decides first, then the final approver.
  // `stage` says which decision is waiting on this person ('supervisor' or 'final'); the rest is recent history.
  if (req.method === 'GET' && action === 'leave_approvals') {
    const { data, error } = await db.from('hr_leave_requests').select('*').or(`approver_id.eq.${me.id},backup_approver_id.eq.${me.id},final_approver_id.eq.${me.id}`).in('status', ['pending', 'supervisor_approved', 'approved', 'rejected']).order('created_at', { ascending: false }).limit(150);
    if (error) throw error;
    const ids = [...new Set((data || []).flatMap((r: any) => [r.employee_id, r.backup_approver_id]).filter(Boolean))];
    const [{ data: people }, { data: balances }] = ids.length ? await Promise.all([db.from('hr_employees').select('id,full_name,employee_code').in('id', ids), db.from('hr_leave_balances').select('employee_id,leave_group,year,balance').in('employee_id', ids)]) : [{ data: [] }, { data: [] }];
    const name = new Map<string, any>((people || []).map((p: any) => [p.id, p]));
    const balanceOf = (employee: string, group: string, year: number) => { const row = (balances || []).find((b: any) => b.employee_id === employee && b.leave_group === group && Number(b.year) === year); return row ? Number(row.balance) : null; };
    // Others under the same supervisor who are (or will be) off on the same dates, to help the decision.
    const waiting = (data || []).filter((r: any) => stageFor(r, me.id));
    let overlapping: any[] = [];
    if (waiting.length) {
      const supervisors = [...new Set(waiting.map((r: any) => r.approver_id).filter(Boolean))];
      const first = waiting.reduce((a: string, r: any) => (r.start_date < a ? r.start_date : a), waiting[0].start_date), last = waiting.reduce((a: string, r: any) => (r.end_date > a ? r.end_date : a), waiting[0].end_date);
      const { data: others } = await db.from('hr_leave_requests').select('employee_id,approver_id,start_date,end_date,status').in('approver_id', supervisors).in('status', ['pending', 'supervisor_approved', 'approved']).lte('start_date', last).gte('end_date', first).limit(500);
      overlapping = others || [];
      const extra = [...new Set(overlapping.map((o: any) => o.employee_id).filter((id: string) => !name.has(id)))];
      if (extra.length) { const { data: more } = await db.from('hr_employees').select('id,full_name,employee_code').in('id', extra); for (const person of more || []) name.set(person.id, person); }
    }
    const short = (full: string) => full.split(' ').slice(0, 2).join(' ');
    const rows = (data || []).map((r: any) => requestRow(r, { applicant: name.get(r.employee_id)?.full_name || '', code: name.get(r.employee_id)?.employee_code || '', backupApprover: name.get(r.backup_approver_id)?.full_name || '', balance: balanceOf(r.employee_id, r.leave_group, Number(String(r.start_date).slice(0, 4))), stage: stageFor(r, me.id), alsoOff: [...new Set(overlapping.filter((o: any) => o.approver_id === r.approver_id && o.employee_id !== r.employee_id && o.start_date <= r.end_date && o.end_date >= r.start_date).map((o: any) => short(name.get(o.employee_id)?.full_name || '')).filter(Boolean))].slice(0, 6) }));
    return res.status(200).json({ pending: rows.filter((r: any) => r.stage).reverse(), recent: rows.filter((r: any) => !r.stage).slice(0, 20) });
  }

  if (req.method === 'POST' && action === 'leave_decide') {
    const approve = body.decision === 'approve';
    if (!approve && body.decision !== 'reject') throw fail(400, 'Approve or reject.');
    const { data: request, error: readError } = await db.from('hr_leave_requests').select('*').eq('id', text(body.id, 60)).maybeSingle();
    if (readError) throw readError;
    if (!request || (request.approver_id !== me.id && request.backup_approver_id !== me.id && request.final_approver_id !== me.id)) throw fail(403, 'This request is not yours to decide.');
    const stage = stageFor(request, me.id);
    if (!stage) throw fail(409, 'This request is not waiting for your decision.');
    // The approver may correct the number of days (for example a public holiday in the range).
    let days = Number(request.days);
    if (approve && body.days !== undefined) { days = Number(body.days); if (!(days > 0 && days <= 90 && Number.isInteger(days * 2))) throw fail(400, 'Days must be a number such as 1, 1.5 or 2.'); }
    const now = new Date().toISOString(), note = text(body.note, 300);
    // A supervisor's approval passes the request on to the final approver when there is one; every other
    // decision (a rejection, or the final approval) closes it.
    const passOn = approve && (stage === 'supervisor' || stage === 'backup') && !!request.final_approver_id;
    const status = !approve ? 'rejected' : passOn ? 'supervisor_approved' : 'approved';
    const patch: Record<string, unknown> = { status, days };
    if (stage === 'supervisor' || stage === 'backup') Object.assign(patch, { supervisor_decided_by: me.id, supervisor_decided_at: now, supervisor_note: note });
    if (!passOn) Object.assign(patch, { decided_by: me.id, decided_at: now, decision_note: note });
    const { data: decided, error } = await db.from('hr_leave_requests').update(patch).eq('id', request.id).eq('status', request.status).select('id');
    if (error) throw error;
    if (!decided?.length) throw fail(409, 'This request has already been decided.');
    if (status === 'approved') {
      // Take the days off the balance (the newest year of that leave group) only once it is finally approved.
      const { data: rows } = await db.from('hr_leave_balances').select('id,year,taken,balance').eq('employee_id', request.employee_id).eq('leave_group', request.leave_group).eq('year', Number(String(request.start_date).slice(0, 4))).limit(1);
      if (rows?.length) await db.from('hr_leave_balances').update({ taken: Number(rows[0].taken) + days, balance: Number(rows[0].balance) - days, updated_at: now }).eq('id', rows[0].id);
    }
    return res.status(200).json({ success: true, status, stage });
  }
  throw fail(405, 'Method not allowed.');
}

async function staffAction(req: any, res: any, action: string, body: any) {
  const db = serviceDb();

  if (req.method === 'POST' && action === 'login') {
    const code = normaliseCode(body.code);
    const name = nameKey(body.name);
    // First sign-in: the last 4 IC digits. After the staff member has set a password, the password.
    const secret = String(body.password ?? body.ic4 ?? '');
    if (!code || !name || !secret) throw fail(400, 'Enter your name, staff code and password. First time? Use the last 4 digits of your IC.');
    const { data: staff, error } = await db.from('assessment_staff').select('id,name,branch,active,failed_logins,locked_until,ic4_hash,password_hash').eq('staff_code', code).maybeSingle();
    if (error) throw error;
    if (staff?.locked_until && Date.parse(staff.locked_until) > Date.now()) throw fail(429, `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`);
    const hasPassword = Boolean(staff?.password_hash);
    const secretOk = staff && (hasPassword ? ic4Matches(secret, staff.password_hash) : normaliseIc4(secret).length === 4 && ic4Matches(normaliseIc4(secret), staff.ic4_hash));
    if (!staff || !staff.active || nameKey(staff.name) !== name || !secretOk) {
      if (staff) {
        const failed = staff.failed_logins + 1;
        await db.from('assessment_staff').update(failed >= MAX_FAILED_LOGINS
          ? { failed_logins: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() }
          : { failed_logins: failed }).eq('id', staff.id);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      throw fail(400, 'Name, staff code or password are not correct. If you have already set a password, use it (not your IC digits).');
    }
    await db.from('assessment_staff').update({ failed_logins: 0, locked_until: null }).eq('id', staff.id);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
    const { error: sessionError } = await db.from('assessment_sessions').insert({ staff_id: staff.id, token_hash: hashSecret(token), expires_at: expiresAt });
    if (sessionError) throw sessionError;
    // Housekeeping: expired sessions are useless, so drop them while we are here.
    await db.from('assessment_sessions').delete().lt('expires_at', new Date().toISOString());
    return res.status(200).json({ token, staff: { name: staff.name, branch: staff.branch }, mustSetPassword: !hasPassword });
  }

  if (req.method === 'POST' && action === 'logout') {
    const token = String(req.headers['x-assessment-token'] || '');
    if (token) await db.from('assessment_sessions').delete().eq('token_hash', hashSecret(token));
    return res.status(200).json({ success: true });
  }

  const staff = await staffSession(db, req);
  if (req.method === 'POST' && action === 'set_password') {
    const { data: row, error: rowError } = await db.from('assessment_staff').select('staff_code,password_hash').eq('id', staff.id).single();
    if (rowError) throw rowError;
    // Changing an existing password needs the current one; the first time is allowed straight after the IC sign-in.
    if (row.password_hash && !ic4Matches(String(body.current || ''), row.password_hash)) throw fail(400, 'Your current password is not correct.');
    const password = String(body.password || '');
    if (password.length < 8) throw fail(400, 'Use at least 8 characters.');
    if (password.length > 100) throw fail(400, 'That password is too long.');
    if (/^\d{4}$/.test(password) || password.toUpperCase() === String(row.staff_code).toUpperCase()) throw fail(400, 'Choose a password that is not your staff code or your IC digits.');
    const token = String(req.headers['x-assessment-token'] || '');
    const { error } = await db.from('assessment_staff').update({ password_hash: hashIc4(password), password_set_at: new Date().toISOString(), failed_logins: 0, locked_until: null }).eq('id', staff.id);
    if (error) throw error;
    // Any other device signed in as this person is signed out; this one stays.
    await db.from('assessment_sessions').delete().eq('staff_id', staff.id).neq('token_hash', hashSecret(token));
    return res.status(200).json({ success: true });
  }
  // The staff member's own HR record and leave balance. No IC, bank or pay details are sent.
  if (req.method === 'GET' && (action === 'my_profile' || action === 'my_leave')) {
    const { data: person, error: personError } = await db.from('hr_employees').select('id,company,employee_code,full_name,branch,department,designation,employment_type,join_date,confirm_date,email,phone,status').eq('assessment_staff_id', staff.id).maybeSingle();
    if (personError) throw personError;
    if (!person) return res.status(200).json({ linked: false });
    if (action === 'my_profile') return res.status(200).json({ linked: true, profile: { fullName: person.full_name, code: person.employee_code, company: person.company, branch: person.branch, department: person.department, position: person.designation, employmentType: person.employment_type, joinDate: person.join_date, confirmDate: person.confirm_date, email: person.email, phone: person.phone } });
    const { data: balances, error } = await db.from('hr_leave_balances').select('leave_group,year,eligible,brought_forward,credit,earn,total,taken,balance,bf_expiry,as_of').eq('employee_id', person.id);
    if (error) throw error;
    const rank = ['AL', 'ML', 'HOSP', 'MARRG', 'HAJUMR', 'UL'];
    return res.status(200).json({ linked: true, name: person.full_name, balances: (balances || []).map((row: any) => ({ group: row.leave_group, year: row.year, eligible: Number(row.eligible), broughtForward: Number(row.brought_forward), earn: Number(row.earn), credit: Number(row.credit), total: Number(row.total), taken: Number(row.taken), balance: Number(row.balance), bfExpiry: row.bf_expiry, asOf: row.as_of })).sort((a: any, b: any) => (rank.indexOf(a.group) + 1 || 99) - (rank.indexOf(b.group) + 1 || 99)) });
  }
  if (action.startsWith('leave_')) return await leaveAction(req, res, db, staff, action, body);
  if (action.startsWith('incentive')) return await incentiveAction(req, res, db, staff, action, body);

  if (req.method === 'GET' && action === 'me') {
    let isApprover = false, leaveWaiting = 0, designation = '';
    try {
      const { data: self } = await db.from('hr_employees').select('id,designation').eq('assessment_staff_id', staff.id).maybeSingle();
      if (self) {
        designation = String(self.designation || '');
        const { count } = await db.from('hr_employees').select('id', { count: 'exact', head: true }).or(`leave_approver_id.eq.${self.id},leave_backup_approver_id.eq.${self.id},final_approver_id.eq.${self.id}`).eq('status', 'Active'); isApprover = (count || 0) > 0;
        // Requests waiting for this person's decision: shown as a number on the Leave icon.
        const [{ count: first }, { count: last }] = await Promise.all([
          db.from('hr_leave_requests').select('id', { count: 'exact', head: true }).or(`approver_id.eq.${self.id},backup_approver_id.eq.${self.id}`).eq('status', 'pending'),
          db.from('hr_leave_requests').select('id', { count: 'exact', head: true }).eq('final_approver_id', self.id).eq('status', 'supervisor_approved'),
        ]);
        leaveWaiting = (first || 0) + (last || 0);
      }
    } catch { /* leave tables not set up yet */ }
    // Preview accounts see every assessment, including closed ones.
    let quizQuery = db.from('assessment_quizzes').select('id,title,description,pass_mark,active,questions').order('created_at', { ascending: false });
    if (!staff.can_preview) quizQuery = quizQuery.eq('active', true);
    const [{ data: quizzes, error: quizError }, { data: attempts, error: attemptError }] = await Promise.all([
      quizQuery,
      db.from('assessment_attempts').select('quiz_id,score,total,attempt_no,submitted_at').eq('staff_id', staff.id),
    ]);
    if (quizError || attemptError) throw quizError || attemptError;
    // Staff see their latest try; its attempt_no is how many tries they have made.
    const byQuiz = new Map<string, any>();
    for (const row of attempts || []) if (!byQuiz.has(row.quiz_id) || row.attempt_no > byQuiz.get(row.quiz_id).attempt_no) byQuiz.set(row.quiz_id, row);
    return res.status(200).json({
      staff: { name: staff.name, code: staff.staff_code, branch: staff.branch, preview: staff.can_preview, hasPassword: Boolean(staff.password_hash), isApprover, leaveWaiting, canAssess: Boolean(staff.can_preview) || /CLINIC ASSISTANT|ADMIN CLINICAL/i.test(designation) },
      quizzes: (quizzes || []).map((quiz: any) => {
        const attempt: any = byQuiz.get(quiz.id);
        return { id: quiz.id, title: quiz.title, description: quiz.description, passMark: quiz.pass_mark, active: quiz.active, questionCount: quiz.questions.length, attempt: attempt ? { score: attempt.score, total: attempt.total, count: attempt.attempt_no, submittedAt: attempt.submitted_at } : null };
      }),
    });
  }

  if (req.method === 'GET' && action === 'quiz') {
    let quizQuery = db.from('assessment_quizzes').select('id,title,description,pass_mark,questions').eq('id', text(req.query.id));
    if (!staff.can_preview) quizQuery = quizQuery.eq('active', true);
    const { data: quiz, error } = await quizQuery.maybeSingle();
    if (error) throw error;
    if (!quiz) throw fail(404, 'This assessment is not open.');
    // Correct answers stay on the server, except for preview accounts.
    return res.status(200).json({ id: quiz.id, title: quiz.title, description: quiz.description, passMark: quiz.pass_mark, preview: staff.can_preview, questions: quiz.questions.map((question: any) => ({ id: question.id, text: question.text, options: question.options, ...(staff.can_preview ? { answer: question.answer } : {}) })) });
  }

  if (req.method === 'POST' && action === 'submit') {
    if (staff.can_preview) throw fail(403, 'Preview accounts cannot submit answers.');
    const { data: quiz, error } = await db.from('assessment_quizzes').select('id,pass_mark,questions').eq('id', text(body.id)).eq('active', true).maybeSingle();
    if (error) throw error;
    if (!quiz) throw fail(404, 'This assessment is not open.');
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const questions = quiz.questions as { id: string; answer: number }[];
    if (questions.some((question) => !Number.isInteger(answers[question.id]))) throw fail(400, 'Answer every question before submitting.');
    const recorded = await isAssessed(db, staff);
    // Below full marks the staff member retakes; every try is kept as its own row.
    const { data: previous, error: previousError } = recorded ? await db.from('assessment_attempts').select('score,total,attempt_no').eq('quiz_id', quiz.id).eq('staff_id', staff.id) : { data: [], error: null };
    if (previousError) throw previousError;
    if ((previous || []).some((row: any) => row.score >= row.total)) throw fail(409, 'You have already passed this assessment.');
    const attemptNo = Math.max(0, ...(previous || []).map((row: any) => row.attempt_no)) + 1;
    // Only which questions were wrong is returned, never the correct answers.
    const wrong = questions.filter((question) => answers[question.id] !== question.answer).map((question) => question.id);
    const score = questions.length - wrong.length;
    // Not recorded for anyone outside the assessed roles: they just see how they did.
    if (!recorded) return res.status(200).json({ score, total: questions.length, passMark: PASS_MARK, attempt: 1, wrong, recorded: false });
    const { error: saveError } = await db.from('assessment_attempts').insert({ quiz_id: quiz.id, staff_id: staff.id, answers, score, total: questions.length, attempt_no: attemptNo });
    // Two screens submitting at once would claim the same attempt number.
    if (saveError?.code === '23505') throw fail(409, 'This assessment was just submitted from another screen. Go back to see your result.');
    if (saveError) throw saveError;
    return res.status(200).json({ score, total: questions.length, passMark: PASS_MARK, attempt: attemptNo, wrong, recorded: true });
  }

  throw fail(405, 'Method not allowed.');
}

// Only clinic assistants and clinical admin sit the assessments for the record; anyone else may try them as practice.
const ASSESSED_DESIGNATION = /CLINIC ASSISTANT|ADMIN CLINICAL/i;
async function isAssessed(db: any, staff: any) {
  try { const { data } = await db.from('hr_employees').select('designation').eq('assessment_staff_id', staff.id).maybeSingle(); return ASSESSED_DESIGNATION.test(String(data?.designation || '')); } catch { return false; }
}

async function adminAction(req: any, res: any, action: string, body: any) {
  const { db, user, profile } = await activeAccount(req);
  if (profile.role !== 'super_admin') throw fail(403, 'Only System Admin can manage the Assessment Room.');
  const now = new Date().toISOString();

  // User Management only needs the staff list, so skip quizzes and results.
  if (req.method === 'GET' && action === 'staff') {
    const { data, error } = await db.from('assessment_staff').select('id,name,staff_code,branch,active,ic4_hash,can_preview,password_hash').order('name');
    if (error) throw error;
    return res.status(200).json({ staff: (data || []).map((row: any) => ({ id: row.id, name: row.name, code: row.staff_code, branch: row.branch, active: row.active, hasIc4: Boolean(row.ic4_hash), hasPassword: Boolean(row.password_hash), preview: row.can_preview })) });
  }

  if (req.method === 'GET' && action === 'admin') {
    const [staff, quizzes, attempts] = await Promise.all([
      db.from('assessment_staff').select('id,name,staff_code,branch,active,can_preview').order('name'),
      db.from('assessment_quizzes').select('id,title,description,pass_mark,active,questions,updated_at').order('created_at', { ascending: false }),
      // Answers are left out to keep this list small; attempt_detail fetches them for one staff member.
      db.from('assessment_attempts').select('id,quiz_id,staff_id,score,total,attempt_no,submitted_at').order('submitted_at', { ascending: false }),
    ]);
    if (staff.error || quizzes.error || attempts.error) throw staff.error || quizzes.error || attempts.error;
    // The results list is for the roles that sit the assessments (clinic assistants and clinical admin).
    const { data: employees } = await db.from('hr_employees').select('assessment_staff_id,designation').not('assessment_staff_id', 'is', null);
    const assessed = new Set((employees || []).filter((row: any) => ASSESSED_DESIGNATION.test(String(row.designation || ''))).map((row: any) => row.assessment_staff_id));
    return res.status(200).json({
      staff: (staff.data || []).map((row: any) => ({ id: row.id, name: row.name, code: row.staff_code, branch: row.branch, active: row.active, preview: row.can_preview, assessed: assessed.has(row.id) })),
      quizzes: (quizzes.data || []).map((row: any) => ({ id: row.id, title: row.title, description: row.description, passMark: row.pass_mark, active: row.active, questions: row.questions, updatedAt: row.updated_at })),
      attempts: (attempts.data || []).map((row: any) => ({ id: row.id, quizId: row.quiz_id, staffId: row.staff_id, score: row.score, total: row.total, attemptNo: row.attempt_no, submittedAt: row.submitted_at })),
    });
  }

  if (req.method === 'POST' && action === 'save_staff') {
    const name = text(body.name, 120);
    // A blank code gets a random one so admins don't have to invent codes.
    const code = normaliseCode(body.code) || newStaffCode();
    if (!name) throw fail(400, 'Enter the staff name.');
    if (code.length < 3 || code.length > 20) throw fail(400, 'Staff code must be 3 to 20 letters or digits.');
    const ic4 = normaliseIc4(body.ic4);
    if (!body.id && ic4.length !== 4) throw fail(400, 'Enter the last 4 digits of the IC.');
    if (ic4 && ic4.length !== 4) throw fail(400, 'IC digits must be exactly 4 numbers.');
    const row: Record<string, unknown> = { name, staff_code: code, branch: text(body.branch, 40), active: body.active !== false, can_preview: Boolean(body.preview), failed_logins: 0, locked_until: null, updated_at: now };
    // Leaving the IC digits blank while editing keeps the current ones.
    if (ic4) row.ic4_hash = hashIc4(ic4);
    const { error } = body.id ? await db.from('assessment_staff').update(row).eq('id', text(body.id)) : await db.from('assessment_staff').insert(row);
    if (error?.code === '23505') throw fail(409, `Staff code ${code} is already used by another staff member.`);
    if (error) throw error;
    // Deactivated staff are signed out straight away.
    if (body.id && body.active === false) await db.from('assessment_sessions').delete().eq('staff_id', text(body.id));
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && action === 'reset_password') {
    const id = text(body.id);
    const { error } = await db.from('assessment_staff').update({ password_hash: null, password_set_at: null, failed_logins: 0, locked_until: null, updated_at: now }).eq('id', id);
    if (error) throw error;
    await db.from('assessment_sessions').delete().eq('staff_id', id);
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && action === 'delete_staff') {
    const { error } = await db.from('assessment_staff').delete().eq('id', text(body.id));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && action === 'save_quiz') {
    const title = text(body.title, 160);
    if (!title) throw fail(400, 'Give the assessment a title.');
    const row = { title, description: text(body.description, 2000), pass_mark: PASS_MARK, active: Boolean(body.active), questions: cleanQuestions(body.questions), updated_at: now, updated_by: user.id };
    const { error } = body.id ? await db.from('assessment_quizzes').update(row).eq('id', text(body.id)) : await db.from('assessment_quizzes').insert(row);
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && action === 'set_quiz_active') {
    const { error } = await db.from('assessment_quizzes').update({ active: Boolean(body.active), updated_at: now, updated_by: user.id }).eq('id', text(body.id));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && action === 'delete_quiz') {
    const { error } = await db.from('assessment_quizzes').delete().eq('id', text(body.id));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  // Every try one staff member made at one assessment, with their answers.
  if (req.method === 'GET' && action === 'attempt_detail') {
    const { data, error } = await db.from('assessment_attempts').select('id,score,total,attempt_no,answers,submitted_at')
      .eq('quiz_id', text(req.query.quizId)).eq('staff_id', text(req.query.staffId)).order('attempt_no');
    if (error) throw error;
    return res.status(200).json({ attempts: (data || []).map((row: any) => ({ id: row.id, score: row.score, total: row.total, attemptNo: row.attempt_no, answers: row.answers, submittedAt: row.submitted_at })) });
  }

  // Clears every try a staff member made at one assessment, so they start over.
  if (req.method === 'POST' && action === 'reset_attempt') {
    const { error } = await db.from('assessment_attempts').delete().eq('quiz_id', text(body.quizId)).eq('staff_id', text(body.staffId));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  throw fail(405, 'Method not allowed.');
}

const ADMIN_ACTIONS = new Set(['staff', 'admin', 'save_staff', 'delete_staff', 'save_quiz', 'set_quiz_active', 'delete_quiz', 'attempt_detail', 'reset_attempt', 'reset_password']);

export async function assessmentHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const action = text(req.query.action || body.action, 40);
    return ADMIN_ACTIONS.has(action) ? await adminAction(req, res, action, body) : await staffAction(req, res, action, body);
  } catch (error: any) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to complete this request.' });
  }
}
