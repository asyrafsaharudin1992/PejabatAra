import { randomBytes, scryptSync } from 'node:crypto';
import { officeAccess } from './_office-db.js';
import { LEAVE_TYPES, isoDate, leaveDays, rosterFor, yearAllowance } from './_assessment.js';
import { ATTACHMENT_REQUIRED_FOR, MAX_FILES, attachLeaveFiles, attachmentsFor, leaveFileLink, removeLeaveFiles, storeLeaveFile } from './_leave-files.js';

// Office HR. Served from /api/status?resource=hr because the Vercel Hobby plan
// allows only 12 functions. Accounts with HR office access (and System Admin) only.
// Staff profiles hold personal and pay details, so the list sends only what the
// directory shows; the full profile is read one person at a time, and every change
// is written to hr_audit.
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const pick = (value: unknown, allowed: string[], fallback: string) => allowed.includes(String(value)) ? String(value) : fallback;

const SUMMARY = 'id,company,employee_code,full_name,branch,department,designation,employment_type,status,join_date,assessment_staff_id';

const decode = (row: any) => ({
  id: row.id, company: row.company, employeeCode: row.employee_code, fullName: row.full_name, assessmentStaffId: row.assessment_staff_id,
  icNo: row.ic_no, passportNo: row.passport_no, nationality: row.nationality, gender: row.gender, dateOfBirth: row.date_of_birth, religion: row.religion,
  maritalStatus: row.marital_status, spouseWorking: row.spouse_working, children: row.children || [], phone: row.phone, email: row.email, address: row.address,
  emergencyName: row.emergency_name, emergencyRelation: row.emergency_relation, emergencyPhone: row.emergency_phone,
  branch: row.branch, department: row.department, designation: row.designation, employmentType: row.employment_type,
  joinDate: row.join_date, confirmDate: row.confirm_date, resignDate: row.resign_date, status: row.status, leaveGroup: row.leave_group,
  basicSalary: Number(row.basic_salary), fixedAllowances: row.fixed_allowances || [], bankName: row.bank_name, bankAccount: row.bank_account,
  workDays: Array.isArray(row.work_days) && row.work_days.length ? row.work_days : [1, 2, 3, 4, 5, 6], holidayGroup: row.holiday_group || '', leaveCalendarCompanies: row.leave_calendar_companies || [], leaveApproverId: row.leave_approver_id || null, leaveBackupApproverId: row.leave_backup_approver_id || null, finalApproverId: row.final_approver_id || null, epfNo: row.epf_no, socsoNo: row.socso_no, taxNo: row.tax_no, remarks: row.remarks, updatedAt: row.updated_at,
});

// Turns a profile sent by the page into a database row, checking each field.
function encode(body: any) {
  const fullName = text(body.fullName, 160);
  const employeeCode = text(body.employeeCode, 30).toUpperCase();
  if (!fullName) throw fail(400, 'Enter the full name.');
  if (!employeeCode) throw fail(400, 'Enter the employee code (as in Infotech, e.g. ARASK0001).');
  const salary = Number(body.basicSalary || 0);
  if (!Number.isFinite(salary) || salary < 0) throw fail(400, 'Basic salary must be a positive amount.');
  const children = (Array.isArray(body.children) ? body.children : []).slice(0, 20).map((child: any) => ({ name: text(child?.name, 120), dateOfBirth: isDate(child?.dateOfBirth) ? child.dateOfBirth : null, studying: Boolean(child?.studying), disabled: Boolean(child?.disabled) })).filter((child: any) => child.name);
  const fixedAllowances = (Array.isArray(body.fixedAllowances) ? body.fixedAllowances : []).slice(0, 20).map((item: any) => ({ name: text(item?.name, 80), amount: Math.round(Number(item?.amount || 0) * 100) / 100 })).filter((item: any) => item.name && Number.isFinite(item.amount));
  return {
    company: pick(body.company, ['KJ', 'SK'], ''), employee_code: employeeCode, full_name: fullName,
    assessment_staff_id: text(body.assessmentStaffId, 60) || null,
    ic_no: text(body.icNo, 20), passport_no: text(body.passportNo, 30), nationality: text(body.nationality, 40) || 'Malaysian',
    gender: pick(body.gender, ['', 'Male', 'Female'], ''), date_of_birth: isDate(body.dateOfBirth) ? body.dateOfBirth : null, religion: text(body.religion, 40),
    marital_status: pick(body.maritalStatus, ['', 'Single', 'Married', 'Divorced', 'Widowed'], ''), spouse_working: typeof body.spouseWorking === 'boolean' ? body.spouseWorking : null,
    children, phone: text(body.phone, 30), email: text(body.email, 120), address: text(body.address, 500),
    emergency_name: text(body.emergencyName, 120), emergency_relation: text(body.emergencyRelation, 40), emergency_phone: text(body.emergencyPhone, 30),
    branch: text(body.branch, 60), department: text(body.department, 60), designation: text(body.designation, 80),
    employment_type: pick(body.employmentType, ['Permanent', 'Contract', 'Part-time', 'Locum', 'Intern'], 'Permanent'),
    join_date: isDate(body.joinDate) ? body.joinDate : null, confirm_date: isDate(body.confirmDate) ? body.confirmDate : null, resign_date: isDate(body.resignDate) ? body.resignDate : null,
    status: pick(body.status, ['Active', 'Inactive'], 'Active'), leave_group: text(body.leaveGroup, 30),
    basic_salary: Math.round(salary * 100) / 100, fixed_allowances: fixedAllowances, bank_name: text(body.bankName, 60), bank_account: text(body.bankAccount, 40),
    epf_no: text(body.epfNo, 30), socso_no: text(body.socsoNo, 30), tax_no: text(body.taxNo, 30), remarks: text(body.remarks, 2000),
  };
}

// Last 4 IC digits: only a salted scrypt hash is stored, never the digits (the same as the sign-in in _assessment.ts).
function hashIc4(digits: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(digits, salt, 32).toString('hex')}`; }

// Company leave policy (annual leave by category and years of service; sick leave 14/18/22; hospital leave 60).
const LEAVE_GROUPS = ['AL', 'ML', 'HOSP', 'MARRG', 'HAJUMR', 'UL'];
const POLICY_AL: Record<string, number[]> = { admin: [15, 20, 25], clinical: [8, 12, 16], parttime: [6, 8, 11] };
const POLICY_ML = [14, 18, 22];
// Under 2 years, 2 up to 5 years, 5 years and more.
const tierOf = (years: number) => years >= 5 ? 2 : years >= 2 ? 1 : 0;
// The year's entitlement worked out the way Infotech does it (it matches every staff member who started before 2026): annual leave is the
// average over the 12 months of the figure for the person's tier at each month end, rounded, so someone who passes 2 years part-way through
// the year gets a share of both figures; sick leave uses the tier on 31 December.
function policyFor(track: string, joinDate: string, year = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4))) {
  const part = track === 'parttime', table = POLICY_AL[track] || POLICY_AL.clinical;
  const yearsAt = (date: string) => (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${joinDate}T00:00:00Z`)) / (365.25 * 86400000);
  let sum = 0; for (let month = 0; month < 12; month++) sum += table[tierOf(yearsAt(new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)))];
  return { al: Math.round(sum / 12), ml: part ? null : POLICY_ML[tierOf(yearsAt(`${year}-12-31`))], hosp: part ? null : 60 };
}
// In the year someone joins, annual leave is shared by month, as Infotech does (the setting "Annual Leave Prorate based on leave calculation Date Joined"):
// the entitlement x (months from the join month to December) / 12, rounded. People can take leave up to this for the year. Staff who joined in an
// earlier year have the whole entitlement, so this returns null for them.
function firstYearEarn(eligible: number, joinDate: string) {
  const thisYear = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4);
  if (joinDate.slice(0, 4) !== thisYear) return null;
  return Math.round(eligible * (12 - Number(joinDate.slice(5, 7)) + 1) / 12);
}
// Sets a balance row. Annual leave: total = brought forward + credit + (earned so far, or the full entitlement once nothing more is
// being earned) - forfeited. Other groups keep a total of 0 as in Infotech. Balance = total - taken (+ advance). Every change is written
// to the person's HR history.
// Gantian Cuti Rehat (GCR), as in the HR memo on paid annual leave: credit leave is used first and burns on 31 December if
// unused (never paid, never carried); leave then comes off the yearly eligible days, then the brought forward. Staff who used
// at least the set share of their eligible days may be paid for what is left of it, up to the set number of days, if they choose;
// the rest is carried forward up to a limit per leave category. The numbers live in hr_gcr_settings, which HR edits in the system.
type GcrSettings = { minUsedPercent: number; maxDays: number; carry: { admin: number; clinical: number; parttime: number } };
const GCR_DEFAULTS: GcrSettings = { minUsedPercent: 50, maxDays: 4, carry: { admin: 25, clinical: 20, parttime: 20 } };
async function loadGcrSettings(db: any): Promise<GcrSettings> {
  try {
    const { data } = await db.from('hr_gcr_settings').select('min_used_percent,max_days,carry_admin,carry_clinical,carry_parttime').eq('id', 1).maybeSingle();
    if (!data) return GCR_DEFAULTS;
    return { minUsedPercent: Number(data.min_used_percent), maxDays: Number(data.max_days), carry: { admin: Number(data.carry_admin), clinical: Number(data.carry_clinical), parttime: Number(data.carry_parttime) } };
  } catch { return GCR_DEFAULTS; }
}
async function loadGcrChoices(db: any, year: number) {
  try { const { data } = await db.from('hr_gcr_choices').select('employee_id,days_paid').eq('year', year).limit(4000); return new Map<string, number>((data || []).map((row: any) => [row.employee_id, Number(row.days_paid)])); } catch { return new Map<string, number>(); }
}
// Carry-forward days HR set by hand (management approval), with the reason. Missing means the calculated figure is used.
async function loadCarryOverrides(db: any, year: number) {
  try { const { data } = await db.from('hr_gcr_choices').select('employee_id,carry_override,note').eq('year', year).not('carry_override', 'is', null).limit(4000); return new Map<string, { days: number; note: string }>((data || []).map((row: any) => [row.employee_id, { days: Number(row.carry_override), note: row.note || '' }])); } catch { return new Map<string, { days: number; note: string }>(); }
}
function gcrFor(b: any, track: string, settings: GcrSettings, chosen = 0) {
  const r = (v: number) => Math.round(v * 100) / 100;
  const eligible = Number(b?.eligible || 0), bf = Number(b?.brought_forward || 0), credit = Number(b?.credit || 0), taken = Number(b?.taken || 0);
  const creditUsed = Math.min(credit, taken);
  let rest = taken - creditUsed;
  const eligibleUsed = Math.min(eligible, Math.max(0, rest)); rest -= eligibleUsed;
  const bfUsed = Math.min(Math.max(0, bf), Math.max(0, rest)); rest -= bfUsed;
  const overdrawn = Math.max(0, rest);
  const eligibleUnused = Math.max(0, eligible - eligibleUsed);
  const percentUsed = eligible > 0 ? (eligibleUsed / eligible) * 100 : 0;
  const qualifies = eligible > 0 && percentUsed >= settings.minUsedPercent;
  const maxPay = qualifies ? Math.min(settings.maxDays, eligibleUnused) : 0;
  const paid = Math.min(Math.max(0, chosen), maxPay);
  const limit = (settings.carry as Record<string, number>)[track] ?? settings.carry.clinical;
  const afterPay = eligibleUnused - paid;
  const carry = Math.min(limit, afterPay);
  return { eligible: r(eligible), credit: r(credit), taken: r(taken), creditUsed: r(creditUsed), burn: r(credit - creditUsed), bfExpired: r(bf - bfUsed), eligibleUsed: r(eligibleUsed), eligibleUnused: r(eligibleUnused), percentUsed: r(percentUsed), qualifies, maxPay: r(maxPay), paid: r(paid), carry: r(carry), overLimit: r(afterPay - carry), limit, overdrawn: r(overdrawn) };
}

