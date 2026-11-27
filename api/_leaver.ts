import { pdfFormWaiting } from './_pdf-forms.js';
import { hiddenPayslips, monthKey } from './_payslip-hidden.js';
import { payPeriod } from '../src/lib/payrollRun.js';

// Staff who have left. After the last working day the sign-in stays open for what they still need (their forms and payslips); every other part is closed.
// The sign-in is switched off by itself once their forms are filled and the last payslip has been out for 14 days.
export const PAYSLIP_DAYS = 14;
export const LEAVER_ACTIONS = /^(me|set_password|my_photo|my_payslips|my_payslip|verify_password|announcements|announcement_read|pdfform_[a-z_]+|flu_form[a-z_]*)$/;
type Person = { id: string; status: string; resign_date: string | null };
const malaysiaToday = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
export const hasLeft = (person: { status: string; resign_date: string | null }, today = malaysiaToday()) => person.status === 'Inactive' || Boolean(person.resign_date && person.resign_date < today);
// The pay run that holds the last working day (a pay period ends on the 19th).
export function lastPayMonth(resignDate: string) {
  let year = Number(resignDate.slice(0, 4)), month = Number(resignDate.slice(5, 7));
  if (resignDate > payPeriod(year, month).to) { month += 1; if (month > 12) { month = 1; year += 1; } }
  return { year, month };
}
export const canClose = (state: { formsCompleted: number; formsWaiting: number; payslipLockedAt: string | null }, now = Date.now()) =>
  state.formsCompleted > 0 && state.formsWaiting === 0 && Boolean(state.payslipLockedAt) && now - Date.parse(state.payslipLockedAt!) >= PAYSLIP_DAYS * 86400000;

// Read at most once a minute for each sign-in, so it adds almost nothing to the requests.
const cache = new Map<string, { at: number; person: Person | null }>();
export async function leaverOf(db: any, assessmentStaffId: string): Promise<Person | null> {
  const saved = cache.get(assessmentStaffId);
  if (saved && Date.now() - saved.at < 60000) return saved.person;
  const { data, error } = await db.from('hr_employees').select('id,status,resign_date').eq('assessment_staff_id', assessmentStaffId).limit(5);
  if (error) throw error;
  // Someone with a record that is still current (a rehire) has not left.
  const rows: Person[] = data || [], person = rows.length && rows.every((row) => hasLeft(row)) ? rows[0] : null;
  if (cache.size > 500) cache.clear();
  cache.set(assessmentStaffId, { at: Date.now(), person });
  return person;
}
// Switches the sign-in off when everything is finished. Anything that cannot be read leaves it open.
export async function closeIfFinished(db: any, assessmentStaffId: string, person: Person) {
  if (!person.resign_date) return false;
  const { year, month } = lastPayMonth(person.resign_date);
  const [forms, slip, waiting] = await Promise.all([
    db.from('hr_pdf_form_cases').select('id').eq('employee_id', person.id).eq('status', 'completed').limit(1),
    db.from('hr_payslips').select('locked_at').eq('employee_id', person.id).eq('year', year).eq('month', month).eq('status', 'locked').maybeSingle(),
    pdfFormWaiting(db, assessmentStaffId),
  ]);
  if (forms.error || slip.error || !canClose({ formsCompleted: (forms.data || []).length, formsWaiting: waiting, // a final payslip still held back from staff keeps the sign-in open
    payslipLockedAt: (await hiddenPayslips(db)).has(monthKey(year, month)) ? null : slip.data?.locked_at || null })) return false;
  const { error } = await db.from('assessment_staff').update({ active: false, updated_at: new Date().toISOString() }).eq('id', assessmentStaffId);
  if (error) return false;
  await db.from('assessment_sessions').delete().eq('staff_id', assessmentStaffId);
  return true;
}
