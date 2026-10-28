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
  epfNo: row.epf_no, socsoNo: row.socso_no, taxNo: row.tax_no, remarks: row.remarks, updatedAt: row.updated_at,
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
      const { data, error } = await db.from('hr_employees').select(SUMMARY).order('company').order('full_name');
      if (error) throw error;
      return res.status(200).json({ employees: (data || []).map((row: any) => ({ id: row.id, company: row.company, employeeCode: row.employee_code, fullName: row.full_name, branch: row.branch, department: row.department, designation: row.designation, employmentType: row.employment_type, status: row.status, joinDate: row.join_date, assessmentStaffId: row.assessment_staff_id })) });
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
      return res.status(200).json({ employee: decode(data), audit: (audit || []).map((row: any) => ({ action: row.action, changes: row.changes, at: row.changed_at, by: names.get(row.changed_by) || '' })) });
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
