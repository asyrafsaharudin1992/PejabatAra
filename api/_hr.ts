import { randomBytes, scryptSync } from 'node:crypto';
import { officeAccess } from './_office-db.js';
import { LEAVE_TYPES, isoDate, leaveDays, rosterFor, yearAllowance } from './_assessment.js';
import { attendanceHrAction } from './_attendance.js';
import { hrCalendarAction } from './_hr-calendar.js';
import { newCode } from '../src/lib/shiftCodes.js';
import { calculatePayslip, NO_INPUTS, type PayInputs } from '../src/lib/payrollRun.js';
import { epcbFile, epfFormA, socsoFile } from '../src/lib/payrollFiles.js';
import { patchFrom, REQUEST_SELECT } from './_profile-requests.js';
import { addDocument, documentLink, listDocuments, ownedDocument, removeDocument } from './_documents.js';
import { ATTACHMENT_REQUIRED_FOR, MAX_FILES, attachLeaveFiles, attachmentsFor, leaveFileLink, removeLeaveFiles, storeLeaveFile } from './_leave-files.js';

// Office HR. Served from /api/status?resource=hr because the Vercel Hobby plan
// allows only 12 functions. Accounts with HR office access (and System Admin) only.
// Staff profiles hold personal and pay details, so the list sends only what the
// directory shows; the full profile is read one person at a time, and every change
// is written to hr_audit.
// The payroll settings kept per person (see 202611020003_payroll_settings.sql).
const PAYROLL_KEYS = ['epfRate', 'socsoCategory', 'socsoEmployed', 'eis', 'hrdf', 'skbbk', 'taxResident', 'taxType', 'pcbApplied', 'payGroup', 'otType', 'probationMonths', 'flexi', 'restDay', 'defaultShift', 'epfName', 'lhdnEmployeeCode'];
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
// Compares values as the database holds them: the order of an object's keys does not count (the database may reorder them).
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item as object).sort(([a], [b]) => a.localeCompare(b))) : item);
const pick = (value: unknown, allowed: string[], fallback: string) => allowed.includes(String(value)) ? String(value) : fallback;

const SUMMARY = 'id,company,employee_code,full_name,branch,department,designation,employment_type,status,resign_date,join_date,assessment_staff_id';

