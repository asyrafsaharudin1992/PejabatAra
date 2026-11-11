import { randomBytes } from 'node:crypto';
import { branchId, errorReply, officeAccess } from './_office-db.js';
import { Employee, TEAM_COLUMNS } from './_attendance.js';
import { careClaimsToReview, reviewCare, isCooTitle } from './_care.js';
import { leaveAction, reviewAction } from './_assessment.js';
import { attendanceHrAction, attendanceStaffAction } from './_attendance.js';
import { hrCalendarAction } from './_hr-calendar.js';

// Office COO: the COO leads operations: Clinical Admin, the Clinical Assistants and the doctors. The team is every active staff member whose job title is
// Clinical Assistant (or Officer), Admin Clinical or Admin Assistant, and every doctor except those who hold a chief title (CEO, COO, CHRO).
// Read only: HR still decides leave, OT and pay.
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const TEAM_TITLE = /CLINIC(AL)? ASSISTANT|ADMIN CLINICAL|ADMIN ASSISTANT/i;
const isDoctor = (designation: string) => /\b(DR|DOCTOR)\b/i.test(designation || '');
const CHIEF = /^\s*(CEO|COO|CHRO)\b/i;
const group = (designation: string) => isDoctor(designation) ? 'Doctor' : /ADMIN/i.test(designation) && !/ASSISTANT OFFICER/i.test(designation) ? 'Clinical Admin' : 'Clinical Assistant';

async function team(db: any) {
  const { data, error } = await db.from('hr_employees').select(`${TEAM_COLUMNS},branch`).eq('status', 'Active').order('full_name').limit(500);
  if (error) throw error;
  return ((data || []) as (Employee & { branch?: string })[]).filter((person) => isDoctor(person.designation || '') ? !CHIEF.test(person.designation || '') : TEAM_TITLE.test(person.designation || ''));
}

