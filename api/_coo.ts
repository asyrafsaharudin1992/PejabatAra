import { errorReply, officeAccess } from './_office-db.js';
import { Employee, TEAM_COLUMNS, teamDailyRows } from './_attendance.js';
import { careClaimsToReview, reviewCare } from './_care.js';

// Office COO: the COO leads Clinical Admin and the Clinical Assistants. The team is every active staff member whose job title is Clinical
// Assistant (or Officer), Admin Clinical or Admin Assistant, never a doctor. Read only: HR still decides leave, OT and pay.
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const TEAM_TITLE = /CLINIC(AL)? ASSISTANT|ADMIN CLINICAL|ADMIN ASSISTANT/i;
const group = (designation: string) => /ADMIN/i.test(designation) && !/ASSISTANT OFFICER/i.test(designation) ? 'Clinical Admin' : 'Clinical Assistant';

async function team(db: any) {
  const { data, error } = await db.from('hr_employees').select(`${TEAM_COLUMNS},branch`).eq('status', 'Active').order('full_name').limit(500);
  if (error) throw error;
  return ((data || []) as (Employee & { branch?: string })[]).filter((person) => TEAM_TITLE.test(person.designation || '') && !/\b(DR|DOCTOR)\b/i.test(person.designation || ''));
}

export async function cooHandler(req: any, res: any) {
  try {
    const { db } = await officeAccess(req, false, 'coo');
    const action = String(req.query?.action || '');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);

    // AraCare claims (Care Coordination Allowance) for the COO's check of the KPIs. A payable claim goes straight to HR (not through Clinical Admin).
    if (req.method === 'GET' && action === 'care') return res.status(200).json(await careClaimsToReview(db));
    if (req.method === 'POST' && action === 'care_review') { await reviewCare(db, body); return res.status(200).json({ success: true }); }
    if (req.method !== 'GET') throw fail(405, 'Method not allowed.');

    // Everyone in the team with how the day looks for them.
    if (action === 'team') {
      const date = isDate(req.query.date) ? String(req.query.date) : today();
      const people = await team(db);
      const rows = await teamDailyRows(db, people, date);
      const extra = new Map(people.map((person) => [person.id, { branch: person.branch || '', group: group(person.designation || '') }]));
      return res.status(200).json({ date, today: today(), rows: rows.map((row: any) => ({ ...row, ...extra.get(row.id) })) });
    }

    // Leave of the team: what is waiting and what is coming up (from yesterday on).
    if (action === 'leave') {
      const people = await team(db);
      const names = new Map(people.map((person) => [person.id, { name: person.full_name, code: person.employee_code, group: group(person.designation || '') }]));
      const from = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
      const { data, error } = await db.from('hr_leave_requests').select('id,employee_id,leave_type,start_date,end_date,half_day,days,status,reason').in('employee_id', people.map((person) => person.id)).not('status', 'in', '(rejected,cancelled)').gte('end_date', from).order('start_date').limit(500);
      if (error) throw error;
      return res.status(200).json({ today: today(), leave: (data || []).map((row: any) => ({ id: row.id, ...names.get(row.employee_id), type: row.leave_type, start: row.start_date, end: row.end_date, halfDay: Boolean(row.half_day), days: Number(row.days || 0), status: row.status, reason: row.reason || '' })) });
    }
    throw fail(404, 'Unknown request.');
  } catch (error: any) {
    return errorReply(res, error, 'Unable to complete this request.');
  }
}
