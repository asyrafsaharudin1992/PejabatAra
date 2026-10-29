import { officeAccess } from './_office-db.js';

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
  workDays: Array.isArray(row.work_days) && row.work_days.length ? row.work_days : [1, 2, 3, 4, 5, 6], holidayGroup: row.holiday_group || '', leaveApproverId: row.leave_approver_id || null, finalApproverId: row.final_approver_id || null, epfNo: row.epf_no, socsoNo: row.socso_no, taxNo: row.tax_no, remarks: row.remarks, updatedAt: row.updated_at,
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
      let result: any = await db.from('hr_employees').select(`${SUMMARY},leave_approver_id,final_approver_id`).order('company').order('full_name');
      if (result.error?.code === '42703') result = await db.from('hr_employees').select(SUMMARY).order('company').order('full_name');
      const { data, error } = result;
      if (error) throw error;
      // Whether each person's individual sign-in has a password yet: none (no sign-in), not_set, or set.
      const linked = (data || []).map((row: any) => row.assessment_staff_id).filter(Boolean);
      const { data: logins } = linked.length ? await db.from('assessment_staff').select('id,password_hash').in('id', linked) : { data: [] };
      const hasPassword = new Map((logins || []).map((login: any) => [login.id, Boolean(login.password_hash)]));
      return res.status(200).json({ employees: (data || []).map((row: any) => ({ id: row.id, company: row.company, employeeCode: row.employee_code, fullName: row.full_name, branch: row.branch, department: row.department, designation: row.designation, employmentType: row.employment_type, status: row.status, joinDate: row.join_date, assessmentStaffId: row.assessment_staff_id, leaveApproverId: row.leave_approver_id || null, finalApproverId: row.final_approver_id || null, signIn: !row.assessment_staff_id ? 'none' : hasPassword.get(row.assessment_staff_id) ? 'set' : 'not_set' })) });
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

    // Who approves each person's leave: the supervisor (first level) or the final approver (second level).
    // An empty approver clears it.
    if (req.method === 'POST' && action === 'assign_leave_approver') {
      const column = body.level === 'final' ? 'final_approver_id' : 'leave_approver_id';
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
      const fromInfotech = String(request.decision_note || '').startsWith('Imported from Infotech');
      let restored = 0;
      if (request.status === 'approved' && !fromInfotech) {
        // The balance was taken off the newest year of the leave group at approval: put the days back there.
        const { data: rows } = await db.from('hr_leave_balances').select('id,taken,balance').eq('employee_id', request.employee_id).eq('leave_group', request.leave_group).order('year', { ascending: false }).limit(1);
        if (rows?.length) { restored = Number(request.days); const { error } = await db.from('hr_leave_balances').update({ taken: Math.max(0, Number(rows[0].taken) - restored), balance: Number(rows[0].balance) + restored, updated_at: now }).eq('id', rows[0].id); if (error) throw error; }
      }
      const { error: deleteError } = await db.from('hr_leave_requests').delete().eq('id', request.id);
      if (deleteError) throw deleteError;
      const summary = `${request.leave_type} ${request.start_date}${request.end_date !== request.start_date ? ` to ${request.end_date}` : ''}, ${Number(request.days)} day(s), ${request.status}${fromInfotech ? ', imported from Infotech' : ''}`;
      await db.from('hr_audit').insert({ employee_id: request.employee_id, action: 'delete', changes: { leave_request: [summary, 'deleted by HR'], ...(restored ? { balance_returned: [`${restored} day(s)`, request.leave_group] } : {}) }, changed_by: user.id });
      return res.status(200).json({ success: true, restored });
    }

    // Every leave request made from Individual Sign In, for HR to follow.
    if (req.method === 'GET' && action === 'leave_requests') {
      const year = /^\d{4}$/.test(String(req.query.year)) ? String(req.query.year) : String(new Date().getFullYear());
      const { data, error } = await db.from('hr_leave_requests').select('*').gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`).order('start_date', { ascending: false }).limit(1000);
      if (error) throw error;
      const ids = [...new Set((data || []).flatMap((r: any) => [r.employee_id, r.approver_id, r.final_approver_id, r.decided_by, r.supervisor_decided_by]).filter(Boolean))];
      const { data: people } = ids.length ? await db.from('hr_employees').select('id,company,employee_code,full_name').in('id', ids) : { data: [] };
      const who = new Map((people || []).map((p: any) => [p.id, p]));
      const name = (id: string | null) => (id && who.get(id)?.full_name) || '';
      return res.status(200).json({ year, requests: (data || []).map((r: any) => ({ id: r.id, company: who.get(r.employee_id)?.company || '', code: who.get(r.employee_id)?.employee_code || '', applicant: name(r.employee_id), type: r.leave_type, group: r.leave_group, start: r.start_date, end: r.end_date, half: r.half_day, days: Number(r.days), reason: r.reason, status: r.status, supervisor: name(r.approver_id), finalApprover: name(r.final_approver_id), supervisorBy: name(r.supervisor_decided_by), supervisorNote: r.supervisor_note || '', decidedBy: name(r.decided_by), note: r.decision_note || '', createdAt: r.created_at, decidedAt: r.decided_at })) });
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
      const { data: people } = ids.length ? await db.from('hr_employees').select('id,company,employee_code,full_name').in('id', ids) : { data: [] };
      return res.status(200).json({ month, people: (people || []).map((p: any) => ({ id: p.id, company: p.company, code: p.employee_code, name: p.full_name })), days: (data || []).map((row: any) => ({ id: row.employee_id, date: row.work_date, shift: row.shift, works: row.works, note: row.note })) });
    }
    if (req.method === 'POST' && action === 'roster_import') {
      const rows: any[] = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
      if (!rows.length) throw fail(400, 'There are no roster rows.');
      const { data: people, error: peopleError } = await db.from('hr_employees').select('id,company,employee_code');
      if (peopleError) throw peopleError;
      const byCode = new Map((people || []).map((p: any) => [`${p.company}|${String(p.employee_code).toUpperCase()}`, p.id]));
      const NOT_WORKING = new Set(['OFF', 'OFF 1ST', 'OFF 2ND', 'REST', 'NA', 'PH', 'RESIGN', 'OD', 'RD', 'AL', 'UPL', 'MC', 'ML', 'EL', '']);
      const LEAVE = new Set(['AL', 'UPL', 'MC', 'ML', 'EL']);
      const unknown = new Set<string>(); const out: any[] = [];
      for (const row of rows) {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) ? String(row.date) : '';
        const id = byCode.get(`${text(row.company, 4).toUpperCase()}|${text(row.code, 20).toUpperCase()}`);
        if (!date) continue;
        if (!id) { unknown.add(`${row.company}|${row.code}`); continue; }
        const shift = text(row.shift, 30).toUpperCase();
        if (!shift) continue; // a blank cell means no schedule, so the weekly working days apply
        out.push({ employee_id: id, work_date: date, shift, works: !NOT_WORKING.has(shift), note: LEAVE.has(shift) ? shift : '' });
      }
      if (unknown.size) throw fail(400, `These staff codes are not in HR: ${[...unknown].join(', ')}.`);
      if (!out.length) throw fail(400, 'There are no valid roster rows.');
      const { error } = await db.from('hr_roster').upsert(out, { onConflict: 'employee_id,work_date' });
      if (error) throw error;
      return res.status(200).json({ success: true, saved: out.length });
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
      return res.status(200).json({ employee: decode(data) });
    }

    throw fail(405, 'Method not allowed.');
  } catch (error: any) {
    // Before the migration has been run the tables do not exist yet.
    if (['PGRST205', '42P01'].includes(error?.code)) return res.status(503).json({ error: 'Staff profiles are not set up yet: run supabase/migrations/202610160002_hr_employees.sql in Supabase.' });
    return res.status(error.status || 400).json({ error: error.message || 'Unable to complete this request.' });
  }
}