async function saveLeaveBalance(db: any, userId: string, now: string, employeeId: string, group: string, year: number, next: { eligible: number; brought_forward: number; credit: number; earn: number; forfeit: number }) {
  const { data: before } = await db.from('hr_leave_balances').select('*').eq('employee_id', employeeId).eq('leave_group', group).eq('year', year).maybeSingle();
  const taken = Number(before?.taken ?? 0), advance = Number(before?.advance ?? 0);
  const total = group === 'AL' ? next.brought_forward + next.credit + (next.earn > 0 ? next.earn : next.eligible) - next.forfeit : 0;
  const balance = Math.round(((group === 'AL' ? total : next.eligible + next.brought_forward + next.credit - next.forfeit) - taken + advance) * 100) / 100;
  const { error } = await db.from('hr_leave_balances').upsert({ employee_id: employeeId, leave_group: group, year, ...next, total, taken, balance, advance, as_of: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }), source: 'hr', updated_at: now }, { onConflict: 'employee_id,leave_group,year' });
  if (error) throw error;
  const changes: Record<string, unknown> = {};
  for (const key of ['eligible', 'brought_forward', 'credit', 'earn', 'forfeit'] as const) { const was = Number(before?.[key] ?? 0); if (!before || was !== next[key]) changes[`leave_${group}_${key}`] = [before ? was : null, next[key]]; }
  if (Object.keys(changes).length) await db.from('hr_audit').insert({ employee_id: employeeId, action: 'update', changes, changed_by: userId });
  return { total, balance };
}

// The leave category guessed for a staff member when HR has not set one: doctors and residents follow the Doctor / clinic assistant
// tiers whatever their department, administrative jobs follow the Administrative tiers, part-time follows the part-time tiers.
function guessLeaveTrack(person: { department?: string | null; designation?: string | null; employment_type?: string | null }) {
  const designation = String(person.designation || '').toUpperCase(), department = String(person.department || '').toUpperCase();
  if (/PART/i.test(String(person.employment_type || ''))) return 'parttime';
  if (/\bDR\b|DOCTOR|RESIDENT/.test(designation)) return 'clinical';
  if (/ADMIN|OFFICER|EXECUTIVE|MANAGER/.test(designation) || /^(OFFICE|ADMIN)/.test(department)) return 'admin';
  return 'clinical';
}

// Gives one staff member their leave category and the policy balances (AL, ML, hospital and the fixed ones), as the Company policy
// page does. Used there, and automatically when HR adds a new staff member. Returns how many balances were created or changed.
async function applyLeavePolicy(db: any, userId: string, now: string, employeeId: string, track: string, join: string) {
  const item = { id: employeeId, track };
  let changed = 0;
  const policy = policyFor(item.track, join);
  await db.from('hr_employees').update({ leave_policy: item.track, updated_at: now, updated_by: userId }).eq('id', item.id);
  const served = (Date.now() - Date.parse(`${join}T00:00:00Z`)) / (365.25 * 86400000);
  const thisYear = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4));
  const part = item.track === 'parttime';
  // The policy figures, plus the fixed entitlements everyone has in Infotech (marriage 1, Haji/Umrah 14, unpaid 30) when missing.
  const groups: [string, number | null, number][] = [['AL', policy.al, thisYear], ['ML', policy.ml, thisYear], ['HOSP', policy.hosp, 0], ['MARRG', part ? null : 1, 0], ['HAJUMR', part ? null : 14, 0], ['UL', part ? null : 30, 0]];
  for (const [group, value, year] of groups) {
    if (value === null) continue;
    const { data: rows } = await db.from('hr_leave_balances').select('*').eq('employee_id', item.id).eq('leave_group', group).order('year', { ascending: false }).limit(1);
    const row = rows?.[0];
    if (!row) {
      // A new balance. Someone in their first year starts by earning 1 day (as Infotech does for the newest staff) and HR raises it each month.
      await saveLeaveBalance(db, userId, now, item.id, group, year, { eligible: value, brought_forward: 0, credit: 0, earn: group === 'AL' ? (firstYearEarn(value, join) ?? 0) : 0, forfeit: 0 });
      changed++; continue;
    }
    if (!['AL', 'ML', 'HOSP'].includes(group)) continue;
    // In the year someone joins, annual leave is shared by month (see firstYearEarn); an amount already set is never lowered.
    const earn = group === 'AL' ? Math.max(Number(row.earn), firstYearEarn(value, join) ?? 0) : Number(row.earn);
    if (Number(row.eligible) === value && earn === Number(row.earn)) continue;
    await saveLeaveBalance(db, userId, now, item.id, group, row.year, { eligible: value, brought_forward: Number(row.brought_forward), credit: Number(row.credit), earn, forfeit: Number(row.forfeit) });
    changed++;
  }
  return changed;
}

// Builds the leave of any active staff member who has none yet (for example someone added before leave was set up automatically).
// Only people with a join date and no Annual Leave balance at all are touched, so existing balances are never changed.
async function ensureLeaveSetup(db: any, userId: string, now: string) {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
    const [{ data: people }, { data: have }] = await Promise.all([
      db.from('hr_employees').select('id,join_date,leave_policy,department,designation,employment_type').eq('status', 'Active').not('join_date', 'is', null).lte('join_date', `${today.slice(0, 4)}-12-31`).limit(1000),
      db.from('hr_leave_balances').select('employee_id').eq('leave_group', 'AL').limit(5000),
    ]);
    const covered = new Set((have || []).map((row: any) => row.employee_id));
    let created = 0;
    for (const person of (people || []).filter((p: any) => !covered.has(p.id))) { created += await applyLeavePolicy(db, userId, now, person.id, person.leave_policy || guessLeaveTrack(person), person.join_date); }
    return created;
  } catch { return 0; }
}