const decode = (row: any) => ({
  id: row.id, company: row.company, employeeCode: row.employee_code, fullName: row.full_name, assessmentStaffId: row.assessment_staff_id,
  icNo: row.ic_no, passportNo: row.passport_no, nationality: row.nationality, gender: row.gender, dateOfBirth: row.date_of_birth, religion: row.religion,
  maritalStatus: row.marital_status, spouseWorking: row.spouse_working, children: row.children || [], phone: row.phone, email: row.email, address: row.address,
  emergencyName: row.emergency_name, emergencyRelation: row.emergency_relation, emergencyPhone: row.emergency_phone,
  race: row.race || '', foreignIdNo: row.foreign_id_no || '', addressLine1: row.address_line1 || '', addressLine2: row.address_line2 || '', postcode: row.postcode || '', city: row.city || '', state: row.state || '',
  spouseName: row.spouse_name || '', spouseIc: row.spouse_ic || '', spouseEmployer: row.spouse_employer || '', spousePhone: row.spouse_phone || '', education: row.education || [],
  branch: row.branch, department: row.department, designation: row.designation, employmentType: row.employment_type,
  joinDate: row.join_date, confirmDate: row.confirm_date, resignDate: row.resign_date, status: row.status, leaveGroup: row.leave_group,
  payroll: row.payroll_settings || {}, basicSalary: Number(row.basic_salary), fixedAllowances: row.fixed_allowances || [], bankName: row.bank_name, bankAccount: row.bank_account,
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
  const education = (Array.isArray(body.education) ? body.education : []).slice(0, 12).map((item: any) => ({ level: text(item?.level, 60), institution: text(item?.institution, 120), course: text(item?.course, 120), year: text(item?.year, 4) })).filter((item: any) => item.level || item.institution || item.course);
  const address = { address_line1: text(body.addressLine1, 160), address_line2: text(body.addressLine2, 160), postcode: text(body.postcode, 10), city: text(body.city, 60), state: text(body.state, 60) };
  return {
    company: pick(body.company, ['KJ', 'SK'], ''), employee_code: employeeCode, full_name: fullName,
    assessment_staff_id: text(body.assessmentStaffId, 60) || null,
    ic_no: text(body.icNo, 20), passport_no: text(body.passportNo, 30), nationality: text(body.nationality, 40) || 'Malaysian',
    gender: pick(body.gender, ['', 'Male', 'Female'], ''), date_of_birth: isDate(body.dateOfBirth) ? body.dateOfBirth : null, religion: text(body.religion, 40),
    marital_status: pick(body.maritalStatus, ['', 'Single', 'Married', 'Divorced', 'Widowed'], ''), spouse_working: typeof body.spouseWorking === 'boolean' ? body.spouseWorking : null,
    children, phone: text(body.phone, 30), email: text(body.email, 120),
    // The one-line address is kept in step with the parts, for anything that still reads it.
    ...address, address: [address.address_line1, address.address_line2, [address.postcode, address.city].filter(Boolean).join(' '), address.state].map((part) => part.replace(/[,\s]+$/, '')).filter(Boolean).join(', '),
    race: text(body.race, 40), foreign_id_no: text(body.foreignIdNo, 30),
    spouse_name: text(body.spouseName, 120), spouse_ic: text(body.spouseIc, 20), spouse_employer: text(body.spouseEmployer, 120), spouse_phone: text(body.spousePhone, 30), education,
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


const digits9 = (value: unknown) => String(value ?? '').replace(/\D/g, '').padStart(9, '0');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// The active staff for one pay month with what the pay needs: salary, allowances, family, payroll settings and the year-to-date totals
// (the totals read off Infotech, plus every month locked since). A month can only be run once the months before it are locked.
// `viewOnly` lets a month already in the year-to-date totals (brought over from Infotech) be looked at; saving it is still refused.
async function payrollContext(db: any, year: number, month: number, viewOnly = false) {
  // Staff who left during or after this pay period are still paid their last month.
  const periodFrom = month === 1 ? `${year - 1}-12-20` : `${year}-${String(month - 1).padStart(2, '0')}-20`;
  const [{ data: staffRows, error }, ytdRead, payslipRead, raiseRead] = await Promise.all([
    db.from('hr_employees').select('id,company,employee_code,full_name,basic_salary,fixed_allowances,marital_status,spouse_working,children,payroll_settings,join_date,resign_date,status').or(`status.eq.Active,and(status.eq.Inactive,resign_date.gte.${periodFrom})`).order('company').order('employee_code'),
    db.from('hr_payroll_ytd').select('employee_id,as_of,wages,kwsp_relief,pcb_paid,zakat_paid,prev_as_of,prev_wages,prev_kwsp_relief,prev_pcb_paid').eq('year', year),
    db.from('hr_payslips').select('employee_id,month,status,inputs,result').eq('year', year),
    db.from('hr_career_history').select('employee_id,event_date,from_value,to_value').in('kind', ['Increment', 'Salary Adjustment']).gte('event_date', periodFrom).limit(2000),
  ]);
  if (error) throw error;
  if (ytdRead.error) throw fail(400, 'The year-to-date totals are not set up yet.');
  if (payslipRead.error) throw fail(400, 'Payslips are not set up yet (migration 202611020005).');
  // Raises dated inside or after this pay period: the salary before each one is needed to pay the days before it (the profile holds the latest salary).
  const raises = new Map<string, { date: string; from: number }[]>();
  for (const row of raiseRead.error ? [] : raiseRead.data || []) {
    const before = Number(String(row.from_value || '').replace(/,/g, '')), after = Number(String(row.to_value || '').replace(/,/g, ''));
    if (!row.event_date || !(before > 0) || !(after > 0)) continue;
    raises.set(row.employee_id, [...(raises.get(row.employee_id) || []), { date: row.event_date, from: before }]);
  }
  const base = new Map<string, any>((ytdRead.data || []).map((row: any) => [row.employee_id, row]));
  const baseMonth = Math.max(0, ...(ytdRead.data || []).map((row: any) => MONTHS.indexOf(String(row.as_of || '').slice(0, 3).toLowerCase()) + 1));
  if (!baseMonth) throw fail(400, 'No year-to-date totals for this year.');
  // The last month in the totals can be run again for comparison with Infotech, from the totals as they stood the month before.
  // Once the month's slips were brought over from Infotech as locked slips there is nothing left to compare.
  const comparison = month === baseMonth && (ytdRead.data || []).some((row: any) => row.prev_as_of) && !(payslipRead.data || []).some((row: any) => row.month === month && row.status === 'locked');
  if (!viewOnly && (month < baseMonth || (month === baseMonth && !comparison))) throw fail(400, `Pay up to ${MONTHS[baseMonth - 1].toUpperCase()} ${year} is already in the year-to-date totals. Choose a later month.`);
  const payslips = payslipRead.data || [];
  const staff = (staffRows || []).map((row: any) => {
    const own = payslips.filter((item: any) => item.employee_id === row.id);
    const earlier = own.filter((item: any) => item.month > baseMonth && item.month < month);
    const start = base.get(row.id);
    const ytd = comparison ? { wages: Number(start?.prev_wages || 0), kwspRelief: Number(start?.prev_kwsp_relief || 0), pcbPaid: Number(start?.prev_pcb_paid || 0), zakatPaid: Number(start?.zakat_paid || 0) } : { wages: Number(start?.wages || 0), kwspRelief: Number(start?.kwsp_relief || 0), pcbPaid: Number(start?.pcb_paid || 0), zakatPaid: Number(start?.zakat_paid || 0) };
    let earlierLocked = true;
    for (let m = baseMonth + 1; m < month && !comparison; m++) {
      const slip = earlier.find((item: any) => item.month === m);
      if (!slip || slip.status !== 'locked') { earlierLocked = false; continue; }
      ytd.wages = Math.round((ytd.wages + Number(slip.result?.gross || 0)) * 100) / 100;
      ytd.kwspRelief = Math.min(4000, Math.round((ytd.kwspRelief + Number(slip.result?.kwspEmployee || 0)) * 100) / 100);
      ytd.pcbPaid = Math.round((ytd.pcbPaid + Number(slip.result?.pcb || 0)) * 100) / 100;
    }
    const slip = own.find((item: any) => item.month === month);
    return {
      id: row.id, company: row.company, employeeCode: row.employee_code, fullName: row.full_name, basicSalary: Number(row.basic_salary || 0), fixedAllowances: row.fixed_allowances || [], salaryChanges: raises.get(row.id) || [],
      maritalStatus: row.marital_status || '', spouseWorking: row.spouse_working, children: (row.children || []).map((child: any) => ({ dateOfBirth: child.dateOfBirth || null, studying: Boolean(child.studying) })),
      settings: row.payroll_settings || {}, joinDate: row.join_date || null, resignDate: row.resign_date || null, status: row.status, ytd, hasYtd: Boolean(start), earlierLocked, payslip: slip ? { status: slip.status, inputs: slip.inputs, result: slip.result } : null,
    };
  });
  return { asOf: `${MONTHS[baseMonth - 1].toUpperCase()} ${year}`, baseMonth, comparison, staff };
}
export async function hrHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, user, profile } = await officeAccess(req, false, 'hr');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const action = text(req.query.action || body.action, 40);
    const now = new Date().toISOString();

    if (action.startsWith('calendar_')) return await hrCalendarAction(req, res, db, user, action, body);

    if (action.startsWith('attendance_')) return await attendanceHrAction(req, res, db, action, body, text((user as any)?.email, 120));

    if (req.method === 'GET' && action === 'staff') {
      // The Assessment Room staff list; preview and test accounts are not real staff.
      const { data, error } = await db.from('assessment_staff').select('id,name,staff_code,branch,active').eq('can_preview', false).neq('branch', 'Test').order('branch').order('name');
      if (error) throw error;
      return res.status(200).json({ admin: profile.role === 'super_admin', staff: (data || []).map((row: any) => ({ id: row.id, name: row.name, code: row.staff_code, branch: row.branch, active: row.active })) });
    }

    // Directory list: only what the cards show, no personal or pay details.
    if (req.method === 'GET' && action === 'staff_summary_report') {
      const company = text(req.query.company, 10), status = text(req.query.status, 20);
      if (company && !['KJ', 'SK'].includes(company) || status && !['Active', 'Inactive'].includes(status)) throw fail(400, 'Choose a valid company and staff status.');
      let query = db.from('hr_employees').select('id,company,employee_code,full_name,designation,department,employment_type,join_date,confirm_date,resign_date,status', { count: 'exact' }).order('company').order('employee_code').limit(1000);
      if (company) query = query.eq('company', company);
      if (status) query = query.eq('status', status);
      const { data, error, count } = await query;
      if (error) throw error;
      if ((count || 0) > (data || []).length) throw fail(422, 'More than 1,000 staff: this report needs pagination.');
      return res.status(200).json({ rows: (data || []).map((p: any) => ({ id: p.id, company: p.company, employeeCode: p.employee_code, fullName: p.full_name, designation: p.designation, department: p.department, employmentType: p.employment_type, joinDate: p.join_date, confirmDate: p.confirm_date, resignDate: p.resign_date, status: p.status })) });
    }
    if (req.method === 'GET' && action === 'employees') {
      // Once the last working day has passed, the person is no longer Active.
      await db.from('hr_employees').update({ status: 'Inactive', updated_at: now }).eq('status', 'Active').lt('resign_date', new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }));
      // leave_approver_id is new: until its migration is run the list is read without it.
      let result: any = await db.from('hr_employees').select(`${SUMMARY},leave_approver_id,leave_backup_approver_id,final_approver_id`).order('company').order('full_name');
      if (result.error?.code === '42703') result = await db.from('hr_employees').select(SUMMARY).order('company').order('full_name');
      const { data, error } = result;
      if (error) throw error;
      // Whether each person's individual sign-in has a password yet: none (no sign-in), not_set, or set.
      const linked = (data || []).map((row: any) => row.assessment_staff_id).filter(Boolean);
      const { data: logins } = linked.length ? await db.from('assessment_staff').select('id,name,password_hash').in('id', linked) : { data: [] };
      const hasPassword = new Map((logins || []).map((login: any) => [login.id, Boolean(login.password_hash)]));
      const shortNames = new Map((logins || []).map((login: any) => [login.id, String(login.name || '')])); // the name they sign in with
      return res.status(200).json({ employees: (data || []).map((row: any) => ({ id: row.id, company: row.company, employeeCode: row.employee_code, fullName: row.full_name, shortName: shortNames.get(row.assessment_staff_id) || '', branch: row.branch, department: row.department, designation: row.designation, employmentType: row.employment_type, status: row.status, resignDate: row.resign_date, joinDate: row.join_date, assessmentStaffId: row.assessment_staff_id, leaveApproverId: row.leave_approver_id || null, leaveBackupApproverId: row.leave_backup_approver_id || null, finalApproverId: row.final_approver_id || null, signIn: !row.assessment_staff_id ? 'none' : hasPassword.get(row.assessment_staff_id) ? 'set' : 'not_set' })) });
    }

    // One full profile, with its recent changes.
    if (req.method === 'GET' && action === 'employee') {
      const id = text(req.query.id, 60);
      const [{ data, error }, { data: audit, error: auditError }] = await Promise.all([
        db.from('hr_employees').select('*').eq('id', id).maybeSingle(),
        db.from('hr_audit').select('action,changes,changed_at,changed_by').eq('employee_id', id).order('changed_at', { ascending: false }).limit(200),
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

    // Last working day, set from the staffing forecast so the staff profile follows it. Status stays as it is.
    if (req.method === 'POST' && action === 'set_resign_date') {
      const id = text(body.id, 60);
      if (!isDate(body.resignDate)) throw fail(400, 'Enter the last working day.');
      const { error } = await db.from('hr_employees').update({ resign_date: body.resignDate, updated_at: now, updated_by: user.id }).eq('id', id);
      if (error) throw error;
      await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { resign_date: body.resignDate }, changed_by: user.id });
      return res.status(200).json({ success: true });
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
      return res.status(200).json({ targetYear, sourceYear: targetYear - 1, rows, pending: pending || [], closure: closure || null, gcrSettings });
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
      // A category that was only guessed is saved as soon as the person's figures already match that category's policy.
      const confirmed: Record<string, string> = {};
      for (const p of people || []) {
        if (p.leave_policy || !p.join_date) continue;
        const al = current(p.id, 'AL'), ml = current(p.id, 'ML'), hosp = current(p.id, 'HOSP');
        if (!al) continue;
        const track = Number(al.eligible) >= 15 ? 'admin' : 'clinical', want = policyFor(track, p.join_date);
        if (Number(al.eligible) === want.al && (want.ml === null || (ml && Number(ml.eligible) === want.ml)) && (want.hosp === null || (hosp && Number(hosp.eligible) === want.hosp))) confirmed[p.id] = track;
      }
      for (const track of new Set(Object.values(confirmed))) {
        const ids = Object.keys(confirmed).filter((id) => confirmed[id] === track);
        const { error: confirmError } = await db.from('hr_employees').update({ leave_policy: track }).in('id', ids);
        if (!confirmError) for (const p of people || []) if (confirmed[p.id] === track) p.leave_policy = track;
      }
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
    if (req.method === 'GET' && action === 'roster_draft_context') {
      const month = String(req.query.month || ''), source = String(req.query.source || '');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !isDate(source) || !Number.isFinite(Date.parse(`${source}T00:00:00Z`)) || new Date(`${source}T00:00:00Z`).toISOString().slice(0, 10) !== source) throw fail(400, 'Choose a valid target month and pattern start date.');
      const group = String(req.query.group || ''), company = String(req.query.company || ''), sampleLength = Number(req.query.length);
      if (![7, 14, 28].includes(sampleLength)) throw fail(400, 'Choose a 7, 14 or 28-day pattern sample.');
      if (!['staff', 'doctors'].includes(group) || !['', 'KJ', 'SK'].includes(company)) throw fail(400, 'Choose a roster group and clinic.');
      const start = `${month}-01`, end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
      const sourceEnd = new Date(Date.parse(`${source}T00:00:00Z`) + (sampleLength - 1) * 86400000).toISOString().slice(0, 10);
      const before = new Date(Date.parse(`${start}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
      let staffQuery = db.from('hr_employees').select('id,company,employee_code,full_name,designation', { count: 'exact' }).eq('status', 'Active');
      if (company) staffQuery = staffQuery.eq('company', company);
      const staff = await staffQuery.limit(501);
      if (staff.error) throw staff.error;
      if ((staff.count || 0) > 500 || (staff.count || 0) > (staff.data || []).length) throw fail(422, 'Too many staff for the roster trial. Choose one clinic.');
      const scope = String(req.query.scope || 'ca');
      if (!['ca', 'all'].includes(scope)) throw fail(400, 'Choose a roster scope.');
      const people = (staff.data || []).filter((p: any) => (group === 'doctors') === /\b(DR|DOCTOR)\b/i.test(p.designation || '')).filter((p: any) => group === 'doctors' || scope === 'all' || /CLINIC ASSISTANT|PEMBANTU KLINIK/i.test(p.designation || ''));
      const ids = people.map((p: any) => p.id);
      if (!ids.length) return res.status(200).json({ people: [], sourceDays: [], targetDays: [], leave: [] });
      const [sourceDays, targetDays, leave] = await Promise.all([
        db.from('hr_roster').select('employee_id,work_date,shift', { count: 'exact' }).in('employee_id', ids).gte('work_date', source).lte('work_date', sourceEnd).limit(2000),
        db.from('hr_roster').select('employee_id,work_date,shift', { count: 'exact' }).in('employee_id', ids).gte('work_date', before).lte('work_date', end).limit(2000),
        db.from('hr_leave_requests').select('employee_id,leave_type,start_date,end_date,half_day', { count: 'exact' }).in('employee_id', ids).eq('status', 'approved').lte('start_date', end).gte('end_date', start).limit(500),
      ]);
      for (const result of [sourceDays, targetDays, leave]) {
        if (result.error) throw result.error;
        if ((result.count || 0) > (result.data || []).length) throw fail(422, 'Roster trial exceeds its read limit. Choose one clinic to avoid incomplete results.');
      }
      const mapDays = (rows: any[]) => rows.map((r) => ({ id: r.employee_id, date: r.work_date, shift: r.shift }));
      return res.status(200).json({ people: people.map((p: any) => ({ id: p.id, company: p.company, code: p.employee_code, name: p.full_name, designation: p.designation || '' })), sourceDays: mapDays(sourceDays.data || []), targetDays: mapDays(targetDays.data || []), leave: (leave.data || []).map((r: any) => ({ id: r.employee_id, start: r.start_date, end: r.end_date, shift: r.leave_type, halfDay: Boolean(r.half_day) })) });
    }
    if (req.method === 'GET' && action === 'roster') {
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : '';
      if (!month) throw fail(400, 'Choose a month.');
      const start = `${month}-01`, end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
      const { data, error } = await db.from('hr_roster').select('employee_id,work_date,shift,works,note').gte('work_date', start).lte('work_date', end).limit(5000);
      if (error) throw error;
      const ids = [...new Set((data || []).map((row: any) => row.employee_id))];
      const { data: people } = ids.length ? await db.from('hr_employees').select('id,company,employee_code,full_name,designation,assessment_staff_id').in('id', ids) : { data: [] };
      const linked = (people || []).map((p: any) => p.assessment_staff_id).filter(Boolean);
      const { data: logins } = linked.length ? await db.from('assessment_staff').select('id,name').in('id', linked) : { data: [] };
      const shortNames = new Map((logins || []).map((login: any) => [login.id, String(login.name || '')])); // the name they sign in with
      return res.status(200).json({ month, people: (people || []).map((p: any) => ({ id: p.id, company: p.company, code: p.employee_code, name: p.full_name, short: shortNames.get(p.assessment_staff_id) || '', designation: p.designation || '' })), days: (data || []).map((row: any) => ({ id: row.employee_id, date: row.work_date, shift: row.shift, works: row.works, note: row.note })) });
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
      // Compare with what is already saved: a new day is added, a different code replaces the old one (and is written to the
      // change log), and a day that already means the same (ASCL3 and PM, say) is left as it is.
      const staffIds = [...new Set(out.map((row) => row.employee_id))], dates = out.map((row) => row.work_date).sort();
      const { data: existing, error: existingError } = await db.from('hr_roster').select('employee_id,work_date,shift').in('employee_id', staffIds).gte('work_date', dates[0]).lte('work_date', dates[dates.length - 1]).limit(10000);
      if (existingError) throw existingError;
      const was = new Map((existing || []).map((row: any) => [`${row.employee_id}|${row.work_date}`, String(row.shift)]));
      const toSave: any[] = []; const changed: any[] = []; let same = 0;
      for (const row of out) {
        const before = was.get(`${row.employee_id}|${row.work_date}`);
        if (before === undefined) toSave.push(row);
        else if (newCode(before) === newCode(row.shift)) same++;
        else { toSave.push(row); changed.push({ employee_id: row.employee_id, date: row.work_date, from: before, to: row.shift }); }
      }
      if (toSave.length) {
        const { error } = await db.from('hr_roster').upsert(toSave, { onConflict: 'employee_id,work_date' });
        if (error) throw error;
      }
      // One log entry per person, listing each day that changed.
      const perPerson = new Map<string, Record<string, unknown>>();
      for (const item of changed) perPerson.set(item.employee_id, { ...(perPerson.get(item.employee_id) || {}), [`roster_${item.date}`]: [item.from, item.to] });
      if (perPerson.size) {
        const { error: auditError } = await db.from('hr_audit').insert([...perPerson].map(([employee_id, days]) => ({ employee_id, action: 'roster', changes: { ...days, roster_reason: ['', 'CSV upload'] }, changed_by: user.id })));
        if (auditError) throw auditError;
      }
      return res.status(200).json({ success: true, saved: toSave.length, added: toSave.length - changed.length, changed: changed.length, same });
    }

    // Fills blank profile details from the staff records read off Infotech (a file per company: { company, staff: [...] }).
    // Nothing that is already filled is overwritten. With dryRun (the default) nothing is saved and the answer says what would be filled.
    if (req.method === 'POST' && action === 'profile_import') {
      const rows: any[] = Array.isArray(body.rows) ? body.rows.slice(0, 300) : [];
      const dryRun = body.dryRun !== false;
      if (!rows.length) throw fail(400, 'There are no staff in the file.');
      const { data: people, error: peopleError } = await db.from('hr_employees').select('*');
      if (peopleError) throw peopleError;
      const byKey = new Map((people || []).map((p: any) => [`${p.company}|${String(p.employee_code).toUpperCase()}`, p]));
      const title = (value: string) => value.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
      const date = (value: unknown) => { const m = String(value || '').match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
      // Local format with a dash after the network code: 0123456789 becomes 012-3456789. Anything that is not a plain number is kept as typed.
      const phone = (value: unknown) => { const raw = String(value || '').replace(/^['"\s]+/, '').trim(); if (!raw || /mobile number/i.test(raw)) return ''; let d = raw.replace(/\D/g, ''); if (d.startsWith('60')) d = d.slice(2); if (d.length < 8 || d.length > 11) return raw; if (!d.startsWith('0')) d = `0${d}`; return `${d.slice(0, 3)}-${d.slice(3)}`; };
      const looksLikePhone = (value: unknown) => /^[\d\s\-+()'"]{7,}$/.test(String(value || '').trim());
      const filled = (value: any) => !(value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length));
      const MARITAL: Record<string, string> = { SINGLE: 'Single', MARRIED: 'Married', DIVORCED: 'Divorced', WIDOWED: 'Widowed' };
      // Employment history read off Infotech: only entries that are not already saved are added (so a second upload adds nothing).
      const historyKey = (r: any) => [r.employee_id, r.event_date || '', r.kind, r.detail, r.from_value, r.to_value].join('|');
      const knownHistory = new Set<string>();
      const historyRead = await db.from('hr_career_history').select('employee_id,event_date,kind,detail,from_value,to_value').limit(20000);
      const historyReady = !historyRead.error;
      const ytdRead = await db.from('hr_payroll_ytd').select('employee_id,year,prev_as_of').limit(5000);
      const ytdReady = !ytdRead.error;   // the table is not set up yet: year-to-date totals are skipped
      const slipRead = await db.from('hr_payslips').select('employee_id,year,month,status').limit(5000);
      const knownSlips = new Set<string>((slipRead.data || []).map((r: any) => `${r.employee_id}|${r.year}|${r.month}`));
      const draftSlips = new Set<string>((slipRead.data || []).filter((r: any) => r.status !== 'locked').map((r: any) => `${r.employee_id}|${r.year}|${r.month}`));   // a draft month is replaced by what Infotech paid
      const knownYtd = new Set<string>((ytdRead.data || []).map((r: any) => `${r.employee_id}|${r.year}`));
      const knownPrevYtd = new Set<string>((ytdRead.data || []).filter((r: any) => r.prev_as_of).map((r: any) => `${r.employee_id}|${r.year}`));
      const newYtd: any[] = [];   // the table is not set up yet: history is skipped
      for (const r of historyRead.data || []) knownHistory.add(historyKey(r));
      const slashDate = (value: unknown) => { const m = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
      const unknown: string[] = []; const counts: Record<string, number> = {}; const results: { code: string; name: string; fields: string[] }[] = [];
      for (const row of rows) {
        const company = text(row.company, 4).toUpperCase(), code = text(row.code, 30).toUpperCase();
        const person: any = byKey.get(`${company}|${code}`);
        if (!person) { unknown.push(`${company} ${code}`); continue; }
        const religion = text(row.religion, 40).toUpperCase() === 'MUSLIM' ? 'Islam' : title(text(row.religion, 40));
        let emergencyName = text(row.emergencyName, 120), emergencyPhone = phone(row.emergencyPhone);
        if (emergencyName && looksLikePhone(emergencyName)) { if (!emergencyPhone) emergencyPhone = phone(emergencyName); emergencyName = ''; }   // Infotech users sometimes typed the number in the name box
        const nationality = title(text(row.nationality, 40));
        const wanted: Record<string, any> = {
          date_of_birth: date(row.dob), religion, race: title(text(row.race, 40)), foreign_id_no: text(row.foreignId, 30), passport_no: text(row.passport, 30),
          phone: phone(row.mobile) || phone(row.homePhone),
          address_line1: text(row.addr1, 160), address_line2: [text(row.addr2, 160), text(row.addr3, 160)].filter(Boolean).join(', '), city: title(text(row.city, 60)), state: title(text(row.state, 60)), postcode: text(row.postcode, 10),
          marital_status: MARITAL[text(row.marital, 20).toUpperCase()] || '',
          spouse_name: text(row.spouseName, 120), spouse_ic: text(row.spouseIc, 20), spouse_employer: title(text(row.spouseOccupation, 120)), spouse_phone: phone(row.spousePhone),
          emergency_name: emergencyName, emergency_relation: title(text(row.emergencyRelation, 40)), emergency_phone: emergencyPhone,
          children: (Array.isArray(row.children) ? row.children : []).slice(0, 20).map((child: any) => ({ name: text(child?.name, 120), dateOfBirth: date(child?.dob) || null, studying: child?.studying === true, disabled: child?.disabled === true })).filter((child: any) => child.name),
          education: (Array.isArray(row.education) ? row.education : []).slice(0, 12).map((item: any) => ({ level: text(item?.level, 60), institution: text(item?.institution, 120), course: text(item?.course, 120), year: text(item?.year, 4) })).filter((item: any) => item.institution || item.course),
        };
        // Pay and statutory details (the second file read off Infotech). One bank is kept; AraOffice has a single account.
        const account = String((Array.isArray(row.banks) ? row.banks[0]?.acc : '') || '').replace(/[^\dA-Za-z-]/g, '');
        // Infotech's total salary is the basic salary plus any increment, so it is the pay as it stands now.
        const salary = Number(String(row.totalSalary || row.basicSalary || '').replace(/,/g, ''));
        Object.assign(wanted, {
          basic_salary: Number.isFinite(salary) && salary > 0 ? Math.round(salary * 100) / 100 : '',
          bank_name: text(Array.isArray(row.banks) ? row.banks[0]?.bank : '', 60), bank_account: text(account, 40),
          epf_no: text(row.epfNo, 30), socso_no: text(row.socsoNo, 30), tax_no: text(row.pcbNo, 30),
          // Monthly allowances (Infotech's payable allowances), for example a director fee.
          fixed_allowances: (Array.isArray(row.allowances) ? row.allowances : []).slice(0, 20).map((item: any) => ({ name: title(text(item?.name, 80)), amount: Math.round(Number(String(item?.amount ?? '').replace(/,/g, '')) * 100) / 100 })).filter((item: any) => item.name && Number.isFinite(item.amount) && item.amount > 0),
        });
        // Whether the spouse works (PCB) and which children count as studying or disabled, read from Infotech's tax details and child list.
        const spouseWorking = row.spouseWorking === true || row.spouseWorking === false ? row.spouseWorking : null;
        if (spouseWorking !== null) wanted.spouse_working = spouseWorking;
        if (nationality && nationality !== 'Malaysian' && (person.nationality || 'Malaysian') === 'Malaysian') wanted.nationality = nationality;
        const patch: Record<string, any> = {}; const changes: Record<string, unknown> = {};
        for (const [column, value] of Object.entries(wanted)) { if (filled(value) && !(column === 'basic_salary' ? Number(person[column]) > 0 : filled(person[column]))) { patch[column] = value; changes[column] = [column === 'children' || column === 'education' ? [] : '', value]; } }
        // A child already saved only moves from not studying / not disabled to studying / disabled, never the other way.
        const flagged = (Array.isArray(row.children) ? row.children : []).filter((child: any) => child?.studying === true || child?.disabled === true);
        if (flagged.length && Array.isArray(person.children) && person.children.length) {
          let changed = false;
          const nextChildren = person.children.map((child: any) => {
            const match = flagged.find((item: any) => text(item?.name, 120).toUpperCase() === String(child?.name || '').toUpperCase());
            if (!match) return child;
            const studying = child.studying || match.studying === true, disabled = child.disabled || match.disabled === true;
            if (studying === child.studying && disabled === child.disabled) return child;
            changed = true; return { ...child, studying, disabled };
          });
          if (changed) { patch.children = nextChildren; changes.children = [person.children, nextChildren]; }
        }
        // Payroll settings read off Infotech (KWSP rate, PERKESO category, EIS and so on): only keys not saved yet are added.
        if (row.payroll && typeof row.payroll === 'object') {
          const incoming: Record<string, string | number | boolean> = {};
          for (const key of PAYROLL_KEYS) { const value = (row.payroll as any)[key]; if (typeof value === 'boolean' || typeof value === 'number') incoming[key] = value; else if (typeof value === 'string' && value.trim()) incoming[key] = value.trim().slice(0, 80); }
          const existing = person.payroll_settings && typeof person.payroll_settings === 'object' ? person.payroll_settings : {};
          const merged = { ...incoming, ...existing };
          if (Object.keys(incoming).some((key) => !(key in existing))) { patch.payroll_settings = merged; changes.payroll_settings = [existing, merged]; }
        }
        let ytdEntry: any = null; let ytdPrev: any = null; let inputsEntry: any = null;
        // Year-to-date totals (wages, KWSP relief, PCB paid) for the first pay run; a year already saved for this person is left alone.
        if (ytdReady && row.ytd && typeof row.ytd === 'object') {
          const year = Math.round(Number(row.ytd.year)), money = (value: unknown) => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
          const prevWanted = row.ytd.prevAsOf && Number.isFinite(Number(row.ytd.prevWages));
          if (year >= 2020 && year <= 2100 && knownYtd.has(`${person.id}|${year}`) && prevWanted && !knownPrevYtd.has(`${person.id}|${year}`)) ytdPrev = { year, prev_as_of: text(row.ytd.prevAsOf, 20), prev_wages: money(row.ytd.prevWages), prev_kwsp_relief: money(row.ytd.prevKwspRelief), prev_pcb_paid: money(row.ytd.prevPcbPaid) };
          if (year >= 2020 && year <= 2100 && !knownYtd.has(`${person.id}|${year}`)) {
            knownYtd.add(`${person.id}|${year}`);
            ytdEntry = ({ employee_id: person.id, year, as_of: text(row.ytd.asOf, 20), wages: money(row.ytd.wages), kwsp_relief: money(row.ytd.kwspRelief), pcb_paid: money(row.ytd.pcbPaid), zakat_paid: money(row.ytd.zakatPaid), source: 'Infotech', updated_at: new Date().toISOString() });
          }
        }
        // What was entered for a month in Infotech (OT, rest days, unpaid leave and so on), so that month can be shown in the pay run for comparison.
        if (!slipRead.error && row.payslipInputs && typeof row.payslipInputs === 'object') {
          const slipYear = Math.round(Number(row.payslipInputs.year)), slipMonth = Math.round(Number(row.payslipInputs.month));
          const amount = (value: unknown) => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
          const given = row.payslipInputs.inputs || {};
          if (slipYear >= 2020 && slipYear <= 2100 && slipMonth >= 1 && slipMonth <= 12 && !knownSlips.has(`${person.id}|${slipYear}|${slipMonth}`)) {
            knownSlips.add(`${person.id}|${slipYear}|${slipMonth}`);
            inputsEntry = { employee_id: person.id, year: slipYear, month: slipMonth, status: 'draft', inputs: { ot: amount(given.ot), restPh: amount(given.restPh), shiftAllowance: amount(given.shiftAllowance), unpaidLeave: amount(given.unpaidLeave), otherAllowance: amount(given.otherAllowance), otherDeduction: amount(given.otherDeduction), annualLeaveDeduction: amount(given.annualLeaveDeduction) } };
          }
        }
        // Months already paid and locked in Infotech (taken as they were, not worked out again), so staff and HR can look back at them.
        const slipHistory: any[] = [];
        // A correction to a slip already brought over from Infotech (for example the KWSP wage after a leave deduction): only these fields are changed, nothing else on the slip.
        const slipFixes: { year: number; month: number; fields: Record<string, number> }[] = [];
        if (!slipRead.error && Array.isArray(row.payslipHistory)) for (const item of row.payslipHistory.slice(0, 36)) {
          const fixYear = Math.round(Number(item?.year)), fixMonth = Math.round(Number(item?.month));
          if (!item?.fix || typeof item.fix !== 'object' || !(fixYear >= 2020 && fixYear <= 2100 && fixMonth >= 1 && fixMonth <= 12)) continue;
          const fields: Record<string, number> = {};
          for (const key of ['kwspWage', 'socsoWage']) if (Number.isFinite(Number(item.fix[key]))) fields[key] = Math.round(Number(item.fix[key]) * 100) / 100;
          if (Object.keys(fields).length && knownSlips.has(`${person.id}|${fixYear}|${fixMonth}`)) slipFixes.push({ year: fixYear, month: fixMonth, fields });
        }
        if (!slipRead.error && Array.isArray(row.payslipHistory)) for (const item of row.payslipHistory.slice(0, 36)) {
          const slipYear = Math.round(Number(item?.year)), slipMonth = Math.round(Number(item?.month));
          if (!(slipYear >= 2020 && slipYear <= 2100 && slipMonth >= 1 && slipMonth <= 12) || !item?.result || typeof item.result !== 'object' || (knownSlips.has(`${person.id}|${slipYear}|${slipMonth}`) && !draftSlips.has(`${person.id}|${slipYear}|${slipMonth}`))) continue;
          const number = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100, r = item.result;
          knownSlips.add(`${person.id}|${slipYear}|${slipMonth}`);
          slipHistory.push({ employee_id: person.id, year: slipYear, month: slipMonth, status: 'locked', locked_at: now, updated_at: now, inputs: typeof item.inputs === 'object' && item.inputs ? item.inputs : {},
            result: { basic: number(r.basic), allowances: (Array.isArray(r.allowances) ? r.allowances : []).slice(0, 20).map((a: any) => ({ name: text(a?.name, 60), amount: number(a?.amount) })), ot: number(r.ot), restPh: number(r.restPh), gross: number(r.gross),
              kwspEmployee: number(r.kwspEmployee), kwspEmployer: number(r.kwspEmployer), socsoEmployee: number(r.socsoEmployee), socsoEmployer: number(r.socsoEmployer), eisEmployee: number(r.eisEmployee), eisEmployer: number(r.eisEmployer),
              skbbk: number(r.skbbk), hrdf: number(r.hrdf), pcb: number(r.pcb), deductions: number(r.deductions), net: number(r.net), ytdAfter: { wages: number(r.ytdAfter?.wages), pcbPaid: number(r.ytdAfter?.pcbPaid) }, source: 'Infotech' } });
        }
        const newHistory: any[] = [];
        if (historyReady) for (const item of (Array.isArray(row.history) ? row.history : []).slice(0, 200)) {
          const money = Number(String(item?.increment || item?.bonus || '').replace(/,/g, ''));
          const entry = { employee_id: person.id, event_date: slashDate(item?.date), kind: title(text(item?.kind, 60)) || 'Other', detail: text(item?.detail, 80), from_value: text(item?.from, 80), to_value: text(item?.to, 80), amount: Number.isFinite(money) && money > 0 ? Math.round(money * 100) / 100 : null, source: 'Infotech' };
          const key = historyKey(entry);
          if (knownHistory.has(key)) continue;
          knownHistory.add(key); newHistory.push(entry);
        }
        if (!Object.keys(patch).length && !newHistory.length && !ytdEntry && !ytdPrev && !inputsEntry && !slipHistory.length && !slipFixes.length) continue;
        if (['address_line1', 'address_line2', 'city', 'state', 'postcode'].some((column) => column in patch)) {
          const merged = { ...person, ...patch };
          patch.address = [merged.address_line1, merged.address_line2, [merged.postcode, merged.city].filter(Boolean).join(' '), merged.state].filter(Boolean).join(', ');
        }
        for (const column of Object.keys(changes)) counts[column] = (counts[column] || 0) + 1;
        if (ytdPrev) { counts.payroll_ytd_previous = (counts.payroll_ytd_previous || 0) + 1; changes.payroll_ytd_previous = ['', ytdPrev.prev_as_of]; }
        if (slipFixes.length) { counts.payslip_fix = (counts.payslip_fix || 0) + slipFixes.length; changes.payslip_fix = ['', `${slipFixes.length} slips`]; }
        if (slipHistory.length) { counts.payslip_history = (counts.payslip_history || 0) + slipHistory.length; changes.payslip_history = ['', `${slipHistory.length} months`]; }
        if (inputsEntry) { counts.payslip_inputs = (counts.payslip_inputs || 0) + 1; changes.payslip_inputs = ['', `${inputsEntry.year}-${inputsEntry.month}`]; }
        if (ytdEntry) { counts.payroll_ytd = (counts.payroll_ytd || 0) + 1; changes.payroll_ytd = ['', `${ytdEntry.year} to ${ytdEntry.as_of}`]; }
        if (newHistory.length) { counts.career_history = (counts.career_history || 0) + newHistory.length; changes.career_history = ['', `${newHistory.length} entries`]; }
        results.push({ code: `${company} ${code}`, name: person.full_name, fields: Object.keys(changes) });
        if (!dryRun) {
          if (Object.keys(patch).length) {
            const { error } = await db.from('hr_employees').update({ ...patch, updated_at: now }).eq('id', person.id);
            if (error) throw error;
          }
          if (ytdPrev) {
            const { year: prevYear, ...prevFields } = ytdPrev;
            const { error: prevError } = await db.from('hr_payroll_ytd').update({ ...prevFields, updated_at: now }).eq('employee_id', person.id).eq('year', prevYear);
            if (prevError) throw prevError;
          }
          if (inputsEntry) {
            const { error: inputsError } = await db.from('hr_payslips').insert(inputsEntry);
            if (inputsError) throw inputsError;
          }
          for (const fix of slipFixes) {
            const { data: current, error: readError } = await db.from('hr_payslips').select('result,status').eq('employee_id', person.id).eq('year', fix.year).eq('month', fix.month).maybeSingle();
            if (readError) throw readError;
            if (!current || current.status !== 'locked' || current.result?.source !== 'Infotech') continue;   // only slips brought over from Infotech can be corrected here
            const { error: fixError } = await db.from('hr_payslips').update({ result: { ...current.result, ...fix.fields }, updated_at: now }).eq('employee_id', person.id).eq('year', fix.year).eq('month', fix.month);
            if (fixError) throw fixError;
          }
          if (slipHistory.length) {
            for (const item of slipHistory) if (draftSlips.has(`${item.employee_id}|${item.year}|${item.month}`)) {
              const { error: dropError } = await db.from('hr_payslips').delete().eq('employee_id', item.employee_id).eq('year', item.year).eq('month', item.month).neq('status', 'locked');
              if (dropError) throw dropError;
            }
            const { error: slipError } = await db.from('hr_payslips').insert(slipHistory);
            if (slipError) throw slipError;
          }
          if (ytdEntry) {
            const { error: ytdError } = await db.from('hr_payroll_ytd').insert(ytdEntry);
            if (ytdError) throw ytdError;
          }
          if (newHistory.length) {
            const { error: historyError } = await db.from('hr_career_history').insert(newHistory);
            if (historyError) throw historyError;
          }
          const { error: auditError } = await db.from('hr_audit').insert({ employee_id: person.id, action: 'import', changes: { ...changes, source: ['', 'Infotech'] }, changed_by: user.id });
          if (auditError) throw auditError;
        }
      }
      return res.status(200).json({ dryRun, staff: rows.length, updated: results.length, unknown, counts, results });
    }

    // A staff member's employment history (HR only; the staff API never reads this table).
    // Monthly pay run. The staff and what they were paid so far this year come from here; the pay itself is worked out by the same code
    // the screen uses (src/lib/payrollRun.ts), so what is saved is always what the server worked out, not what the browser sent.
    // Twelve months of payroll cost, head count and joiners/leavers for the Payroll Chart tab and the HR home.
    if (req.method === 'GET' && action === 'payroll_trend') {
      const company = ['KJ', 'SK'].includes(String(req.query.company)) ? String(req.query.company) : '';
      const nowMy = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
      const months: string[] = [];
      for (let back = 11; back >= 0; back--) { const index = Number(nowMy.slice(0, 4)) * 12 + Number(nowMy.slice(5, 7)) - 1 - back; months.push(`${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`); }
      let people = db.from('hr_employees').select('id,company,join_date,resign_date').limit(2000);
      if (company) people = people.eq('company', company);
      const { data: staff, error: staffError } = await people;
      if (staffError) throw staffError;
      const ids = new Set((staff || []).map((p: any) => p.id));
      const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];
      const { data: slips, error: slipError } = await db.from('hr_payslips').select('employee_id,year,month,result').in('year', years).limit(10000);
      if (slipError) { if (slipError.code === '42P01') return res.status(200).json({ months, cost: {}, headcount: [], joined: [], left: [] }); throw slipError; }
      const keys = ['basic', 'ot', 'allowance', 'gross', 'net', 'kwspEmployee', 'kwspEmployer', 'eisEmployee', 'eisEmployer', 'socsoEmployee', 'socsoEmployer', 'pcb'];
      const cost: Record<string, number[]> = Object.fromEntries(keys.map((key) => [key, months.map(() => 0)]));
      const paidStaff = months.map(() => 0);
      for (const slip of slips || []) {
        if (!ids.has(slip.employee_id)) continue;
        const at = months.indexOf(`${slip.year}-${String(slip.month).padStart(2, '0')}`);
        if (at < 0) continue;
        const r = slip.result || {};
        paidStaff[at]++;
        cost.basic[at] += Number(r.basic || 0); cost.ot[at] += Number(r.ot || 0);
        cost.allowance[at] += (Array.isArray(r.allowances) ? r.allowances : []).reduce((sum: number, a: any) => sum + Number(a?.amount || 0), 0);
        for (const key of keys.slice(3)) cost[key][at] += Number(r[key] || 0);
      }
      const round = (value: number) => Math.round(value * 100) / 100;
      for (const key of keys) cost[key] = cost[key].map(round);
      const headcount = months.map((m) => (staff || []).filter((p: any) => p.join_date && p.join_date.slice(0, 7) <= m && (!p.resign_date || p.resign_date.slice(0, 7) >= m)).length);
      const joined = months.map((m) => (staff || []).filter((p: any) => p.join_date && p.join_date.slice(0, 7) === m).length);
      const left = months.map((m) => (staff || []).filter((p: any) => p.resign_date && p.resign_date.slice(0, 7) === m).length);
      return res.status(200).json({ months, cost, paidStaff, headcount, joined, left });
    }

    if (action === 'payroll_month' || action === 'payroll_save') {
      const year = Math.round(Number(req.query.year ?? body.year)), month = Math.round(Number(req.query.month ?? body.month));
      if (!(year >= 2020 && year <= 2100) || !(month >= 1 && month <= 12)) throw fail(400, 'Choose a month.');
      const context = await payrollContext(db, year, month, req.method === 'GET');
      // A month already paid (brought over from Infotech) lists only the staff who were paid in it.
      if (req.method === 'GET') return res.status(200).json({ year, month, asOf: context.asOf, comparison: context.comparison, staff: month <= context.baseMonth ? context.staff.filter((member: any) => member.payslip) : context.staff });
      if (req.method !== 'POST') throw fail(405, 'Method not allowed');
      const lock = body.lock === true;
      if (lock && context.comparison) throw fail(400, 'This month is only for comparison with Infotech and cannot be locked.');
      const items: { employeeId: string; inputs: any }[] = Array.isArray(body.items) ? body.items : [];
      const byId = new Map(context.staff.map((member: any) => [member.id, member]));
      const now = new Date().toISOString();
      const rows: any[] = [];
      for (const item of items) {
        const member: any = byId.get(String(item?.employeeId));
        if (!member) continue;
        if (member.payslip?.status === 'locked') throw fail(409, `${member.fullName}'s payslip for this month is already locked.`);
        const num = (value: unknown) => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
        const inputs: PayInputs = { ...NO_INPUTS, ot: num(item.inputs?.ot), restPh: num(item.inputs?.restPh), shiftAllowance: num(item.inputs?.shiftAllowance), unpaidLeave: num(item.inputs?.unpaidLeave), otherAllowance: num(item.inputs?.otherAllowance), otherDeduction: num(item.inputs?.otherDeduction), ot10: num(item.inputs?.ot10), ot15: num(item.inputs?.ot15), ot20: num(item.inputs?.ot20), ot30: num(item.inputs?.ot30), restDays: num(item.inputs?.restDays), phDays: num(item.inputs?.phDays), unpaidDays: num(item.inputs?.unpaidDays), annualLeaveDeduction: num(item.inputs?.annualLeaveDeduction) };
        const result = calculatePayslip({ basicSalary: member.basicSalary, fixedAllowances: member.fixedAllowances, maritalStatus: member.maritalStatus, spouseWorking: member.spouseWorking, children: member.children, settings: member.settings, joinDate: member.joinDate, resignDate: member.resignDate }, inputs, member.ytd, year, month);
        rows.push({ employee_id: member.id, year, month, status: lock ? 'locked' : 'draft', inputs, result, locked_at: lock ? now : null, updated_at: now });
      }
      if (lock) {
        const missing = context.staff.filter((member: any) => member.payslip?.status !== 'locked' && !rows.some((row) => row.employee_id === member.id));
        if (missing.length) throw fail(400, `Every staff member needs a payslip before the month is locked: ${missing.slice(0, 5).map((member: any) => member.employeeCode).join(', ')}${missing.length > 5 ? ' and more' : ''}.`);
      }
      if (rows.length) { const { error } = await db.from('hr_payslips').upsert(rows, { onConflict: 'employee_id,year,month' }); if (error) throw error; }
      return res.status(200).json({ saved: rows.length, locked: lock });
    }

    // Maybank2U bulk payment file for one company's pay of a month, in the layout Infotech produces (checked against the October file).
    if (req.method === 'GET' && action === 'payroll_bank') {
      // The same file is made for the confirmed incentive pay of a claim month (claimMonth=YYYY-MM), paid on the 16th, instead of a month's salary.
      const claimMonth = text(req.query.claimMonth, 7);
      const incentiveRun = /^\d{4}-\d{2}$/.test(claimMonth);
      const year = incentiveRun ? Number(claimMonth.slice(0, 4)) : Math.round(Number(req.query.year)), month = incentiveRun ? Number(claimMonth.slice(5, 7)) : Math.round(Number(req.query.month));
      const company = text(req.query.company, 2).toUpperCase();
      const valueDate = text(req.query.valueDate, 10);
      if (!(year >= 2020 && year <= 2100) || !(month >= 1 && month <= 12) || !['KJ', 'SK'].includes(company) || !isDate(valueDate)) throw fail(400, 'Choose the month, the company and the value date.');
      const { data: slips, error } = incentiveRun
        ? await db.from('hr_incentive_pay').select('employee_id,amount').eq('claim_month', claimMonth).then((read: any) => ({ data: (read.data || []).map((row: any) => ({ employee_id: row.employee_id, result: { net: Number(row.amount) } })), error: read.error }))
        : await db.from('hr_payslips').select('employee_id,status,result').eq('year', year).eq('month', month);
      if (error) throw fail(400, incentiveRun ? 'Incentive pay is not set up yet.' : 'Payslips are not set up yet.');
      const ids = (slips || []).map((row: any) => row.employee_id);
      const { data: people, error: peopleError } = ids.length ? await db.from('hr_employees').select('id,company,full_name,ic_no,passport_no,bank_name,bank_account').in('id', ids).eq('company', company) : { data: [], error: null };
      if (peopleError) throw peopleError;
      const slipOf = new Map((slips || []).map((row: any) => [row.employee_id, row]));
      // Maybank2U's bank names; only MAYBANK, RHB and HONG LEONG are checked against a real file so far.
      const KNOWN = ['MAYBANK', 'RHB', 'HONG LEONG', 'CIMB', 'AMBANK', 'BANK ISLAM'];
      const bankName = (name: string) => { const n = String(name || '').toUpperCase(); if (/MAYBANK|MALAYAN BANKING/.test(n)) return 'MAYBANK'; if (/RHB/.test(n)) return 'RHB'; if (/HONG LEONG/.test(n)) return 'HONG LEONG'; if (/CIMB/.test(n)) return 'CIMB'; if (/AM ?BANK|ARAB.?MALAYSIAN/.test(n)) return 'AMBANK'; if (/BANK ISLAM/.test(n)) return 'BANK ISLAM'; return n.replace(/\(.*?\)/g, '').replace(/\b(BERHAD|BHD)\b/g, '').replace(/\s+/g, ' ').trim(); };
      const csv = (value: unknown) => /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
      const [vy, vm, vd] = valueDate.split('-');
      const dd = `${vd}${vm}${vy.slice(2)}`;
      // As in Infotech's file: a six-digit batch number in the header; each row's reference is the date, the time and the first three digits of it.
      const batch = String(Math.floor(100000 + Math.random() * 900000));
      const clock = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 19).replace(/:/g, '');
      const lines = [['Employer Info :'], ['Crediting Date (eg. dd/MM/yyyy)', `${vd}/${vm}/${vy}`], ['Payment Reference', `MBPREF${batch}`], ['Payment Description', `MBPDEC${batch}`], ['Bulk Payment Type', 'Salary'], [''],
        ['Beneficiary Name', 'Beneficiary Bank', 'Beneficiary Account No', 'ID Type', 'ID Number', 'Payment Amount', 'Payment Reference', 'Payment Description']];
      const problems: string[] = []; let total = 0, count = 0;
      for (const person of (people || []).sort((a: any, b: any) => String(a.full_name).localeCompare(String(b.full_name)))) {
        const net = Math.round(Number((slipOf.get(person.id) as any)?.result?.net || 0) * 100) / 100;
        if (net <= 0) continue;
        const account = String(person.bank_account || '').replace(/\D/g, ''), ic = String(person.ic_no || '').replace(/\D/g, '');
        const bank = bankName(person.bank_name);
        if (!account || !bank) { problems.push(`${person.full_name}: bank account missing`); continue; }
        if (!KNOWN.includes(bank)) problems.push(`${person.full_name}: bank "${bank}" is not checked against a Maybank2U file yet`);
        const idType = ic.length === 12 ? 'NRIC' : 'PASSPORT', idNumber = ic.length === 12 ? ic : String(person.passport_no || '').trim();
        if (!idNumber) problems.push(`${person.full_name}: no IC or passport number`);
        lines.push([String(person.full_name).slice(0, 40).trim(), bank, account, idType, idNumber, net.toFixed(2), `PRE${dd}${clock}${batch.slice(0, 3)}`, `PDC${dd}${clock}${batch.slice(0, 3)}`]);
        total += net; count++;
      }
      const body = lines.map((row) => { const cells = [...row, ...Array(Math.max(0, 8 - row.length)).fill('')]; return cells.map(csv).join(','); }).join('\r\n');
      return res.status(200).json({ file: `${incentiveRun ? 'MaybankInc' : 'MaybankSal'}_${company}_${year}-${String(month).padStart(2, '0')}.csv`, csv: body, count, total: Math.round(total * 100) / 100, problems });
    }

    // Files for the portals: KWSP Form A, PERKESO / EIS / SKBBK and ePCB, one company at a time, from the month's payslips.
    if (req.method === 'GET' && action === 'payroll_file') {
      const year = Math.round(Number(req.query.year)), month = Math.round(Number(req.query.month));
      const company = text(req.query.company, 2).toUpperCase(), kind = text(req.query.kind, 8);
      if (!(year >= 2020 && year <= 2100) || !(month >= 1 && month <= 12) || !['KJ', 'SK'].includes(company) || !['epf', 'socso', 'epcb'].includes(kind)) throw fail(400, 'Choose the month, the company and the file.');
      const [{ data: employer, error: employerError }, { data: slips, error: slipError }] = await Promise.all([
        db.from('hr_employer_details').select('epf_no,socso_no,employer_e_no,company_reg_no').eq('key', 'group').maybeSingle(),
        db.from('hr_payslips').select('employee_id,result').eq('year', year).eq('month', month),
      ]);
      if (employerError || slipError) throw fail(400, 'Payroll files are not set up yet (migration 202611020007).');
      if (!employer) throw fail(400, "The employer's statutory numbers have not been entered yet.");
      const ids = (slips || []).map((row: any) => row.employee_id);
      const { data: people, error: peopleError } = ids.length ? await db.from('hr_employees').select('id,employee_code,full_name,ic_no,epf_no,tax_no,payroll_settings').in('id', ids).eq('company', company) : { data: [], error: null };
      if (peopleError) throw peopleError;
      const slipOf = new Map((slips || []).map((row: any) => [row.employee_id, row.result || {}]));
      const problems: string[] = [];
      const name = (person: any) => String(person.full_name || '').toUpperCase();
      // Infotech's "Employee EPF Name" (for example BT for BINTI) goes in the KWSP, PERKESO and ePCB files when it differs from the full name.
      const epfName = (person: any) => String(person.payroll_settings?.epfName || '').toUpperCase() || name(person);
      const rows = (people || []).map((person: any) => ({ person, r: slipOf.get(person.id) as any })).filter((item: any) => item.r && item.r.gross > 0);
      // Months brought over from Infotech keep the totals but not the KWSP and PERKESO wages, so they are worked out from the slip the way the pay run
      // does: KWSP counts basic, rest/PH, shift and Care Coordinator pay; PERKESO counts everything except Director Fee, ECC, leave payment, advance, incentives and notice pay.
      const sumOf = (r: any, names: string[]) => (r.allowances || []).filter((a: any) => names.includes(a.name)).reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0);
      for (const item of rows as any[]) {
        const r = item.r; if (!r) continue;
        if (typeof r.kwspWage !== 'number') r.kwspWage = Math.round((Number(r.basic || 0) + Number(r.restPh || 0) + sumOf(r, ['Shift allowance', 'Allowance Care Coordinator'])) * 100) / 100;
        if (typeof r.socsoWage !== 'number') r.socsoWage = Math.round((Number(r.gross || 0) - sumOf(r, ['Director Fee', 'Allowance Care Coordinator', 'Annual Leave Payment', 'Advance', 'Incentives', 'Tuntutan Ganti Notis'])) * 100) / 100;
      }
      if (!rows.length) throw fail(400, `No payslips saved for ${company} in this month.`);
      const now = new Date(Date.now() + 8 * 3600 * 1000);
      const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
      const mmyyyy = (y: number, m: number) => `${String(m).padStart(2, '0')}${y}`;
      let content = '', file = '';
      if (kind === 'epf') {
        for (const { person } of rows) { if (!String(person.epf_no || '').replace(/\D/g, '')) problems.push(`${name(person)}: no KWSP number`); if (String(person.ic_no || '').replace(/\D/g, '').length !== 12) problems.push(`${name(person)}: IC is not 12 digits`); }
        const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
        content = epfFormA({ employerEpfNo: employer.epf_no, generated: stamp, contributionMonth: mmyyyy(next.y, next.m), rows: rows.map(({ person, r }: any) => ({ memberNo: person.epf_no, ic: person.ic_no, name: epfName(person), code: person.employee_code, employer: r.kwspEmployer, employee: r.kwspEmployee, wages: r.kwspWage })) });
        file = `EPF_${digits9(employer.epf_no)}_${stamp.slice(6)}${stamp.slice(4, 6)}${stamp.slice(0, 4)}.txt`;
      } else if (kind === 'socso') {
        for (const { person } of rows) if (String(person.ic_no || '').replace(/\D/g, '').length !== 12) problems.push(`${name(person)}: IC is not 12 digits`);
        content = socsoFile({ employerSocsoNo: employer.socso_no, companyRegNo: employer.company_reg_no, wageMonth: mmyyyy(year, month), rows: rows.map(({ person, r }: any) => ({ ic: person.ic_no, name: epfName(person), wages: r.socsoWage, socsoEmployer: r.socsoEmployer, socsoEmployee: r.socsoEmployee, eisEmployer: r.eisEmployer, eisEmployee: r.eisEmployee, skbbk: r.skbbk })) });
        file = `${employer.socso_no}_${mmyyyy(year, month)}.txt`;
      } else {
        // The ePCB reference is Infotech's "LHDN EmployeeCode" (for example IG28758028) when one is set, otherwise the staff code.
        const list = rows.map(({ person, r }: any) => ({ taxNo: person.tax_no, name: epfName(person), ic: person.ic_no, pcb: r.pcb, code: String(person.payroll_settings?.lhdnEmployeeCode || '') || person.employee_code }));
        for (const item of list) if (String(item.taxNo || '').replace(/\D/g, '').length < 10) problems.push(`${item.name}: income tax number missing or short`);
        list.sort((a: any, b: any) => String(a.taxNo || '').replace(/\D/g, '').localeCompare(String(b.taxNo || '').replace(/\D/g, '')));
        content = epcbFile({ employerENo: employer.employer_e_no, year, month, rows: list });
        file = `${String(employer.employer_e_no).replace(/\D/g, '')}${String(month).padStart(2, '0')}_${year}.txt`;
      }
      return res.status(200).json({ file, content, count: rows.length, problems });
    }

    // Incentive pay. The approved claims HR has received for a month, one amount per person; HR confirms them for payment on the 16th of the next month.
    if (action === 'payroll_incentive' || action === 'payroll_incentive_confirm') {
      const month = text(req.query.month ?? body.month, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) throw fail(400, 'Choose a month.');
      const { data: claims, error: claimError } = await db.from('incentive_claims').select('staff_id,entries,hr_received_at').eq('month', month).not('hr_submitted_at', 'is', null);
      if (claimError) { if (claimError.code === '42703') throw fail(400, 'Incentive claims are not set up yet.'); throw claimError; }
      const staffIds = [...new Set((claims || []).map((row: any) => row.staff_id))];
      const { data: people, error: peopleError } = staffIds.length ? await db.from('hr_employees').select('id,assessment_staff_id,employee_code,full_name,company,bank_name,bank_account').in('assessment_staff_id', staffIds) : { data: [], error: null };
      if (peopleError) throw peopleError;
      const personOf = new Map((people || []).map((row: any) => [row.assessment_staff_id, row]));
      const { data: paid, error: paidError } = await db.from('hr_incentive_pay').select('employee_id,amount,paid_on').eq('claim_month', month);
      if (paidError) throw fail(400, 'Incentive pay is not set up yet (migration 202611020006).');
      const paidOf = new Map((paid || []).map((row: any) => [row.employee_id, row]));
      const [year, number] = month.split('-').map(Number);
      const paidOn = `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, '0')}-16`;
      const items = (claims || []).map((row: any) => {
        const person: any = personOf.get(row.staff_id);
        const approved = (Array.isArray(row.entries) ? row.entries : []).filter((entry: any) => entry?.review === 'approved');
        const amount = Math.round(approved.reduce((sum: number, entry: any) => sum + Number(entry.rm || 0), 0) * 100) / 100;
        const done: any = person ? paidOf.get(person.id) : null;
        return { employeeId: person?.id || '', code: person?.employee_code || '', name: person?.full_name || '', company: person?.company || '', bankName: person?.bank_name || '', bankAccount: person?.bank_account || '', linked: Boolean(person), received: Boolean(row.hr_received_at), procedures: approved.length, amount, confirmed: Boolean(done), confirmedAmount: done ? Number(done.amount) : null };
      }).sort((a: any, b: any) => a.code.localeCompare(b.code));
      if (req.method === 'GET') return res.status(200).json({ month, paidOn, items });
      if (req.method !== 'POST') throw fail(405, 'Method not allowed');
      const rows = items.filter((item: any) => item.linked && item.received && !item.confirmed && item.amount > 0).map((item: any) => ({ employee_id: item.employeeId, claim_month: month, amount: item.amount, procedures: item.procedures, paid_on: paidOn, confirmed_by: text(user?.email || '', 120) }));
      if (rows.length) { const { error } = await db.from('hr_incentive_pay').insert(rows); if (error) throw error; }
      return res.status(200).json({ confirmed: rows.length, paidOn });
    }

    // The months already paid for one person (HR only): what Infotech paid before AraOffice, and what AraOffice has locked since.
    if (req.method === 'GET' && action === 'payroll_history') {
      const employeeId = text(req.query.employeeId, 60);
      if (!employeeId) throw fail(400, 'Choose a staff member.');
      const { data, error } = await db.from('hr_payslips').select('year,month,status,result').eq('employee_id', employeeId).eq('status', 'locked').order('year', { ascending: false }).order('month', { ascending: false }).limit(60);
      if (error) { if (error.code === '42P01') return res.status(200).json({ months: [] }); throw error; }
      return res.status(200).json({ months: (data || []).map((row: any) => ({ year: row.year, month: row.month, source: row.result?.source || 'AraOffice', gross: Number(row.result?.gross || 0), kwsp: Number(row.result?.kwspEmployee || 0), perkeso: Number(row.result?.socsoEmployee || 0), eis: Number(row.result?.eisEmployee || 0), pcb: Number(row.result?.pcb || 0), net: Number(row.result?.net || 0) })) });
    }

    if (req.method === 'GET' && action === 'career') {
      const employeeId = text(req.query.employeeId, 60);
      if (!employeeId) throw fail(400, 'Choose a staff member.');
      const { data, error } = await db.from('hr_career_history').select('id,event_date,kind,detail,from_value,to_value,amount,source').eq('employee_id', employeeId).order('event_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(300);
      if (error) { if (error.code === '42P01') return res.status(200).json({ entries: [], notSetUp: true }); throw error; }
      return res.status(200).json({ entries: (data || []).map((row: any) => ({ id: row.id, date: row.event_date, kind: row.kind, detail: row.detail, from: row.from_value, to: row.to_value, amount: row.amount === null ? null : Number(row.amount), source: row.source })) });
    }

    // Documents on a staff profile: HR sees every one, and can add or remove any.
    if (action === 'documents' || action.startsWith('document_')) {
      const employeeId = text(req.query.employeeId || body.employeeId, 60);
      if (!employeeId) throw fail(400, 'Choose a staff member.');
      if (req.method === 'GET' && action === 'documents') return res.status(200).json({ documents: await listDocuments(db, employeeId) });
      if (req.method === 'POST' && action === 'document_upload') {
        const doc = await addDocument(db, { employeeId, kind: body.kind, fileName: body.name, base64: body.data, uploadedBy: 'hr' });
        await db.from('hr_audit').insert({ employee_id: employeeId, action: 'update', changes: { documents: ['', `added ${doc.name}`] }, changed_by: user.id });
        return res.status(200).json({ document: doc });
      }
      if (req.method === 'GET' && action === 'document_open') return res.status(200).json({ url: await documentLink(db, await ownedDocument(db, employeeId, req.query.id), req.query.download === '1') });
      if (req.method === 'POST' && action === 'document_delete') {
        const row = await ownedDocument(db, employeeId, body.id);
        await removeDocument(db, row);
        await db.from('hr_audit').insert({ employee_id: employeeId, action: 'update', changes: { documents: [`removed ${row.file_name}`, ''] }, changed_by: user.id });
        return res.status(200).json({ ok: true });
      }
    }

    // Staff asking HR to change their own details (from Individual Sign In). `profile_requests` lists what waits and what was decided;
    // `profile_request_decide` approves (the details change, and it is written to the profile's recent changes) or rejects.
    if (req.method === 'GET' && action === 'profile_requests') {
      const { data, error } = await db.from('hr_profile_requests').select('id,employee_id,changes,status,requested_at,decided_at,decision_note').order('requested_at', { ascending: false }).limit(120);
      if (error) { if (error.code === '42P01') return res.status(200).json({ pending: 0, requests: [], notSetUp: true }); throw error; }
      const ids = [...new Set((data || []).map((row: any) => row.employee_id))];
      const { data: people } = ids.length ? await db.from('hr_employees').select('id,company,employee_code,full_name').in('id', ids) : { data: [] };
      const who = new Map((people || []).map((p: any) => [p.id, p]));
      const requests = (data || []).map((row: any) => { const p: any = who.get(row.employee_id); return { id: row.id, name: p?.full_name || '', company: p?.company || '', code: p?.employee_code || '', status: row.status, changes: row.changes || {}, requestedAt: row.requested_at, decidedAt: row.decided_at, note: row.decision_note || '' }; });
      return res.status(200).json({ pending: requests.filter((r: any) => r.status === 'pending').length, requests });
    }
    if (req.method === 'POST' && action === 'profile_request_decide') {
      const id = text(body.id, 60), approve = body.approve === true, note = text(body.note, 300);
      const { data: request, error } = await db.from('hr_profile_requests').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!request) throw fail(404, 'Request not found.');
      if (request.status !== 'pending') throw fail(409, 'This request has already been decided.');
      if (approve) {
        const { data: person, error: personError }: { data: any; error: any } = await (db as any).from('hr_employees').select(REQUEST_SELECT).eq('id', request.employee_id).maybeSingle();
        if (personError) throw personError;
        if (!person) throw fail(404, 'The staff profile no longer exists.');
        const patch = patchFrom(person, request.changes || {});
        const { error: updateError } = await db.from('hr_employees').update({ ...patch, updated_at: now }).eq('id', request.employee_id);
        if (updateError) throw updateError;
        const changes: Record<string, unknown> = {}; for (const [column, change] of Object.entries(request.changes || {}) as [string, any][]) changes[column] = [change.from, change.to];
        const { error: auditError } = await db.from('hr_audit').insert({ employee_id: request.employee_id, action: 'update', changes: { ...changes, source: ['', 'Staff request'] }, changed_by: user.id });
        if (auditError) throw auditError;
      }
      const { error: decideError } = await db.from('hr_profile_requests').update({ status: approve ? 'approved' : 'rejected', decided_by: user.id, decided_at: now, decision_note: note }).eq('id', id);
      if (decideError) throw decideError;
      return res.status(200).json({ success: true });
    }

    // One day changed on screen by HR. It is saved and written to the audit log (who, when, before, after, and an optional
    // reason). An empty code clears the day, so the person's usual working weekdays apply again.
    if (req.method === 'POST' && action === 'roster_set') {
      const ROSTER_CODES = new Set(['AM-9', 'AM-12', 'AM-6', 'AM-5', 'PM', 'OFF', 'REST', 'AM', 'OH', 'PH', 'NA', 'RESIGN', 'AL', 'UPL', 'MC']);
      const employeeId = text(body.employeeId, 60), date = text(body.date, 10), reason = text(body.reason, 200);
      const shift = text(body.shift, 30).toUpperCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail(400, 'Choose a valid date.');
      if (shift && !ROSTER_CODES.has(shift)) throw fail(400, 'Choose a roster code from the list.');
      const { data: person, error: personError } = await db.from('hr_employees').select('id').eq('id', employeeId).maybeSingle();
      if (personError) throw personError;
      if (!person) throw fail(404, 'Profile not found.');
      const { data: before, error: beforeError } = await db.from('hr_roster').select('shift').eq('employee_id', employeeId).eq('work_date', date).maybeSingle();
      if (beforeError) throw beforeError;
      if ((before?.shift || '') === shift) throw fail(400, 'That is already the code for this day.');
      if (shift) {
        const works = !['OFF', 'REST', 'PH', 'NA', 'RESIGN', 'AL', 'UPL', 'MC'].includes(shift);
        const { error } = await db.from('hr_roster').upsert({ employee_id: employeeId, work_date: date, shift, works, note: ['AL', 'UPL', 'MC'].includes(shift) ? shift : '' }, { onConflict: 'employee_id,work_date' });
        if (error) throw error;
      } else {
        const { error } = await db.from('hr_roster').delete().eq('employee_id', employeeId).eq('work_date', date);
        if (error) throw error;
      }
      const { error: auditError } = await db.from('hr_audit').insert({ employee_id: employeeId, action: 'roster', changes: { [`roster_${date}`]: [before?.shift || '', shift], ...(reason ? { roster_reason: ['', reason] } : {}) }, changed_by: user.id });
      if (auditError) throw auditError;
      return res.status(200).json({ success: true });
    }
    // The changes made on screen for a month, newest first.
    if (req.method === 'GET' && action === 'roster_log') {
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : '';
      if (!month) throw fail(400, 'Choose a month.');
      const { data, error } = await db.from('hr_audit').select('employee_id,changes,changed_by,changed_at').eq('action', 'roster').order('changed_at', { ascending: false }).limit(400);
      if (error) throw error;
      const rows = (data || []).filter((row: any) => Object.keys(row.changes || {}).some((key) => key.startsWith(`roster_${month}`)));
      const peopleIds = [...new Set(rows.map((row: any) => row.employee_id).filter(Boolean))], userIds = [...new Set(rows.map((row: any) => row.changed_by).filter(Boolean))];
      const [{ data: people }, { data: users }] = await Promise.all([
        peopleIds.length ? db.from('hr_employees').select('id,company,employee_code,full_name').in('id', peopleIds) : { data: [] },
        userIds.length ? db.from('profiles').select('id,full_name').in('id', userIds) : { data: [] },
      ]);
      const who = new Map((people || []).map((p: any) => [p.id, p])), by = new Map((users || []).map((u: any) => [u.id, u.full_name]));
      const log = rows.flatMap((row: any) => Object.keys(row.changes).filter((key) => key.startsWith(`roster_${month}`)).map((key) => { const [from, to] = row.changes[key] || ['', '']; const p: any = who.get(row.employee_id); return { at: row.changed_at, by: by.get(row.changed_by) || '', name: p?.full_name || '', company: p?.company || '', code: p?.employee_code || '', date: key.slice(7), from, to, reason: row.changes.roster_reason?.[1] || '' }; }));
      return res.status(200).json({ log: log.sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)) || a.date.localeCompare(b.date)).slice(0, 300) });
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
        const same = (key: string, value: unknown) => key === 'basic_salary' ? Number((before as any)[key]) === value : canonical((before as any)[key] ?? null) === canonical(value ?? null);
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