export async function cooHandler(req: any, res: any) {
  try {
    const { db, user } = await officeAccess(req, false, 'coo');
    const action = String(req.query?.action || '');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);

    // The COO's own calendar and reminders (kept apart from HR's).
    if (action.startsWith('calendar_')) return await hrCalendarAction(req, res, db, user, action, body, 'coo');

    // Leave the COO has to approve (as a supervisor): the same requests and the same rules as in their Individual Sign In.
    if (action === 'leave_approvals' || action === 'leave_decide' || action === 'leave_attachment_url') {
      const { data: heads, error } = await db.from('hr_employees').select('id,designation,assessment_staff_id').eq('status', 'Active');
      if (error) throw error;
      const coo = (heads || []).find((person: any) => isCooTitle(person.designation) && person.assessment_staff_id);
      if (!coo) throw fail(403, 'The COO sign-in is not linked to a staff record yet. Ask HR.');
      return await leaveAction(req, res, db, { id: coo.assessment_staff_id }, action, body);
    }

    // Today and month attendance of the COO's own team: read only (the clock details stay with HR).
    if (req.method === 'GET' && (action === 'attendance_daily' || action === 'attendance_month')) {
      return await attendanceHrAction(req, res, db, action, body, 'coo', new Set((await team(db)).map((person) => person.id)));
    }

    // OT and forgotten-clock requests that wait for the COO's approval (the same as in their Individual Sign In).
    if (action === 'attendance_request_approvals' || action === 'attendance_request_decide') {
      const { data: heads, error } = await db.from('hr_employees').select('id,designation,assessment_staff_id').eq('status', 'Active');
      if (error) throw error;
      const coo = (heads || []).find((person: any) => isCooTitle(person.designation) && person.assessment_staff_id);
      if (!coo) throw fail(403, 'The COO sign-in is not linked to a staff record yet. Ask HR.');
      return await attendanceStaffAction(req, res, db, { id: coo.assessment_staff_id }, action, body);
    }

    // Performance Review: the reviews HR has given to the COO (the person, from their staff record), the same ones as in their Individual Sign In.
    if (action.startsWith('review_')) {
      const { data: heads, error } = await db.from('hr_employees').select('id,designation,assessment_staff_id').eq('status', 'Active');
      if (error) throw error;
      const coo = (heads || []).find((person: any) => isCooTitle(person.designation) && person.assessment_staff_id);
      if (!coo) throw fail(403, 'The COO sign-in is not linked to a staff record yet. Ask HR.');
      return await reviewAction(req, res, db, { id: coo.assessment_staff_id }, action, body);
    }

    // The staff directory (names, codes, job titles, clinic): no private details.
    if (req.method === 'GET' && action === 'directory') {
      const { data, error } = await db.from('hr_employees').select('id,full_name,employee_code,company,designation,department,status,join_date').eq('status', 'Active').order('full_name').limit(500);
      if (error) throw error;
      return res.status(200).json({ people: (data || []).map((row: any) => ({ id: row.id, fullName: row.full_name, employeeCode: row.employee_code, company: row.company, designation: row.designation || '', department: row.department || '', status: row.status, joinDate: row.join_date || null })) });
    }

    // Contact staff (WhatsApp) for the COO's own team. The template and the record are the COO's own, apart from HR's. Phone numbers are never recorded in the log.
    if (action === 'contact_people' || action === 'contact_message' || action === 'contact_message_save' || action === 'contact_log' || action === 'contact_log_add') {
      const KEY = 'coo_contact_message', LOG_KEY = 'coo_contact_log', COO_BRANCH = 'AraOffice COO Private', now = new Date().toISOString();
      if (action === 'contact_people') {
        const ids = (await team(db)).map((person: any) => person.id);
        const { data, error } = await db.from('hr_employees').select('id,full_name,employee_code,company,designation,phone,whatsapp_username').in('id', ids);
        if (error) throw error;
        return res.status(200).json({ people: (data || []).map((row: any) => ({ id: row.id, fullName: row.full_name, employeeCode: row.employee_code, company: row.company, designation: row.designation || '', status: 'Active', phone: row.phone || '', whatsappUsername: row.whatsapp_username || '' })) });
      }
      let branch: string | null;
      try { branch = await branchId(db, COO_BRANCH, req.method === 'POST'); }
      catch (cause) { if ((cause as any)?.code !== '23505') throw cause; branch = await branchId(db, COO_BRANCH, false); }
      if (action === 'contact_log' || action === 'contact_log_add') {
        const read = branch ? await db.from('portal_state').select('payload').eq('branch_id', branch).eq('state_key', LOG_KEY).maybeSingle() : { data: null, error: null };
        if (read.error) throw read.error;
        const entries: any[] = Array.isArray(read.data?.payload?.entries) ? read.data.payload.entries : [];
        if (action === 'contact_log') return res.status(200).json({ entries });
        if (req.method !== 'POST') throw fail(405, 'Method not allowed.');
        const message = text(body.message, 3001);
        if (!message || message.length > 3000) throw fail(400, 'The message is empty or too long.');
        if (!branch) throw fail(500, 'The settings are not ready yet.');
        const recipients = (Array.isArray(body.recipients) ? body.recipients : []).slice(0, 300).map((r: any) => ({ name: text(r?.name, 120), code: text(r?.code, 30) })).filter((r: any) => r.name);
        if (!recipients.length) throw fail(400, 'No recipients.');
        const entry = { id: `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`, at: now, by: text((user as any)?.email, 120), message, recipients };
        const { error } = await db.from('portal_state').upsert({ branch_id: branch, state_key: LOG_KEY, payload: { entries: [entry, ...entries].slice(0, 100) }, updated_by: user.id, updated_at: now }, { onConflict: 'branch_id,state_key' });
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
      if (req.method === 'GET' && action === 'contact_message') {
        if (!branch) return res.status(200).json({ message: '' });
        const { data, error } = await db.from('portal_state').select('payload').eq('branch_id', branch).eq('state_key', KEY).maybeSingle();
        if (error) throw error;
        return res.status(200).json({ message: String(data?.payload?.message || '') });
      }
      if (req.method !== 'POST') throw fail(405, 'Method not allowed.');
      const message = text(body.message, 3001);
      if (!message || message.length > 3000) throw fail(400, 'Write the message (up to 3000 characters).');
      if (!branch) throw fail(500, 'The settings are not ready yet.');
      const { error } = await db.from('portal_state').upsert({ branch_id: branch, state_key: KEY, payload: { message }, updated_by: user.id, updated_at: now }, { onConflict: 'branch_id,state_key' });
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    // AraCare claims (Care Coordination Allowance) for the COO's check of the KPIs. A payable claim goes straight to HR (not through Clinical Admin).
    if (req.method === 'GET' && action === 'care') return res.status(200).json(await careClaimsToReview(db));
    if (req.method === 'POST' && action === 'care_review') { await reviewCare(db, body); return res.status(200).json({ success: true }); }
    if (req.method !== 'GET') throw fail(405, 'Method not allowed.');

    // Public holidays of the month (read only), for the leave calendar.
    if (req.method === 'GET' && action === 'holidays') {
      const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month)) ? String(req.query.month) : today().slice(0, 7);
      const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
      const { data, error } = await db.from('hr_holidays').select('group_code,holiday_date,name').gte('holiday_date', `${month}-01`).lte('holiday_date', last).order('holiday_date').limit(200);
      if (error) throw error;
      return res.status(200).json({ holidays: (data || []).map((row: any) => ({ group: row.group_code, date: row.holiday_date, name: row.name })) });
    }

    // Who is on leave in a month: every active staff member with approved leave (and leave still waiting), for the schedule table.
    if (req.method === 'GET' && action === 'leave_schedule') {
      const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month)) ? String(req.query.month) : today().slice(0, 7);
      const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
      const { data: rows, error } = await db.from('hr_leave_requests').select('employee_id,leave_type,start_date,end_date,half_day,days,status').in('status', ['approved', 'pending', 'supervisor_approved']).lte('start_date', last).gte('end_date', `${month}-01`).limit(1000);
      if (error) throw error;
      const ids = [...new Set((rows || []).map((row: any) => row.employee_id))];
      const { data: people, error: peopleError } = ids.length ? await db.from('hr_employees').select('id,full_name,employee_code,company,designation,assessment_staff_id').in('id', ids).limit(500) : { data: [], error: null };
      if (peopleError) throw peopleError;
      const linked = (people || []).map((person: any) => person.assessment_staff_id).filter(Boolean);
      const { data: logins } = linked.length ? await db.from('assessment_staff').select('id,name').in('id', linked) : { data: [] };
      const shortOf = new Map((logins || []).map((login: any) => [login.id, String(login.name || '')]));
      const members = new Set((await team(db)).map((person) => person.id));
      const named = new Map((people || []).map((person: any) => [person.id, person]));
      return res.status(200).json({ month, today: today(), items: (rows || []).filter((row: any) => named.has(row.employee_id)).map((row: any) => { const person: any = named.get(row.employee_id); return { id: person.id, name: person.full_name, short: shortOf.get(person.assessment_staff_id) || '', code: person.employee_code, company: person.company, group: isDoctor(person.designation || '') ? 'Doctor' : group(person.designation || ''), team: members.has(person.id), type: row.leave_type, start: row.start_date, end: row.end_date, half: row.half_day || null, days: Number(row.days || 0), status: row.status === 'approved' ? 'approved' : 'waiting' }; }) });
    }

    // Leave of the team: what is waiting for approval.
    if (action === 'leave') {
      const people = await team(db);
      const names = new Map(people.map((person) => [person.id, { name: person.full_name, code: person.employee_code, group: group(person.designation || '') }]));
      const from = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
      const { data, error } = await db.from('hr_leave_requests').select('id,employee_id,leave_type,start_date,end_date,half_day,days,status,reason,created_at').in('employee_id', people.map((person) => person.id)).in('status', ['pending', 'supervisor_approved']).gte('end_date', from).order('start_date').limit(500);
      if (error) throw error;
      return res.status(200).json({ today: today(), leave: (data || []).map((row: any) => ({ id: row.id, ...names.get(row.employee_id), type: row.leave_type, start: row.start_date, end: row.end_date, halfDay: Boolean(row.half_day), days: Number(row.days || 0), status: row.status, createdAt: row.created_at || '', reason: row.reason || '' })) });
    }
    throw fail(404, 'Unknown request.');
  } catch (error: any) {
    return errorReply(res, error, 'Unable to complete this request.');
  }
}