export async function hrHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, user, profile } = await officeAccess(req, false, 'hr');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const action = text(req.query.action || body.action, 40);
    const now = new Date().toISOString();

    if (req.method === 'GET' && action === 'staff') {
      // The Assessment Room staff list; preview and test accounts are not real staff.
      const { data, error } = await db.from('assessment_staff').select('id,name,staff_code,branch,active').eq('can_preview', false).neq('branch', 'Test').order('branch').order('name');
      if (error) throw error;
      return res.status(200).json({ admin: profile.role === 'super_admin', staff: (data || []).map((row: any) => ({ id: row.id, name: row.name, code: row.staff_code, branch: row.branch, active: row.active })) });
    }

    // Directory list: only what the cards show, no personal or pay details.
    if (req.method === 'GET' && action === 'employees') {
      // leave_approver_id is new: until its migration is run the list is read without it.
      let result: any = await db.from('hr_employees').select(`${SUMMARY},leave_approver_id,leave_backup_approver_id,final_approver_id`).order('company').order('full_name');
      if (result.error?.code === '42703') result = await db.from('hr_employees').select(SUMMARY).order('company').order('full_name');
      const { data, error } = result;
      if (error) throw error;
      // Whether each person's individual sign-in has a password yet: none (no sign-in), not_set, or set.
      const linked = (data || []).map((row: any) => row.assessment_staff_id).filter(Boolean);
      const { data: logins } = linked.length ? await db.from('assessment_staff').select('id,password_hash').in('id', linked) : { data: [] };
      const hasPassword = new Map((logins || []).map((login: any) => [login.id, Boolean(login.password_hash)]));
      return res.status(200).json({ employees: (data || []).map((row: any) => ({ id: row.id, company: row.company, employeeCode: row.employee_code, fullName: row.full_name, branch: row.branch, department: row.department, designation: row.designation, employmentType: row.employment_type, status: row.status, joinDate: row.join_date, assessmentStaffId: row.assessment_staff_id, leaveApproverId: row.leave_approver_id || null, leaveBackupApproverId: row.leave_backup_approver_id || null, finalApproverId: row.final_approver_id || null, signIn: !row.assessment_staff_id ? 'none' : hasPassword.get(row.assessment_staff_id) ? 'set' : 'not_set' })) });
    }

    // One full profile, with its recent changes.
    if (req.method === 'GET' && action === 'employee') {
      const id = text(req.query.id, 60);
      const [{ data, error }, { data: audit, error: auditError }] = await Promise.all([
        db.from('hr_employees').select('*').eq('id', id).maybeSingle(),
        db.from('hr_audit').select('action,changes,changed_at,changed_by').eq('employee_id', id).order('changed_at', { ascending: false }).limit(20),
      ]);
      if (error || auditError) throw error || auditError;
      if (!data) throw fail(404, 'Profile not found.');
      const ids = [...new Set((audit || []).map((row: any) => row.changed_by).filter(Boolean))];
      const { data: people } = ids.length ? await db.from('profiles').select('id,full_name').in('id', ids) : { data: [] };
      const names = new Map((people || []).map((row: any) => [row.id, row.full_name]));
      // Whether this person's individual sign-in has a password yet (null until the migration is run).
      let signIn: { linked: boolean; hasPassword: boolean | null } = { linked: Boolean(data.assessment_staff_id), hasPassword: null };
      if (data.assessment_staff_id) {
        const { data: login, error: loginError } = await db.from('assessment_staff').select('password_hash').eq('id', data.assessment_staff_id).maybeSingle();
        if (!loginError) signIn = { linked: true, hasPassword: Boolean(login?.password_hash) };
      }
      return res.status(200).json({ signIn, employee: decode(data), audit: (audit || []).map((row: any) => ({ action: row.action, changes: row.changes, at: row.changed_at, by: names.get(row.changed_by) || '' })) });
    }

    // The weekdays a person works (0 = Sunday ... 6 = Saturday); leave is counted on these only.
    if (req.method === 'POST' && action === 'set_work_days') {
      const id = text(body.id, 60);
      const days: number[] = [...new Set<number>((Array.isArray(body.days) ? body.days : []).map(Number).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
      if (!days.length) throw fail(400, 'Choose at least one working day.');
      const { error } = await db.from('hr_employees').update({ work_days: days, updated_at: now, updated_by: user.id }).eq('id', id);
      if (error) throw error;
      await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { work_days: days }, changed_by: user.id });
      return res.status(200).json({ success: true, days });
    }

    // The public holiday group a person belongs to (SG-MNG, SG-OPS, MLHL, NO-PH, or none): leave is not counted on
    // that group's holidays unless the duty roster says the person works the day.
    if (req.method === 'POST' && action === 'set_holiday_group') {
      const id = text(body.id, 60), group = text(body.group, 20);
      if (!['', 'SG-MNG', 'SG-OPS', 'MLHL', 'NO-PH'].includes(group)) throw fail(400, 'Choose a holiday group.');
      const { error } = await db.from('hr_employees').update({ holiday_group: group, updated_at: now, updated_by: user.id }).eq('id', id);
      if (error) throw error;
      await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { holiday_group: group }, changed_by: user.id });
      return res.status(200).json({ success: true, group });
    }

    if (req.method === 'POST' && action === 'set_leave_calendar_access') {
      const id = text(body.id, 60);
      if (!Array.isArray(body.companies) || body.companies.some((company: unknown) => company !== 'KJ' && company !== 'SK')) throw fail(400, 'Choose department only, KJ, SK, or KJ + SK.');
      const companies = [...new Set(body.companies)].sort();
      const { data: before, error: readError } = await db.from('hr_employees').select('leave_calendar_companies').eq('id', id).single();
      if (readError) throw readError;
      const { error } = await db.from('hr_employees').update({ leave_calendar_companies: companies, updated_at: now, updated_by: user.id }).eq('id', id);
      if (error) throw error;
      await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { leave_calendar_companies: [before.leave_calendar_companies || [], companies] }, changed_by: user.id });
      return res.status(200).json({ success: true, companies });
    }

    // Who approves each person's leave: the supervisor (first level) or the final approver (second level).
    // An empty approver clears it.
    if (req.method === 'POST' && action === 'assign_leave_approver') {
      const column = body.level === 'final' ? 'final_approver_id' : body.level === 'backup' ? 'leave_backup_approver_id' : 'leave_approver_id';
      const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).map((id: unknown) => text(id, 60)).filter(Boolean).slice(0, 200);
      const approverId = text(body.approverId, 60) || null;
      if (!ids.length) throw fail(400, 'Choose the staff.');
      if (approverId && ids.includes(approverId)) throw fail(400, 'A person cannot approve their own leave.');
      const { data: before, error: readError } = await db.from('hr_employees').select(`id,${column}`).in('id', ids);
      if (readError) throw readError;
      const { error } = await db.from('hr_employees').update({ [column]: approverId, updated_at: now, updated_by: user.id }).in('id', ids);
      if (error) throw error;
      const changed = (before || []).filter((row: any) => (row[column] || null) !== approverId);
      if (changed.length) await db.from('hr_audit').insert(changed.map((row: any) => ({ employee_id: row.id, action: 'update', changes: { [column]: [row[column] || null, approverId] }, changed_by: user.id })));
      return res.status(200).json({ success: true, updated: ids.length });
    }

    // Staff incentive claims that Clinical Admin has approved and sent to HR (read only).
    if (req.method === 'GET' && action === 'incentives') {
      const month = text(req.query.month, 7);
      if (month !== 'all' && !/^\d{4}-\d{2}$/.test(month)) throw fail(400, 'Choose a month.');
      let query = db.from('incentive_claims').select('id,month,branch,entries,status,admin_note,approved_by,submitted_at,decided_at,hr_submitted_at,hr_submitted_by,hr_received_at,hr_received_by,assessment_staff(name,staff_code)').not('hr_submitted_at', 'is', null);
      if (month !== 'all') query = query.eq('month', month);
      const { data, error } = await query.order('month', { ascending: false }).order('hr_submitted_at', { ascending: false });
      if (error?.code === '42703') return res.status(200).json({ claims: [], notSetUp: true });
      if (error) throw error;
      return res.status(200).json({ claims: (data || []).map((row: any) => ({ id: row.id, month: row.month, branch: row.branch, staffName: row.assessment_staff?.name || '', staffCode: row.assessment_staff?.staff_code || '', entries: row.entries || [], status: row.status, adminNote: row.admin_note, approvedBy: row.approved_by, submittedAt: row.submitted_at, decidedAt: row.decided_at, hrSubmittedAt: row.hr_submitted_at, hrSubmittedBy: row.hr_submitted_by, hrReceivedAt: row.hr_received_at, hrReceivedBy: row.hr_received_by || '' })) });
    }
    // HR marks sent incentive claims as received (or undoes it).
    if (req.method === 'POST' && (action === 'incentive_receive' || action === 'incentive_unreceive')) {
      const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).map((id: unknown) => text(id, 60)).filter(Boolean).slice(0, 500);
      if (!ids.length) throw fail(400, 'Choose the claims.');
      const by = text(body.by, 80);
      if (action === 'incentive_receive' && !by) throw fail(400, 'Enter your name.');
      const patch = action === 'incentive_receive' ? { hr_received_at: now, hr_received_by: by } : { hr_received_at: null, hr_received_by: '' };
      // Pick the claims that can change first, then update them by id (a filter on the changed column would
      // hide the updated rows from the result).
      let pick: any = db.from('incentive_claims').select('id').in('id', ids).not('hr_submitted_at', 'is', null);
      pick = action === 'incentive_receive' ? pick.is('hr_received_at', null) : pick.not('hr_received_at', 'is', null);
      const { data: eligible, error: pickError } = await pick;
      if (pickError) throw pickError;
      const target = (eligible || []).map((row: any) => row.id);
      if (target.length) { const { error } = await db.from('incentive_claims').update(patch).in('id', target); if (error) throw error; }
      const data = target;
      return res.status(200).json({ success: true, updated: (data || []).length });
    }

    // HR deletes a leave request (a mistake, or leave that is no longer wanted). If the app had already taken the days
    // off the balance (approved and not imported from Infotech), they go back on it. The deletion is written to the
    // person's HR history. Approving and rejecting stay in Individual Sign In.
    if (req.method === 'POST' && action === 'leave_delete') {
      const { data: request, error: readError } = await db.from('hr_leave_requests').select('*').eq('id', text(body.id, 60)).maybeSingle();
      if (readError) throw readError;
      if (!request) throw fail(404, 'This request no longer exists.');
      const sourceYear = Number(String(request.start_date).slice(0, 4));
      const { data: closed, error: closureError } = await db.from('hr_leave_year_closures').select('target_year').eq('target_year', sourceYear + 1).maybeSingle();
      if (closureError) throw closureError;
      if (closed) throw fail(409, `The ${sourceYear} leave year is closed. Its requests can no longer be changed.`);
      const fromInfotech = String(request.decision_note || '').startsWith('Imported from Infotech');
      let restored = 0;
      if (request.status === 'approved' && !fromInfotech) {
        // The balance was taken off the newest year of the leave group at approval: put the days back there.
        const { data: rows } = await db.from('hr_leave_balances').select('id,taken,balance').eq('employee_id', request.employee_id).eq('leave_group', request.leave_group).eq('year', Number(String(request.start_date).slice(0, 4))).limit(1);
        if (rows?.length) { restored = Number(request.days); const { error } = await db.from('hr_leave_balances').update({ taken: Math.max(0, Number(rows[0].taken) - restored), balance: Number(rows[0].balance) + restored, updated_at: now }).eq('id', rows[0].id); if (error) throw error; }
      }
      await removeLeaveFiles(db, request.id);
      const { error: deleteError } = await db.from('hr_leave_requests').delete().eq('id', request.id);
      if (deleteError) throw deleteError;
      const summary = `${request.leave_type} ${request.start_date}${request.end_date !== request.start_date ? ` to ${request.end_date}` : ''}, ${Number(request.days)} day(s), ${request.status}${fromInfotech ? ', imported from Infotech' : ''}`;
      await db.from('hr_audit').insert({ employee_id: request.employee_id, action: 'delete', changes: { leave_request: [summary, 'deleted by HR'], ...(restored ? { balance_returned: [`${restored} day(s)`, request.leave_group] } : {}) }, changed_by: user.id });
      return res.status(200).json({ success: true, restored });
    }

    // Leave management by person: a card per staff member with their balances, and one person's balances and history.
    if (req.method === 'GET' && action === 'leave_staff') {
      await ensureLeaveSetup(db, user.id, now);
      const { data: people, error } = await db.from('hr_employees').select('id,company,employee_code,full_name,designation,status').order('company').order('full_name').limit(1000);
      if (error) throw error;
      const ids = (people || []).map((p: any) => p.id);
      const [{ data: balances }, { data: open }] = await Promise.all([
        db.from('hr_leave_balances').select('employee_id,leave_group,year,eligible,brought_forward,credit,earn,forfeit,total,taken,balance').in('employee_id', ids).in('leave_group', ['AL', 'ML']).limit(4000),
        db.from('hr_leave_requests').select('employee_id').in('status', ['pending', 'supervisor_approved']).limit(2000),
      ]);
      const latest = (employee: string, group: string) => (balances || []).filter((b: any) => b.employee_id === employee && b.leave_group === group).sort((a: any, b: any) => b.year - a.year)[0];
      const waiting = new Map<string, number>(); for (const row of open || []) waiting.set(row.employee_id, (waiting.get(row.employee_id) || 0) + 1);
      const pick = (b: any) => b ? { year: b.year, eligible: Number(b.eligible), total: Number(b.total), taken: Number(b.taken), balance: Number(b.balance) } : null;
      return res.status(200).json({ staff: (people || []).map((p: any) => ({ id: p.id, company: p.company, code: p.employee_code, name: p.full_name, designation: p.designation, status: p.status, al: pick(latest(p.id, 'AL')), ml: pick(latest(p.id, 'ML')), waiting: waiting.get(p.id) || 0 })) });
    }
    // GCR report (Gantian Cuti Rehat): per person, the credit that burns, the days to pay and what carries forward.
    if (req.method === 'GET' && action === 'leave_gcr') {
      const year = /^\d{4}$/.test(String(req.query.year)) ? Number(req.query.year) : Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4));
      const company = ['KJ', 'SK'].includes(String(req.query.company)) ? String(req.query.company) : '';
      let peopleQuery = db.from('hr_employees').select('id,company,employee_code,full_name,designation,join_date,leave_policy').eq('status', 'Active').order('company').order('employee_code').limit(1000);
      if (company) peopleQuery = peopleQuery.eq('company', company);
      const { data: people, error } = await peopleQuery;
      if (error) throw error;
      const ids = (people || []).map((p: any) => p.id);
      const { data: balances, error: balanceError } = ids.length ? await db.from('hr_leave_balances').select('employee_id,eligible,brought_forward,credit,taken,balance').in('employee_id', ids).eq('leave_group', 'AL').eq('year', year).limit(4000) : { data: [], error: null };
      if (balanceError) throw balanceError;
      const settings = await loadGcrSettings(db), choices = await loadGcrChoices(db, year);
      const rows = (people || []).map((p: any) => {
        const b: any = (balances || []).find((x: any) => x.employee_id === p.id);
        // The same fallback Year End uses until HR sets the leave category: 15 or more eligible days means Admin.
        const track = p.leave_policy || (b && Number(b.eligible) >= 15 ? 'admin' : 'clinical');
        return { id: p.id, company: p.company, code: p.employee_code, name: p.full_name, designation: p.designation || '', track, balance: b ? Number(b.balance) : null, chosen: choices.get(p.id) || 0, gcr: b ? gcrFor(b, track, settings, choices.get(p.id) || 0) : null };
      });
      return res.status(200).json({ year, settings, rows });
    }
    // HR edits the GCR rules in the system.
    if (req.method === 'POST' && action === 'leave_gcr_settings_save') {
      const pick = (value: unknown, label: string, max: number) => { const n = Number(value); if (!Number.isFinite(n) || n < 0 || n > max || Math.round(n * 100) !== n * 100) throw fail(400, `${label} must be a number from 0 to ${max}.`); return n; };
      const next = { min_used_percent: pick(body.minUsedPercent, 'The share of eligible leave to be used', 100), max_days: pick(body.maxDays, 'The most days that can be paid', 60), carry_admin: pick(body.carryAdmin, 'The Admin carry-forward limit', 366), carry_clinical: pick(body.carryClinical, 'The Operation carry-forward limit', 366), carry_parttime: pick(body.carryParttime, 'The Part-time carry-forward limit', 366) };
      const before = await loadGcrSettings(db);
      const { error } = await db.from('hr_gcr_settings').upsert({ id: 1, ...next, updated_by: user.id, updated_at: now });
      if (error) throw error;
      await db.from('hr_audit').insert({ employee_id: null, action: 'update', changes: { gcr_settings: [before, { minUsedPercent: next.min_used_percent, maxDays: next.max_days, carry: { admin: next.carry_admin, clinical: next.carry_clinical, parttime: next.carry_parttime } }] }, changed_by: user.id });
      return res.status(200).json({ success: true });
    }
    // Management approval at Year End: HR sets (or clears) how many days a staff member carries forward, and why.
    if (req.method === 'POST' && action === 'leave_carry_override') {
      const id = text(body.employeeId, 60), year = Number(body.year), note = text(body.note, 200);
      if (!id || !Number.isInteger(year)) throw fail(400, 'Choose the staff member and year.');
      const { data: closed } = await db.from('hr_leave_year_closures').select('target_year').eq('target_year', year + 1).maybeSingle();
      if (closed) throw fail(409, `The ${year} leave year is closed.`);
      const clear = body.days === null || body.days === '' || body.days === undefined;
      const days = clear ? null : Number(body.days);
      if (!clear && (!Number.isFinite(days) || (days as number) < 0 || (days as number) > 100 || Math.round((days as number) * 100) !== (days as number) * 100)) throw fail(400, 'Days carried forward must be a number from 0 to 100.');
      const { data: existing } = await db.from('hr_gcr_choices').select('days_paid').eq('employee_id', id).eq('year', year).maybeSingle();
      const { error } = await db.from('hr_gcr_choices').upsert({ employee_id: id, year, days_paid: Number(existing?.days_paid || 0), carry_override: days, note: clear ? '' : note, decided_by: user.id, decided_at: now });
      if (error) throw error;
      await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { year_end_carry_forward: [null, days], year_end_note: [null, clear ? '' : note] }, changed_by: user.id });
      return res.status(200).json({ success: true });
    }
    // The staff member's choice: how many of their payable days to be paid (0 = carry everything forward).
    if (req.method === 'POST' && action === 'leave_gcr_choice') {
      const id = text(body.employeeId, 60), year = Number(body.year), days = Number(body.days);
      if (!id || !Number.isInteger(year)) throw fail(400, 'Choose the staff member and year.');
      if (!Number.isFinite(days) || days < 0 || Math.round(days * 100) !== days * 100) throw fail(400, 'Days must be 0 or more.');
      const { data: closed } = await db.from('hr_leave_year_closures').select('target_year').eq('target_year', year + 1).maybeSingle();
      if (closed) throw fail(409, `The ${year} leave year is closed.`);
      const [{ data: person }, { data: balance }] = await Promise.all([db.from('hr_employees').select('leave_policy').eq('id', id).maybeSingle(), db.from('hr_leave_balances').select('eligible,brought_forward,credit,taken').eq('employee_id', id).eq('leave_group', 'AL').eq('year', year).maybeSingle()]);
      if (!balance) throw fail(404, `No ${year} Annual Leave balance for this staff member.`);
      const settings = await loadGcrSettings(db);
      const info = gcrFor(balance, person?.leave_policy || (Number(balance.eligible) >= 15 ? 'admin' : 'clinical'), settings);
      if (days > info.maxPay) throw fail(400, info.qualifies ? `At most ${info.maxPay} day(s) can be paid for this staff member.` : `This staff member used ${info.percentUsed}% of their eligible leave, below the ${settings.minUsedPercent}% needed, so no days can be paid.`);
      const { error } = await db.from('hr_gcr_choices').upsert({ employee_id: id, year, days_paid: days, decided_by: user.id, decided_at: now });
      if (error) throw error;
      return res.status(200).json({ success: true });
    }
    // Credit Annual Leave Report: every credit HR gave in a period, per person (from hr_leave_credits).
    if (req.method === 'GET' && action === 'leave_credit_report') {
      const iso = /^\d{4}-\d{2}-\d{2}$/;
      const year = new Date().getFullYear();
      const from = iso.test(String(req.query.from)) ? String(req.query.from) : `${year}-01-01`;
      const to = iso.test(String(req.query.to)) ? String(req.query.to) : `${year}-12-31`;
      const company = ['KJ', 'SK'].includes(String(req.query.company)) ? String(req.query.company) : '';
      const { data: credits, error } = await db.from('hr_leave_credits').select('id,employee_id,credit_date,days,remarks,source').gte('credit_date', from).lte('credit_date', to).order('credit_date').limit(5000);
      if (error) throw error;
      const ids = [...new Set((credits || []).map((row: any) => row.employee_id))];
      const { data: people } = ids.length ? await db.from('hr_employees').select('id,company,employee_code,full_name').in('id', ids) : { data: [] };
      const who = new Map((people || []).map((p: any) => [p.id, p]));
      const rows = (people || []).filter((p: any) => !company || p.company === company).sort((a: any, b: any) => a.company.localeCompare(b.company) || a.employee_code.localeCompare(b.employee_code)).map((p: any) => ({
        id: p.id, company: p.company, code: p.employee_code, name: p.full_name,
        credits: (credits || []).filter((row: any) => row.employee_id === p.id).map((row: any) => ({ id: row.id, date: row.credit_date, days: Number(row.days), remarks: row.remarks, source: row.source })),
      }));
      return res.status(200).json({ from, to, people: rows, known: who.size });
    }
    // Give Annual Leave credit to one or more staff: adds to this year's AL credit and records each grant.
    if (req.method === 'POST' && action === 'leave_credit_add') {
      const staffIds: string[] = Array.isArray(body.employeeIds) ? body.employeeIds.map((id: unknown) => text(id, 60)).filter(Boolean) : [];
      const days = Number(body.days), remarks = text(body.remarks, 160), date = text(body.date, 10);
      if (!staffIds.length) throw fail(400, 'Choose at least one staff member.');
      if (staffIds.length > 200) throw fail(400, 'Choose 200 staff or fewer at a time.');
      if (!Number.isFinite(days) || days <= 0 || days > 30 || Math.round(days * 100) !== days * 100) throw fail(400, 'Days must be a number from 0.01 to 30.');
      if (!remarks) throw fail(400, 'Write what the credit is for (for example CREDIT AL PH RAYA).');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail(400, 'Choose the credit date.');
      const year = Number(date.slice(0, 4));
      const { data: closed, error: closedError } = await db.from('hr_leave_year_closures').select('target_year').eq('target_year', year + 1).maybeSingle();
      if (closedError) throw closedError;
      if (closed) throw fail(409, `The ${year} leave year is closed and its balances are locked.`);
      const { data: balances, error: balanceError } = await db.from('hr_leave_balances').select('employee_id,eligible,brought_forward,credit,earn,forfeit').in('employee_id', staffIds).eq('leave_group', 'AL').eq('year', year);
      if (balanceError) throw balanceError;
      const have = new Map((balances || []).map((b: any) => [b.employee_id, b]));
      const missing = staffIds.filter((id) => !have.has(id));
      if (missing.length) {
        const { data: names } = await db.from('hr_employees').select('full_name').in('id', missing);
        throw fail(409, `No ${year} Annual Leave balance yet for: ${(names || []).map((n: any) => n.full_name).join(', ')}. Set up their balance first (HR > Leave > Staff leave).`);
      }
      for (const id of staffIds) {
        const b: any = have.get(id);
        await saveLeaveBalance(db, user.id, now, id, 'AL', year, { eligible: Number(b.eligible), brought_forward: Number(b.brought_forward), credit: Math.round((Number(b.credit) + days) * 100) / 100, earn: Number(b.earn), forfeit: Number(b.forfeit) });
      }
      const { error: insertError } = await db.from('hr_leave_credits').insert(staffIds.map((id) => ({ employee_id: id, leave_group: 'AL', credit_date: date, days, remarks, source: 'AraOffice', created_by: user.id })));
      if (insertError) throw insertError;
      return res.status(200).json({ success: true, count: staffIds.length });
    }
    // Undo a credit given by mistake: takes the days back off this year's AL credit and removes the record.
    if (req.method === 'POST' && action === 'leave_credit_delete') {
      const id = text(body.id, 60);
      const { data: row, error } = await db.from('hr_leave_credits').select('id,employee_id,credit_date,days').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!row) throw fail(404, 'Credit not found.');
      const year = Number(String(row.credit_date).slice(0, 4));
      const { data: closed } = await db.from('hr_leave_year_closures').select('target_year').eq('target_year', year + 1).maybeSingle();
      if (closed) throw fail(409, `The ${year} leave year is closed and its balances are locked.`);
      const { data: b } = await db.from('hr_leave_balances').select('eligible,brought_forward,credit,earn,forfeit').eq('employee_id', row.employee_id).eq('leave_group', 'AL').eq('year', year).maybeSingle();
      if (b) await saveLeaveBalance(db, user.id, now, row.employee_id, 'AL', year, { eligible: Number(b.eligible), brought_forward: Number(b.brought_forward), credit: Math.max(0, Math.round((Number(b.credit) - Number(row.days)) * 100) / 100), earn: Number(b.earn), forfeit: Number(b.forfeit) });
      const { error: deleteError } = await db.from('hr_leave_credits').delete().eq('id', id);
      if (deleteError) throw deleteError;
      return res.status(200).json({ success: true });
    }
    // Files for leave HR enters (a medical certificate received by WhatsApp, for example): uploaded first, then named in `leave_hr_apply`.
    if (req.method === 'POST' && action === 'leave_attachment_upload') {
      const { count } = await db.from('hr_leave_attachments').select('id', { count: 'exact', head: true }).eq('uploaded_by', 'hr').is('request_id', null);
      if ((count || 0) >= MAX_FILES * 3) throw fail(429, 'Too many files are waiting. Enter the leave first.');
      return res.status(200).json({ file: await storeLeaveFile(db, { employeeId: null, fileName: body.fileName, base64: body.data, uploadedBy: 'hr' }) });
    }
    // HR can open or download any leave file; the link works for one minute.
    if (req.method === 'GET' && action === 'leave_attachment_url') {
      const { data: file, error: fileError } = await db.from('hr_leave_attachments').select('*').eq('id', text(req.query.id, 60)).maybeSingle();
      if (fileError) throw fileError;
      if (!file) throw fail(404, 'File not found.');
      return res.status(200).json({ url: await leaveFileLink(db, file, String(req.query.download) === '1'), name: file.file_name });
    }
    // HR enters leave for one or many staff (as in Infotech's Leave Application on Behalf and Batch Leave). It is approved straight away and
    // comes off the balance. With `preview` nothing is saved: each person's days, balance and any problem are returned.
    if (req.method === 'POST' && action === 'leave_hr_apply') {
      const type = LEAVE_TYPES[text(body.type, 10)];
      if (!type) throw fail(400, 'Choose the type of leave.');
      const ids: string[] = [...new Set<string>((Array.isArray(body.employeeIds) ? body.employeeIds : []).map((id: unknown) => text(id, 60)).filter(Boolean))];
      if (!ids.length) throw fail(400, 'Choose at least one staff member.');
      if (ids.length > 100) throw fail(400, 'Choose 100 staff or fewer at a time.');
      const start = isoDate(body.start), end = isoDate(body.end || body.start);
      if (!start || !end) throw fail(400, 'Choose the dates.');
      if (end < start) throw fail(400, 'The end date is before the start date.');
      if (start.slice(0, 4) !== end.slice(0, 4)) throw fail(400, 'Enter separate leave for dates in different leave years.');
      if (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`) > 90 * 86400000) throw fail(400, 'That is more than 90 days. Split it into shorter leave.');
      const reason = text(body.reason, 500);
      if (reason.length < 2) throw fail(400, 'Write the reason for the leave.');
      const half = body.half === 'AM' || body.half === 'PM' ? body.half : null;
      if (half && !type.half) throw fail(400, `${type.name} cannot be taken as half a day.`);
      if (half && start !== end) throw fail(400, 'A half day is for a single date.');
      const year = Number(start.slice(0, 4));
      const { data: closed, error: closedError } = await db.from('hr_leave_year_closures').select('target_year').eq('target_year', year + 1).maybeSingle();
      if (closedError) throw closedError;
      if (closed) throw fail(409, `The ${year} leave year is closed. Its leave can no longer be changed.`);
      const preview = body.preview === true, allowOver = body.allowOver === true;
      const attachmentIds: string[] = [...new Set<string>((Array.isArray(body.attachmentIds) ? body.attachmentIds : []).map((id: unknown) => text(id, 60)).filter(Boolean))].slice(0, MAX_FILES);
      if (!preview && ATTACHMENT_REQUIRED_FOR.has(text(body.type, 10)) && !attachmentIds.length && body.skipAttachment !== true) throw fail(400, 'Medical leave needs the medical certificate attached. If HR is entering it without one, tick "No attachment".');
      let attachedFirst = false;
      const byName = user?.email || 'HR';
      const { data: people, error: peopleError } = await db.from('hr_employees').select('id,full_name,employee_code,company,status,join_date,work_days,holiday_group').in('id', ids);
      if (peopleError) throw peopleError;
      const results: { id: string; name: string; code: string; ok: boolean; days?: number; balanceAfter?: number | null; error?: string }[] = [];
      for (const id of ids) {
        const person: any = (people || []).find((p: any) => p.id === id);
        if (!person) { results.push({ id, name: 'Unknown staff', code: '', ok: false, error: 'Staff member not found.' }); continue; }
        const base = { id, name: person.full_name, code: person.employee_code };
        try {
          if (person.status !== 'Active') throw fail(400, 'This staff member is not active.');
          const workDays: number[] = Array.isArray(person.work_days) && person.work_days.length ? person.work_days : [1, 2, 3, 4, 5];
          const days = leaveDays(start, end, half, workDays, await rosterFor(db, id, start, end, person.holiday_group || ''));
          if (!days) throw fail(400, 'No working day in those dates (rest days and public holidays are not counted).');
          const { count: clash } = await db.from('hr_leave_requests').select('id', { count: 'exact', head: true }).eq('employee_id', id).in('status', ['pending', 'supervisor_approved', 'approved']).lte('start_date', end).gte('end_date', start);
          if (clash) throw fail(409, 'Already has leave on some of those dates.');
          const { data: rows, error: balanceError } = await db.from('hr_leave_balances').select('id,eligible,brought_forward,credit,earn,forfeit,taken,balance').eq('employee_id', id).eq('leave_group', type.group).eq('year', year).limit(1);
          if (balanceError) throw balanceError;
          const balance: any = rows?.[0];
          if (type.group === 'AL' || type.group === 'ML') {
            if (!balance) throw fail(400, `No ${year} ${type.group === 'AL' ? 'Annual' : 'Medical'} Leave balance yet. Set it up first (HR > Leave > Staff leave).`);
          }
          if (type.group === 'AL' && balance && !allowOver) {
            const allowance = yearAllowance(Number(balance.eligible), person.join_date || null, String(year));
            const cap = Number(balance.brought_forward) + Number(balance.credit) - Number(balance.forfeit) + Math.max(Number(balance.earn), allowance);
            const { data: waiting } = await db.from('hr_leave_requests').select('days').eq('employee_id', id).eq('leave_group', 'AL').in('status', ['pending', 'supervisor_approved']).gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`);
            const used = Number(balance.taken) + (waiting || []).reduce((sum: number, row: any) => sum + Number(row.days), 0);
            if (used + days > cap + 0.001) throw fail(400, `More than the ${year} annual leave (${Math.round(cap * 100) / 100} days, ${Math.round(used * 100) / 100} used or waiting). Tick "Allow over balance" to go ahead.`);
          }
          const after = balance ? Math.round((Number(balance.balance) - days) * 100) / 100 : null;
          if (!preview) {
            const now = new Date().toISOString();
            const { data: created, error: insertError } = await db.from('hr_leave_requests').insert({ employee_id: id, approver_id: null, backup_approver_id: null, final_approver_id: null, leave_type: text(body.type, 10), leave_group: type.group, start_date: start, end_date: end, half_day: half, days, reason, status: 'approved', decided_at: now, decision_note: `Entered by HR: ${byName}` }).select('id').single();
            if (insertError) throw insertError;
            if (balance) await db.from('hr_leave_balances').update({ taken: Number(balance.taken) + days, balance: Number(balance.balance) - days, updated_at: now }).eq('id', balance.id);
            if (attachmentIds.length) { await attachLeaveFiles(db, created.id, id, attachmentIds, !attachedFirst, 'hr'); attachedFirst = true; }
            await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { leave_request: [null, `${text(body.type, 10)} ${start}${end !== start ? ` to ${end}` : ''}, ${days} day(s), approved, entered by HR (${byName})`], request_id: [null, created.id] }, changed_by: user.id });
          }
          results.push({ ...base, ok: true, days, balanceAfter: after });
        } catch (cause: any) { results.push({ ...base, ok: false, error: cause?.message || 'Unable to enter this leave.' }); }
      }
      return res.status(200).json({ preview, results, saved: preview ? 0 : results.filter((r) => r.ok).length });
    }
    // Leave Consolidate Report (Current Year): one row per person with the Annual and Medical Leave figures. HR uses the AL balance for GCR.
    if (req.method === 'GET' && action === 'leave_consolidate') {
      const year = /^\d{4}$/.test(String(req.query.year)) ? Number(req.query.year) : Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4));
      const company = ['KJ', 'SK'].includes(String(req.query.company)) ? String(req.query.company) : '';
      let peopleQuery = db.from('hr_employees').select('id,company,employee_code,full_name,join_date,designation').eq('status', 'Active').order('company').order('employee_code').limit(1000);
      if (company) peopleQuery = peopleQuery.eq('company', company);
      const { data: people, error } = await peopleQuery;
      if (error) throw error;
      const ids = (people || []).map((p: any) => p.id);
      const { data: balances, error: balanceError } = ids.length ? await db.from('hr_leave_balances').select('employee_id,leave_group,eligible,brought_forward,bf_expiry,forfeit,credit,earn,total,taken,balance').in('employee_id', ids).in('leave_group', ['AL', 'ML']).eq('year', year).limit(4000) : { data: [], error: null };
      if (balanceError) throw balanceError;
      const num = (v: any) => Math.round(Number(v || 0) * 100) / 100;
      const rows = (people || []).map((p: any) => {
        const al: any = (balances || []).find((b: any) => b.employee_id === p.id && b.leave_group === 'AL');
        const ml: any = (balances || []).find((b: any) => b.employee_id === p.id && b.leave_group === 'ML');
        return { id: p.id, company: p.company, code: p.employee_code, name: p.full_name, joinDate: p.join_date || '', designation: p.designation || '',
          al: al ? { eligible: num(al.eligible), broughtForward: num(al.brought_forward), forfeit: num(al.forfeit), credit: num(al.credit), earn: num(al.earn), total: num(al.total), taken: num(al.taken), balance: num(al.balance), bfExpiry: al.bf_expiry || '' } : null,
          ml: ml ? { eligible: num(ml.eligible), earn: num(ml.earn), taken: num(ml.taken), balance: num(ml.balance) } : null };
      });
      return res.status(200).json({ year, rows });
    }
    // Leave History Report (as in Infotech): approved leave per person for a period, grouped by leave type, with the AL and ML balance box.
    if (req.method === 'GET' && action === 'leave_history_report') {
      const iso = /^\d{4}-\d{2}-\d{2}$/;
      const from = iso.test(String(req.query.from)) ? String(req.query.from) : `${new Date().getFullYear()}-01-01`;
      const to = iso.test(String(req.query.to)) ? String(req.query.to) : `${new Date().getFullYear()}-12-31`;
      const company = ['KJ', 'SK'].includes(String(req.query.company)) ? String(req.query.company) : '';
      const one = text(req.query.id, 60);
      let peopleQuery = db.from('hr_employees').select('id,company,employee_code,full_name,join_date,status').order('company').order('employee_code').limit(1000);
      if (company) peopleQuery = peopleQuery.eq('company', company);
      if (one) peopleQuery = peopleQuery.eq('id', one); else peopleQuery = peopleQuery.eq('status', 'Active');
      const { data: people, error } = await peopleQuery;
      if (error) throw error;
      const ids = (people || []).map((p: any) => p.id);
      if (!ids.length) return res.status(200).json({ from, to, people: [] });
      const year = Number(to.slice(0, 4));
      const [{ data: requests, error: requestError }, { data: balances, error: balanceError }] = await Promise.all([
        db.from('hr_leave_requests').select('employee_id,leave_type,start_date,end_date,half_day,days,reason').in('employee_id', ids).eq('status', 'approved').lte('start_date', to).gte('end_date', from).order('start_date').limit(5000),
        db.from('hr_leave_balances').select('employee_id,leave_group,year,eligible,brought_forward,credit,earn,forfeit,total,taken,balance,advance').in('employee_id', ids).in('leave_group', ['AL', 'ML']).eq('year', year).limit(4000),
      ]);
      if (requestError || balanceError) throw requestError || balanceError;
      const num = (v: any) => Math.round(Number(v || 0) * 100) / 100;
      const out = (people || []).map((p: any) => {
        const mine = (requests || []).filter((r: any) => r.employee_id === p.id).map((r: any) => ({ type: r.leave_type, start: r.start_date, end: r.end_date, half: r.half_day, days: num(r.days), reason: r.reason || '' }));
        const bal = (group: string) => { const b: any = (balances || []).find((x: any) => x.employee_id === p.id && x.leave_group === group); return b ? { eligible: num(b.eligible), broughtForward: num(b.brought_forward), credit: num(b.credit), earn: num(b.earn), forfeit: num(b.forfeit), total: num(b.total), taken: num(b.taken), balance: num(b.balance) } : null; };
        return { id: p.id, company: p.company, code: p.employee_code, name: p.full_name, joinDate: p.join_date || '', requests: mine, al: bal('AL'), ml: bal('ML') };
      });
      // Everyone with leave in the period or a balance on record; the rest have nothing to show.
      return res.status(200).json({ from, to, people: out.filter((p: any) => p.requests.length || p.al || p.ml) });
    }
    if (req.method === 'GET' && action === 'leave_person') {
      const id = text(req.query.id, 60);
      const { data: person, error } = await db.from('hr_employees').select('id,company,employee_code,full_name,designation,status').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!person) throw fail(404, 'Staff member not found.');
      const [{ data: balances }, { data: requests }] = await Promise.all([
        db.from('hr_leave_balances').select('leave_group,year,eligible,brought_forward,credit,earn,forfeit,total,taken,balance,as_of,source').eq('employee_id', id).limit(200),
        db.from('hr_leave_requests').select('id,leave_type,start_date,end_date,half_day,days,reason,status,supervisor_note,decision_note,created_at').eq('employee_id', id).order('start_date', { ascending: false }).limit(300),
      ]);
      const rank = ['AL', 'ML', 'HOSP', 'MARRG', 'HAJUMR', 'UL'];
      // The newest year of each leave group.
      const newest = new Map<string, any>(); for (const b of balances || []) { const have = newest.get(b.leave_group); if (!have || b.year > have.year) newest.set(b.leave_group, b); }
      return res.status(200).json({
        person: { id: person.id, company: person.company, code: person.employee_code, name: person.full_name, designation: person.designation, status: person.status },
        balances: [...newest.values()].sort((a: any, b: any) => (rank.indexOf(a.leave_group) + 1 || 99) - (rank.indexOf(b.leave_group) + 1 || 99)).map((b: any) => ({ group: b.leave_group, year: b.year, eligible: Number(b.eligible), broughtForward: Number(b.brought_forward), credit: Number(b.credit), earn: Number(b.earn), forfeit: Number(b.forfeit), total: Number(b.total), taken: Number(b.taken), balance: Number(b.balance), asOf: b.as_of, source: b.source })),
        requests: (requests || []).map((r: any) => ({ id: r.id, type: r.leave_type, start: r.start_date, end: r.end_date, half: r.half_day, days: Number(r.days), reason: r.reason, status: r.status, supervisorNote: r.supervisor_note || '', note: r.decision_note || '' })),
      });
    }
    // HR corrects or sets up a balance.
    if (req.method === 'POST' && action === 'leave_balance_save') {
      const id = text(body.id, 60), group = text(body.group, 12).toUpperCase();
      if (!LEAVE_GROUPS.includes(group)) throw fail(400, 'Choose a leave group.');
      const year = Number.isInteger(Number(body.year)) ? Number(body.year) : 0;
      if (year > 0) {
        const { data: closed, error: closedError } = await db.from('hr_leave_year_closures').select('target_year').eq('target_year', year + 1).maybeSingle();
        if (closedError) throw closedError;
        if (closed) throw fail(409, `The ${year} leave year is closed and its balances are locked.`);
      }
      const num = (value: unknown, label: string) => { const n = Number(value ?? 0); if (!Number.isFinite(n) || n < 0 || n > 366 || Math.round(n * 100) !== n * 100) throw fail(400, `${label} must be a number from 0 to 366.`); return n; };
      const result = await saveLeaveBalance(db, user.id, now, id, group, year, { eligible: num(body.eligible, 'Eligible'), brought_forward: num(body.broughtForward, 'Brought forward'), credit: num(body.credit, 'Credit'), earn: num(body.earn, 'Earned'), forfeit: num(body.forfeit, 'Forfeited') });
      return res.status(200).json({ success: true, ...result });
    }

    if (req.method === 'GET' && action === 'leave_year_end_preview') {
      await ensureLeaveSetup(db, user.id, now);
      const currentYear = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4));
      const [{ data: currentClosure, error: currentClosureError }, { data: latestBalance, error: latestError }] = await Promise.all([
        db.from('hr_leave_year_closures').select('target_year').eq('target_year', currentYear).maybeSingle(),
        db.from('hr_leave_balances').select('year').in('leave_group', ['AL', 'ML']).order('year', { ascending: false }).limit(1),
      ]);
      if (currentClosureError || latestError) throw currentClosureError || latestError;
      const month = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(5, 7));
      const targetYear = currentClosure && month < 10 ? currentYear : Math.max(currentYear + (month >= 10 ? 1 : 0), Number(latestBalance?.[0]?.year || currentYear - 1) + 1);
      if (/^\d{4}$/.test(String(req.query.year)) && Number(req.query.year) !== targetYear) throw fail(400, 'Year End can only preview the next open leave cycle.');
      const [{ data: people, error }, { data: balances, error: balanceError }, { data: pending, error: pendingError }, { data: closure, error: closureError }] = await Promise.all([
        db.from('hr_employees').select('id,company,employee_code,full_name,join_date,leave_policy,status,department,designation,employment_type').eq('status', 'Active').order('company').order('full_name').limit(1000),
        db.from('hr_leave_balances').select('employee_id,leave_group,year,eligible,brought_forward,bf_expiry,balance,credit,taken').eq('year', targetYear - 1).in('leave_group', ['AL', 'ML']).limit(4000),
        db.from('hr_leave_requests').select('id,employee_id,leave_type,start_date,end_date,status').in('status', ['pending', 'supervisor_approved']).lte('start_date', `${targetYear - 1}-12-31`).gte('end_date', `${targetYear - 1}-01-01`).limit(3000),
        db.from('hr_leave_year_closures').select('target_year,source_year,bf_expiry,staff_count,processed_at').eq('target_year', targetYear).maybeSingle(),
      ]);
      if (error || balanceError || pendingError || closureError) throw error || balanceError || pendingError || closureError;
      const gcrSettings = await loadGcrSettings(db), gcrChoices = await loadGcrChoices(db, targetYear - 1), carryOverrides = await loadCarryOverrides(db, targetYear - 1);
      const balanceOf = (id: string, group: string) => (balances || []).find((row: any) => row.employee_id === id && row.leave_group === group);
      const rows = (people || []).map((person: any) => {
        const oldAL = balanceOf(person.id, 'AL'), oldML = balanceOf(person.id, 'ML');
        const track = person.leave_policy || (oldAL ? (Number(oldAL.eligible) >= 15 ? 'admin' : 'clinical') : guessLeaveTrack(person));
        const policy = person.join_date ? policyFor(track, person.join_date, targetYear) : null;
        return { employeeId: person.id, company: person.company, code: person.employee_code, name: person.full_name, joinDate: person.join_date, track, missingPolicy: !person.leave_policy,
          annual: { eligible: policy?.al ?? Number(oldAL?.eligible || 0), broughtForward: oldAL ? (carryOverrides.get(person.id)?.days ?? gcrFor(oldAL, track, gcrSettings, gcrChoices.get(person.id) || 0).carry) : 0, calculatedCarry: oldAL ? gcrFor(oldAL, track, gcrSettings, gcrChoices.get(person.id) || 0).carry : 0, carryOverride: carryOverrides.get(person.id) ?? null, sourceBalance: oldAL ? Number(oldAL.balance) : null, gcr: oldAL ? gcrFor(oldAL, track, gcrSettings, gcrChoices.get(person.id) || 0) : null },
          medical: { eligible: policy?.ml ?? Number(oldML?.eligible || 0), broughtForward: 0, sourceBalance: oldML ? Number(oldML.balance) : null },
          missingJoinDate: !person.join_date, missingAnnual: !oldAL, missingMedical: !oldML };
      });
      return res.status(200).json({ targetYear, sourceYear: targetYear - 1, rows, pending: pending || [], closure: closure || null });
    }

    if (req.method === 'POST' && action === 'leave_year_end_process') {
      const targetYear = Number(body.targetYear), expiry = text(body.bfExpiry, 10);
      if (!Number.isInteger(targetYear) || !isDate(expiry)) throw fail(400, 'Choose the new leave year and BF expiry date.');
      const currentYear = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4));
      if (targetYear !== currentYear) throw fail(409, `Year End for ${targetYear} can only be processed from 1 January ${targetYear}.`);
      const { data: people, error } = await db.from('hr_employees').select('id,full_name,join_date,leave_policy,department,designation,employment_type').eq('status', 'Active').limit(1000);
      if (error) throw error;
      const { data: old, error: oldError } = await db.from('hr_leave_balances').select('employee_id,leave_group,year,eligible,brought_forward,bf_expiry,balance,credit,taken').eq('year', targetYear - 1).in('leave_group', ['AL', 'ML']).limit(4000);
      if (oldError) throw oldError;
      const gcrSettings = await loadGcrSettings(db), gcrChoices = await loadGcrChoices(db, targetYear - 1), carryOverrides = await loadCarryOverrides(db, targetYear - 1);
      const balances = (people || []).map((person: any) => {
        const annual = (old || []).find((row: any) => row.employee_id === person.id && row.leave_group === 'AL');
        const medical = (old || []).find((row: any) => row.employee_id === person.id && row.leave_group === 'ML');
        const track = person.leave_policy || (annual && Number(annual.eligible) >= 15 ? 'admin' : 'clinical');
        const policy = person.join_date ? policyFor(track, person.join_date, targetYear) : null;
        return { employeeId: person.id, groups: [
          { group: 'AL', eligible: policy?.al ?? Number(annual?.eligible || 0), broughtForward: annual ? (carryOverrides.get(person.id)?.days ?? gcrFor(annual, track, gcrSettings, gcrChoices.get(person.id) || 0).carry) : 0 },
          { group: 'ML', eligible: policy?.ml ?? Number(medical?.eligible || 0), broughtForward: 0 },
        ] };
      });
      if ((people || []).some((person: any) => !person.join_date)) throw fail(400, 'Add a join date to every active staff profile before processing Year End.');
      const missingBalance = (people || []).filter((person: any) => !old?.some((row: any) => row.employee_id === person.id && row.leave_group === 'AL') || !old?.some((row: any) => row.employee_id === person.id && row.leave_group === 'ML'));
      if (missingBalance.length) throw fail(400, `Set up previous-year AL and ML balances for every active staff member before Year End. Missing balance for: ${missingBalance.map((person: any) => person.full_name).join(', ')}.`);
      // Staff whose category was never saved get it now, from their current entitlement and job (HR can still change it later).
      for (const person of people || []) {
        if (person.leave_policy) continue;
        const annual = (old || []).find((row: any) => row.employee_id === person.id && row.leave_group === 'AL');
        const track = annual ? (Number(annual.eligible) >= 15 ? 'admin' : 'clinical') : guessLeaveTrack(person);
        const { error: saveError } = await db.from('hr_employees').update({ leave_policy: track, updated_at: now, updated_by: user.id }).eq('id', person.id);
        if (saveError) throw saveError;
      }
      const { data, error: processError } = await db.rpc('hr_process_leave_year_end', { p_target_year: targetYear, p_bf_expiry: expiry, p_processed_by: user.id, p_balances: balances });
      if (processError) throw fail(409, processError.message || 'Unable to process leave year end.');
      return res.status(200).json(data || { success: true, targetYear });
    }

    // Company leave policy: what each active staff member should have by their category and years of service, next to
    // what they have now. Nothing changes until HR applies it.
    if (req.method === 'GET' && action === 'leave_policy') {
      const [{ data: people, error }, { data: balances }] = await Promise.all([
        db.from('hr_employees').select('id,company,employee_code,full_name,designation,department,employment_type,join_date,leave_policy').eq('status', 'Active').order('company').order('full_name').limit(500),
        db.from('hr_leave_balances').select('employee_id,leave_group,year,eligible').in('leave_group', ['AL', 'ML', 'HOSP']).limit(3000),
      ]);
      if (error) throw error;
      const current = (employee: string, group: string) => (balances || []).filter((b: any) => b.employee_id === employee && b.leave_group === group).sort((a: any, b: any) => b.year - a.year)[0];
      return res.status(200).json({ staff: (people || []).map((p: any) => {
        const al = current(p.id, 'AL'), ml = current(p.id, 'ML'), hosp = current(p.id, 'HOSP');
        const track = p.leave_policy || (al ? (Number(al.eligible) >= 15 ? 'admin' : 'clinical') : guessLeaveTrack(p));
        const years = p.join_date ? (Date.now() - Date.parse(`${p.join_date}T00:00:00Z`)) / (365.25 * 86400000) : null;
        const policy = p.join_date ? policyFor(track, p.join_date) : null;
        return { id: p.id, company: p.company, code: p.employee_code, name: p.full_name, designation: p.designation, joinDate: p.join_date, years, track, trackSet: Boolean(p.leave_policy), policy, al: al ? Number(al.eligible) : null, ml: ml ? Number(ml.eligible) : null, hosp: hosp ? Number(hosp.eligible) : null };
      }) });
    }
    // Applies the policy to the people HR chose: their entitlement for annual, sick and hospital leave becomes the
    // policy figure (brought forward, credit, earned so far and forfeited stay as they are). A balance that does not exist
    // yet is created, so this is also how a new staff member gets theirs.
    if (req.method === 'POST' && action === 'leave_policy_apply') {
      const currentYear = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4));
      const { data: currentClosed, error: closureError } = await db.from('hr_leave_year_closures').select('target_year').eq('target_year', currentYear + 1).maybeSingle();
      if (closureError) throw closureError;
      if (currentClosed) throw fail(409, `The ${currentYear} leave year is closed; its entitlements cannot be changed.`);
      const items: { id: string; track: string }[] = (Array.isArray(body.items) ? body.items : []).slice(0, 200).map((item: any) => ({ id: text(item?.id, 60), track: text(item?.track, 10) })).filter((item: any) => item.id && ['admin', 'clinical', 'parttime'].includes(item.track));
      if (!items.length) throw fail(400, 'Choose the staff.');
      const { data: people, error } = await db.from('hr_employees').select('id,join_date').in('id', items.map((item) => item.id));
      if (error) throw error;
      const joined = new Map((people || []).map((p: any) => [p.id, p.join_date]));
      let changed = 0; const skipped: string[] = [];
      for (const item of items) {
        const join = joined.get(item.id);
        if (!join) { skipped.push(item.id); continue; }
        changed += await applyLeavePolicy(db, user.id, now, item.id, item.track, join);
      }
      return res.status(200).json({ success: true, changed, skipped: skipped.length });
    }

    // Every leave request made from Individual Sign In, for HR to follow.
    if (req.method === 'GET' && action === 'leave_requests') {
      const year = /^\d{4}$/.test(String(req.query.year)) ? String(req.query.year) : String(new Date().getFullYear());
      const { data, error } = await db.from('hr_leave_requests').select('*').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`).order('start_date', { ascending: false }).limit(1000);
      if (error) throw error;
      const ids = [...new Set((data || []).flatMap((r: any) => [r.employee_id, r.approver_id, r.backup_approver_id, r.final_approver_id, r.decided_by, r.supervisor_decided_by]).filter(Boolean))];
      const { data: people } = ids.length ? await db.from('hr_employees').select('id,company,employee_code,full_name').in('id', ids) : { data: [] };
      const who = new Map((people || []).map((p: any) => [p.id, p]));
      const name = (id: string | null) => (id && who.get(id)?.full_name) || '';
      const files = await attachmentsFor(db, (data || []).map((r: any) => r.id));
      return res.status(200).json({ year, requests: (data || []).map((r: any) => ({ id: r.id, company: who.get(r.employee_id)?.company || '', code: who.get(r.employee_id)?.employee_code || '', applicant: name(r.employee_id), type: r.leave_type, group: r.leave_group, start: r.start_date, end: r.end_date, half: r.half_day, days: Number(r.days), reason: r.reason, status: r.status, supervisor: name(r.approver_id), backupApprover: name(r.backup_approver_id), finalApprover: name(r.final_approver_id), supervisorBy: name(r.supervisor_decided_by), supervisorNote: r.supervisor_note || '', decidedBy: name(r.decided_by), note: r.decision_note || '', createdAt: r.created_at, decidedAt: r.decided_at, attachments: files.get(r.id) || [] })) });
    }

    // Duty roster: one row per person and date. `roster` reads a month; `roster_import` replaces the dates it
    // is given for the people it names (rows: { code, company, date, shift }).
    if (req.method === 'GET' && action === 'roster') {
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : '';
      if (!month) throw fail(400, 'Choose a month.');
      const start = `${month}-01`, end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
      const { data, error } = await db.from('hr_roster').select('employee_id,work_date,shift,works,note').gte('work_date', start).lte('work_date', end).limit(5000);
      if (error) throw error;
      const ids = [...new Set((data || []).map((row: any) => row.employee_id))];
      const { data: people } = ids.length ? await db.from('hr_employees').select('id,company,employee_code,full_name,designation').in('id', ids) : { data: [] };
      return res.status(200).json({ month, people: (people || []).map((p: any) => ({ id: p.id, company: p.company, code: p.employee_code, name: p.full_name, designation: p.designation || '' })), days: (data || []).map((row: any) => ({ id: row.employee_id, date: row.work_date, shift: row.shift, works: row.works, note: row.note })) });
    }
    if (req.method === 'POST' && action === 'roster_import') {
      const rows: any[] = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
      if (!rows.length) throw fail(400, 'There are no roster rows.');
      const { data: people, error: peopleError } = await db.from('hr_employees').select('id,company,employee_code,designation');
      if (peopleError) throw peopleError;
      const byCode = new Map((people || []).map((p: any) => [`${p.company}|${String(p.employee_code).toUpperCase()}`, p.id]));
      const doctors = new Set((people || []).filter((p: any) => /\b(DR|DOCTOR)\b/i.test(p.designation || '')).map((p: any) => p.id));
      // SK wrote its clinic assistant shifts differently from KJ; the KJ names are saved (doctors keep AM, PM and OH).
      const SK_CODES: Record<string, string> = { 'AM': 'AM-9', 'AM 9': 'AM-12', 'AM 5': 'AM-5' };
      const NOT_WORKING = new Set(['OFF', 'OFF 1ST', 'OFF 2ND', 'REST', 'NA', 'PH', 'RESIGN', 'OD', 'RD', 'AL', 'UPL', 'MC', 'ML', 'EL', '']);
      const LEAVE = new Set(['AL', 'UPL', 'MC', 'ML', 'EL']);
      const unknown = new Set<string>(); const out: any[] = [];
      for (const row of rows) {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) ? String(row.date) : '';
        const id = byCode.get(`${text(row.company, 4).toUpperCase()}|${text(row.code, 20).toUpperCase()}`);
        if (!date) continue;
        if (!id) { unknown.add(`${row.company}|${row.code}`); continue; }
        let shift = text(row.shift, 30).toUpperCase().replace(/\s+/g, ' ');
        if (text(row.company, 4).toUpperCase() === 'SK' && !doctors.has(id)) shift = SK_CODES[shift] || shift;
        if (!shift) continue; // a blank cell means no schedule, so the weekly working days apply
        out.push({ employee_id: id, work_date: date, shift, works: !NOT_WORKING.has(shift), note: LEAVE.has(shift) ? shift : '' });
      }
      if (unknown.size) throw fail(400, `These staff codes are not in HR: ${[...unknown].join(', ')}.`);
      if (!out.length) throw fail(400, 'There are no valid roster rows.');
      const { error } = await db.from('hr_roster').upsert(out, { onConflict: 'employee_id,work_date' });
      if (error) throw error;
      return res.status(200).json({ success: true, saved: out.length });
    }

    // Creates the staff member's individual sign-in from their HR profile and links it: they sign in with the short name given here, their
    // staff code and the last 4 digits of their IC (then choose a password). If a sign-in with this staff code already exists but is not
    // linked to a profile yet, it is linked instead of creating a second one.
    if (req.method === 'POST' && action === 'create_sign_in') {
      const id = text(body.id, 60), name = text(body.name, 60);
      if (name.length < 2) throw fail(400, 'Enter the name they will sign in with, for example their first name.');
      const { data: person, error } = await db.from('hr_employees').select('id,company,employee_code,full_name,ic_no,assessment_staff_id,status').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!person) throw fail(404, 'Profile not found.');
      if (person.assessment_staff_id) throw fail(409, 'This staff member already has an individual sign-in.');
      const code = String(person.employee_code || '').trim().toUpperCase();
      if (!code) throw fail(400, 'The profile has no staff code yet.');
      const { data: existing } = await db.from('assessment_staff').select('id').eq('staff_code', code).maybeSingle();
      let staffId = existing?.id as string | undefined;
      if (existing) {
        const { data: taken } = await db.from('hr_employees').select('id').eq('assessment_staff_id', existing.id).maybeSingle();
        if (taken) throw fail(409, 'That staff code already belongs to another profile.');
      } else {
        const last4 = String(person.ic_no || '').replace(/\D/g, '').slice(-4);
        if (last4.length !== 4) throw fail(400, 'Add the IC number to the profile first: the last 4 digits are their first password.');
        const { data: created, error: createError } = await db.from('assessment_staff').insert({ name, staff_code: code, branch: person.company, active: person.status === 'Active', can_preview: false, failed_logins: 0, ic4_hash: hashIc4(last4) }).select('id').single();
        if (createError) throw createError;
        staffId = created.id;
      }
      const { error: linkError } = await db.from('hr_employees').update({ assessment_staff_id: staffId, updated_at: now, updated_by: user.id }).eq('id', id);
      if (linkError) throw linkError;
      await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { individual_sign_in: [null, existing ? 'linked to the existing sign-in' : `created (sign in as "${name}")`] }, changed_by: user.id });
      return res.status(200).json({ success: true, linkedExisting: Boolean(existing) });
    }

    // Clears the staff member's individual-sign-in password: they sign in with the last 4 IC digits
    // again and choose a new one.
    if (req.method === 'POST' && action === 'reset_sign_in') {
      const id = text(body.id, 60);
      const { data: person, error: personError } = await db.from('hr_employees').select('id,assessment_staff_id').eq('id', id).maybeSingle();
      if (personError) throw personError;
      if (!person?.assessment_staff_id) throw fail(404, 'This staff member has no individual sign-in yet.');
      const { error } = await db.from('assessment_staff').update({ password_hash: null, password_set_at: null, failed_logins: 0, locked_until: null, updated_at: now }).eq('id', person.assessment_staff_id);
      if (error) throw error;
      await db.from('assessment_sessions').delete().eq('staff_id', person.assessment_staff_id);
      await db.from('hr_audit').insert({ employee_id: person.id, action: 'sign_in_reset', changes: {}, changed_by: user.id });
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && action === 'save_employee') {
      const row = encode(body.employee || {});
      if (!row.company) throw fail(400, 'Choose the company (KJ or SK).');
      const id = text(body.employee?.id, 60);
      if (id) {
        const { data: before, error: readError } = await db.from('hr_employees').select('*').eq('id', id).maybeSingle();
        if (readError) throw readError;
        if (!before) throw fail(404, 'Profile not found.');
        // Only fields that really changed go in the audit log (salary comes back from the database as text).
        const same = (key: string, value: unknown) => key === 'basic_salary' ? Number((before as any)[key]) === value : JSON.stringify((before as any)[key] ?? null) === JSON.stringify(value ?? null);
        const changes = Object.fromEntries(Object.entries(row).filter(([key, value]) => !same(key, value)).map(([key, value]) => [key, [(before as any)[key] ?? null, value]]));
        const { data, error } = await db.from('hr_employees').update({ ...row, updated_at: now, updated_by: user.id }).eq('id', id).select('*').single();
        if (error?.code === '23505') throw fail(409, `Employee code ${row.employee_code} is already used in ${row.company}.`);
        if (error) throw error;
        if (Object.keys(changes).length) await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes, changed_by: user.id });
        return res.status(200).json({ employee: decode(data) });
      }
      const { data, error } = await db.from('hr_employees').insert({ ...row, updated_by: user.id }).select('*').single();
      if (error?.code === '23505') throw fail(409, `Employee code ${row.employee_code} is already used in ${row.company}.`);
      if (error) throw error;
      await db.from('hr_audit').insert({ employee_id: data.id, action: 'create', changes: {}, changed_by: user.id });
      // A new staff member gets their leave straight away, as the company policy says. HR can still change the category later.
      let leaveSetup: { track: string; changed: number } | { error: string } | null = null;
      if (data.join_date && data.status === 'Active') {
        try {
          const track = guessLeaveTrack(data);
          const currentYear = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4));
          const { data: closedYear } = await db.from('hr_leave_year_closures').select('target_year').eq('target_year', currentYear + 1).maybeSingle();
          if (closedYear) throw new Error(`The ${currentYear} leave year is closed.`);
          leaveSetup = { track, changed: await applyLeavePolicy(db, user.id, now, data.id, track, data.join_date) };
        } catch (cause) { leaveSetup = { error: cause instanceof Error ? cause.message : 'Unable to set up leave.' }; }
      }
      return res.status(200).json({ employee: decode(data), leaveSetup });
    }

    throw fail(405, 'Method not allowed.');
  } catch (error: any) {
    // Before the migration has been run the tables do not exist yet.
    if (['PGRST205', '42P01'].includes(error?.code)) return res.status(503).json({ error: 'Staff profiles are not set up yet: run supabase/migrations/202610160002_hr_employees.sql in Supabase.' });
    return res.status(error.status || 400).json({ error: error.message || 'Unable to complete this request.' });
  }
}
