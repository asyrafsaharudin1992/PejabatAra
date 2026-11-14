import { randomBytes } from 'node:crypto';
import { branchId, errorReply, officeAccess } from './_office-db.js';
import { Employee, TEAM_COLUMNS } from './_attendance.js';
import { careClaimsToReview, careWaitingCount, reviewCare, isCooTitle } from './_care.js';
import { leaveAction, reviewAction } from './_assessment.js';
import { attendanceHrAction, attendanceStaffAction } from './_attendance.js';
import { hrCalendarAction } from './_hr-calendar.js';
import { ceoTasksAction } from './_ceo-tasks.js';
import { ceoCharts, headcount } from './_ceo-charts.js';
import { waitingCounts } from './_waiting.js';

// Office COO: the COO leads operations: Clinical Admin, the Clinical Assistants and the doctors. The team is every active staff member whose job title is
// Clinical Assistant (or Officer) or Admin Clinical, and every doctor, the four directors (CEO, COO, CHRO, CPO) included.
// Read only: HR still decides leave, OT and pay.
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const TEAM_TITLE = /CLINIC(AL)? ASSISTANT|ADMIN CLINICAL/i;
const isDoctor = (designation: string) => /\b(DR|DOCTOR)\b/i.test(designation || '');
// The four directors (CEO, COO, CHRO, CPO) are doctors too, so they count as doctors in the team.
// Izzah (ARA0041) is Admin Klinikal although her job title says Clinic Assistant Officer.
const CLINICAL_ADMIN_CODES = new Set(['ARA0041']);
const group = (designation: string, code = '') => isDoctor(designation) ? 'Doctor' : CLINICAL_ADMIN_CODES.has(code) || /ADMIN/i.test(designation) && !/ASSISTANT OFFICER/i.test(designation) ? 'Clinical Admin' : 'Clinical Assistant';

async function team(db: any) {
  const { data, error } = await db.from('hr_employees').select(`${TEAM_COLUMNS},branch`).eq('status', 'Active').order('full_name').limit(500);
  if (error) throw error;
  return ((data || []) as (Employee & { branch?: string })[]).filter((person) => isDoctor(person.designation || '') || TEAM_TITLE.test(person.designation || ''));
}

export async function cooHandler(req: any, res: any) {
  try {
    const { db, user, profile } = await officeAccess(req, false, ['coo', 'ceo']);
    const offices: string[] = Array.isArray((user as any).app_metadata?.office_access) ? (user as any).app_metadata.office_access : [];
    const isCoo = profile.role === 'super_admin' || offices.includes('coo');
    const isCeo = profile.role === 'super_admin' || offices.includes('ceo');
    const action = String(req.query?.action || '');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);

    if (['ceo_tasks', 'ceo_tasks_save', 'ceo_task_toggle'].includes(action)) {
      if (!isCeo) throw fail(403, 'Access restricted.');
      return await ceoTasksAction(req, res, db, user, action, body);
    }

    // What waits for the COO: leave, OT and clock requests, reviews, and the AraCare claims to check.
    if (req.method === 'GET' && action === 'coo_waiting') {
      if (!isCoo) throw fail(403, 'Access restricted.');
      const { data: heads, error: headsError } = await db.from('hr_employees').select('id,designation,assessment_staff_id').eq('status', 'Active');
      if (headsError) throw headsError;
      const coo = (heads || []).find((person: any) => isCooTitle(person.designation) && person.assessment_staff_id);
      const counts = coo ? await waitingCounts(db, coo.assessment_staff_id, req.headers) : { leave: null, requests: null, reviews: null };
      let care: number | null = null;
      try { care = await careWaitingCount(db); } catch { care = null; }
      return res.status(200).json({ ...counts, care });
    }

    // What waits for the CEO: leave and reviews (OT and clock requests never go to the CEO). The CEO is the person with the CEO job title in the staff records
    // (as the COO is found by the COO title); these are the same requests and rules as in their Individual Sign In.
    if (/^ceo_(leave_|review_|waiting$)/.test(action)) {
      if (!isCeo) throw fail(403, 'Access restricted.');
      const { data: heads, error: headsError } = await db.from('hr_employees').select('id,designation,assessment_staff_id').eq('status', 'Active');
      if (headsError) throw headsError;
      const ceo = (heads || []).find((person: any) => /\bCEO\b/i.test(String(person.designation || '')) && person.assessment_staff_id);
      if (!ceo) throw fail(403, 'The CEO sign-in is not linked to a staff record yet. Ask HR.');
      const staff = { id: ceo.assessment_staff_id };
      const base = action.slice(4);
      if (action === 'ceo_waiting') {
        // The counts only: each list is read the same way the full screens read it, with the answer caught instead of sent.
        const count = async (run: (sink: any, readReq: any) => Promise<unknown>, pick: (body: any) => unknown[] | undefined) => {
          let out: any = null;
          const sink: any = { status: () => sink, json: (body: unknown) => { out = body; return sink; }, setHeader: () => sink };
          try { await run(sink, { method: 'GET', query: {}, headers: req.headers }); } catch { return null; }
          return pick(out)?.length ?? null;
        };
        const [leave, reviews] = await Promise.all([
          count((sink, readReq) => leaveAction(readReq, sink, db, staff, 'leave_approvals', {}), (body) => body?.pending),
          count((sink, readReq) => reviewAction(readReq, sink, db, staff, 'review_todo', {}), (body) => body?.reviews),
        ]);
        return res.status(200).json({ leave, reviews });
      }
      if (base.startsWith('leave_')) return await leaveAction(req, res, db, staff, base, body);
      return await reviewAction(req, res, db, staff, base, body);
    }

    // The numbers for the Charts tab (read only, cached for a few minutes). The CEO sees everything; the COO does not see pay or tax.
    if (req.method === 'GET' && action === 'ceo_charts') {
      if (!isCoo && !isCeo) throw Object.assign(new Error('Access restricted.'), { status: 403 });
      return res.status(200).json(await ceoCharts(db, String(req.query?.refresh || '') === '1', isCeo));
    }
    // How many people there are, for the home and the Charts tab: all active staff, doctors (directors included), Clinical Assistants and admins, by clinic.
    if (req.method === 'GET' && action === 'headcount') {
      if (!isCoo && !isCeo) throw Object.assign(new Error('Access restricted.'), { status: 403 });
      return res.status(200).json(await headcount(db));
    }

    // The COO's own calendar and reminders (kept apart from HR's), and the CEO's own (kept apart from the COO's). The CEO reaches nothing else here.
    if (action.startsWith('calendar_')) {
      const scope = String(req.query?.scope || '') === 'ceo' ? 'ceo' : 'coo';
      if (scope === 'ceo' ? !isCeo : !isCoo) throw Object.assign(new Error('Access restricted.'), { status: 403 });
      return await hrCalendarAction(req, res, db, user, action, body, scope);
    }
    if (!isCoo) throw Object.assign(new Error('Access restricted.'), { status: 403 });

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

    // The team at a glance (Home): who is in the team, the starters, those on probation and those leaving. Only the COO's own team.
    if (req.method === 'GET' && action === 'glance') {
      const members = await team(db);
      const ids = members.map((person) => person.id);
      const { data: dates, error } = ids.length ? await db.from('hr_employees').select('id,join_date,confirm_date,resign_date').in('id', ids) : { data: [], error: null };
      if (error) throw error;
      const when = new Map((dates || []).map((row: any) => [row.id, row]));
      // Who is on probation is HR's list (read only), kept with HR's calendar settings.
      let probation: Record<string, string> = {};
      try { const hrBranch = await branchId(db, 'AraOffice HR Private', false); if (hrBranch) { const { data } = await db.from('portal_state').select('payload').eq('branch_id', hrBranch).eq('state_key', 'hr_calendar_config').maybeSingle(); probation = data?.payload?.probation && typeof data.payload.probation === 'object' ? data.payload.probation : {}; } } catch { /* no list yet */ }
      return res.status(200).json({ today: today(), people: members.map((person: any) => { const row: any = when.get(person.id) || {}; return { id: person.id, name: person.full_name, company: person.company, group: group(person.designation || '', person.employee_code || ''), joinDate: row.join_date || null, confirmDate: row.confirm_date || null, resignDate: row.resign_date || null, probation: probation[person.id] === 'probation' }; }) });
    }

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
      return res.status(200).json({ month, today: today(), items: (rows || []).filter((row: any) => named.has(row.employee_id)).map((row: any) => { const person: any = named.get(row.employee_id); return { id: person.id, name: person.full_name, short: shortOf.get(person.assessment_staff_id) || '', code: person.employee_code, company: person.company, group: isDoctor(person.designation || '') ? 'Doctor' : group(person.designation || '', person.employee_code || ''), team: members.has(person.id), type: row.leave_type, start: row.start_date, end: row.end_date, half: row.half_day || null, days: Number(row.days || 0), status: row.status === 'approved' ? 'approved' : 'waiting' }; }) });
    }

    // Leave of the team: what is waiting for approval.
    if (action === 'leave') {
      const people = await team(db);
      const names = new Map(people.map((person) => [person.id, { name: person.full_name, code: person.employee_code, group: group(person.designation || '', person.employee_code || '') }]));
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
