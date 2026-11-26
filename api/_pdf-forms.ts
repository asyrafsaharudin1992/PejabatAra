import { randomBytes } from 'node:crypto';
import { activeRoles, allDone, cleanAnswers, cleanLayout, keyOf, missing, type Answers, type Done, type Field } from '../src/pdfForm/model.js';

// Forms made from an imported PDF (Staff communication). HR keeps the forms, sends one about a staff member and follows the answers; the staff member and
// the other people chosen fill their own part in Individual Sign In > Announcements. Whoever has a part in a case sees that whole form.
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
const isId = (value: unknown) => /^[0-9a-f-]{36}$/i.test(String(value || ''));
const BUCKET = 'hr-misc';
const COMPANY: Record<string, string> = { KJ: 'HSO Healthcare Sdn Bhd (Kajang)', SK: 'HSO Healthcare Sdn Bhd (Seri Kembangan)' };
const notReady = (error: any) => error && ['42P01', 'PGRST205'].includes(error.code);
const SETUP = 'This part is not set up yet. System Admin needs to run the latest database migration first.';
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const dmy = (date?: string | null) => date ? date.slice(0, 10).split('-').reverse().join('/') : '';
const years = (from: string | null | undefined, to: string) => from ? Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / (365.25 * 86400000))) : null;

async function fileOf(db: any, path: string) {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) throw fail(404, 'The PDF of this form could not be found.');
  return Buffer.from(await data.arrayBuffer()).toString('base64');
}

// The profile details placed on the form when it is sent.
function profileAnswers(fields: Field[], person: any): Answers {
  const values: Record<string, string> = {
    name: person.full_name, code: person.employee_code, ic: person.ic_no || person.passport_no || '', position: person.designation || '', department: person.department || '',
    company: COMPANY[person.company] || person.company || '', age: String(years(person.date_of_birth, today()) ?? ''), gender: /^m/i.test(person.gender || '') || /^l/i.test(person.gender || '') ? 'L' : person.gender ? 'P' : '',
    service: String(years(person.join_date, person.resign_date || today()) ?? ''), resignDate: dmy(person.resign_date),
  };
  return Object.fromEntries(fields.filter((field) => field.source && values[field.source]).map((field) => [keyOf(field), values[field.source!]]));
}
// "Date signed" is filled on the day that person submits.
const signedDates = (fields: Field[], who: string) => Object.fromEntries(fields.filter((field) => field.who === who && field.source === 'today').map((field) => [keyOf(field), dmy(today())]));

const caseRow = (row: any, names: Map<string, any>) => ({
  id: row.id, formId: row.form_id, title: row.title, status: row.status, dueOn: row.due_on, sentAt: row.sent_at, employeeId: row.employee_id,
  name: names.get(row.employee_id)?.full_name || '', code: names.get(row.employee_id)?.employee_code || '', done: row.done || {},
  parts: (row.parts || []).map((role: any) => ({ id: role.id, label: role.label, signer: role.id === 'staff' ? names.get(row.signers?.staff || row.employee_id)?.full_name || '' : role.id === 'hr' ? 'HR' : names.get(row.signers?.[role.id])?.full_name || '', done: row.done?.[role.id] || null })),
});
async function namesFor(db: any, rows: any[]) {
  const ids = [...new Set(rows.flatMap((row) => [row.employee_id, ...Object.values(row.signers || {})]).filter(Boolean))];
  const { data } = ids.length ? await db.from('hr_employees').select('id,full_name,employee_code').in('id', ids) : { data: [] };
  return new Map<string, any>((data || []).map((person: any) => [person.id, person]));
}

// One person's part is saved (or submitted). The row is only written if nobody else saved it in between.
async function savePart(db: any, row: any, who: string, body: any, by: string) {
  if (row.status !== 'open') throw fail(409, 'This form is closed.');
  if (row.done?.[who]) throw fail(409, 'This part was already submitted. HR can send it back if it must change.');
  const submit = body.submit === true;
  const answers: Answers = { ...row.answers, ...cleanAnswers(row.fields, who, body.answers || {}), ...(submit ? signedDates(row.fields, who) : {}) };
  if (submit) {
    const left = missing({ title: row.title, roles: row.roles, fields: row.fields.filter((field: Field) => field.source !== 'today') }, who, answers);
    if (left.length) throw fail(400, `Please answer: ${left.slice(0, 4).map((field) => field.label).join(', ')}${left.length > 4 ? ` and ${left.length - 4} more` : ''}.`);
  }
  const done: Done = submit ? { ...row.done, [who]: { at: new Date().toISOString(), by } } : row.done || {};
  const status = submit && allDone({ roles: row.roles, fields: row.fields }, done) ? 'completed' : 'open';
  const { data, error } = await db.from('hr_pdf_form_cases').update({ answers, done, status, updated_at: new Date().toISOString() }).eq('id', row.id).eq('updated_at', row.updated_at).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw fail(409, 'This form was just changed by someone else. Open it again.');
  return data;
}
async function readCase(db: any, id: unknown) {
  if (!isId(id)) throw fail(400, 'Choose a form.');
  const { data, error } = await db.from('hr_pdf_form_cases').select('*').eq('id', String(id)).maybeSingle();
  if (notReady(error)) throw fail(503, SETUP);
  if (error) throw error;
  if (!data) throw fail(404, 'That form was not found.');
  return data;
}

// ---- HR ----
export async function pdfFormHrAction(req: any, res: any, db: any, action: string, body: any, userLabel: string) {
  if (req.method === 'GET' && action === 'pdfform_list') {
    const { data, error } = await db.from('hr_pdf_forms').select('id,title,file_name,updated_at').eq('archived', false).order('title').limit(200);
    if (notReady(error)) return res.status(200).json({ forms: [], notSetUp: true });
    if (error) throw error;
    const { data: cases, error: caseError } = await db.from('hr_pdf_form_cases').select('form_id,status').neq('status', 'cancelled').limit(2000);
    if (caseError) throw caseError;
    return res.status(200).json({ forms: (data || []).map((form: any) => ({ id: form.id, title: form.title, fileName: form.file_name, updatedAt: form.updated_at, open: (cases || []).filter((c: any) => c.form_id === form.id && c.status === 'open').length, completed: (cases || []).filter((c: any) => c.form_id === form.id && c.status === 'completed').length })) });
  }
  if (req.method === 'GET' && action === 'pdfform_get') {
    if (!isId(req.query.id)) throw fail(400, 'Choose a form.');
    const { data: form, error } = await db.from('hr_pdf_forms').select('*').eq('id', String(req.query.id)).maybeSingle();
    if (error) throw error;
    if (!form) throw fail(404, 'That form was not found.');
    return res.status(200).json({ id: form.id, title: form.title, roles: form.roles, fields: form.fields, base64: await fileOf(db, form.file_path) });
  }
  if (req.method === 'POST' && action === 'pdfform_create') {
    const title = clean(body.title, 120); if (!title) throw fail(400, 'Enter a title.');
    const raw = String(body.base64 || '').replace(/^data:[^,]*,/, ''), buffer = Buffer.from(raw, 'base64');
    if (!buffer.length || buffer.length > 3 * 1024 * 1024 || buffer.toString('ascii', 0, 4) !== '%PDF') throw fail(400, 'Choose a PDF of 3 MB or smaller.');
    const path = `pdf-forms/${randomBytes(16).toString('hex')}.pdf`;
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw uploadError;
    const layout = cleanLayout(body.roles, body.fields);
    const { data, error } = await db.from('hr_pdf_forms').insert({ title, file_path: path, file_name: clean(body.fileName, 120), ...layout, created_by: userLabel }).select('id').single();
    if (error) { await db.storage.from(BUCKET).remove([path]); if (notReady(error)) throw fail(503, SETUP); throw error; }
    return res.status(200).json({ id: data.id });
  }
  if (req.method === 'POST' && action === 'pdfform_save') {
    const title = clean(body.title, 120); if (!isId(body.id) || !title) throw fail(400, 'Enter a title.');
    const { error } = await db.from('hr_pdf_forms').update({ title, ...cleanLayout(body.roles, body.fields), updated_at: new Date().toISOString() }).eq('id', String(body.id));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }
  if (req.method === 'POST' && action === 'pdfform_archive') {
    if (!isId(body.id)) throw fail(400, 'Choose a form.');
    const { error } = await db.from('hr_pdf_forms').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', String(body.id));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }
  if (req.method === 'POST' && action === 'pdfform_send') {
    if (!isId(body.id)) throw fail(400, 'Choose a form.');
    const { data: form, error } = await db.from('hr_pdf_forms').select('*').eq('id', String(body.id)).eq('archived', false).maybeSingle();
    if (error) throw error;
    if (!form) throw fail(404, 'That form was not found.');
    const ids: string[] = [...new Set<string>((Array.isArray(body.employeeIds) ? body.employeeIds : []).map(String))].filter(isId).slice(0, 200);
    if (!ids.length) throw fail(400, 'Choose at least one staff member.');
    const roles = activeRoles(form);
    if (!roles.length) throw fail(400, 'Place at least one field on the form first.');
    const signers: Record<string, string> = {};
    for (const role of roles) {
      if (role.id === 'hr') continue;
      const id = String(body.signers?.[role.id] || '');
      // The staff part is filled by the person it is about, unless HR assigns someone else to it.
      if (role.id === 'staff' && !id) continue;
      if (!isId(id)) throw fail(400, `Choose who fills the part "${role.label}".`);
      signers[role.id] = id;
    }
    const { data: people, error: peopleError } = await db.from('hr_employees').select('id,full_name,employee_code,ic_no,passport_no,designation,department,company,date_of_birth,gender,join_date,resign_date,assessment_staff_id').in('id', [...ids, ...Object.values(signers)]).eq('status', 'Active');
    if (peopleError) throw peopleError;
    const byId = new Map<string, any>((people || []).map((p: any) => [p.id, p]));
    for (const [role, id] of Object.entries(signers)) if (!byId.get(id)?.assessment_staff_id) throw fail(400, `The person chosen for "${roles.find((r) => r.id === role)?.label}" cannot sign in to Individual Sign In.`);
    const { data: openCases, error: openError } = await db.from('hr_pdf_form_cases').select('employee_id').eq('form_id', form.id).eq('status', 'open');
    if (openError) throw openError;
    const already = new Set((openCases || []).map((c: any) => c.employee_id));
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueOn || '')) ? body.dueOn : null;
    const rows = ids.filter((id) => byId.has(id) && !already.has(id)).map((id) => ({ form_id: form.id, employee_id: id, title: form.title, roles: form.roles, fields: form.fields, parts: roles, file_path: form.file_path, signers, answers: profileAnswers(form.fields, byId.get(id)), due_on: due, sent_by: userLabel }));
    if (rows.length) { const { error: insertError } = await db.from('hr_pdf_form_cases').insert(rows); if (insertError) throw insertError; }
    const noLogin = rows.filter((row) => !signers.staff && !byId.get(row.employee_id)?.assessment_staff_id && roles.some((role) => role.id === 'staff')).map((row) => byId.get(row.employee_id).full_name);
    return res.status(200).json({ sent: rows.length, skipped: ids.length - rows.length, noLogin });
  }
  if (req.method === 'GET' && action === 'pdfform_cases') {
    if (!isId(req.query.formId)) throw fail(400, 'Choose a form.');
    // The answers (with signatures) are not listed; they are read only when one case is opened.
    const { data, error } = await db.from('hr_pdf_form_cases').select('id,form_id,employee_id,title,status,due_on,sent_at,parts,signers,done').eq('form_id', String(req.query.formId)).neq('status', 'cancelled').order('sent_at', { ascending: false }).limit(500);
    if (error) throw error;
    const names = await namesFor(db, data || []);
    return res.status(200).json({ cases: (data || []).map((row: any) => caseRow(row, names)) });
  }
  if (req.method === 'GET' && action === 'pdfform_case') {
    const row = await readCase(db, req.query.id);
    return res.status(200).json({ ...caseRow(row, await namesFor(db, [row])), roles: row.roles, fields: row.fields, answers: row.answers, base64: await fileOf(db, row.file_path) });
  }
  if (req.method === 'POST' && action === 'pdfform_hr_part') {
    const row = await savePart(db, await readCase(db, body.id), 'hr', body, userLabel);
    return res.status(200).json({ success: true, status: row.status });
  }
  if (req.method === 'POST' && (action === 'pdfform_return' || action === 'pdfform_cancel')) {
    const row = await readCase(db, body.id);
    if (row.status === 'cancelled') throw fail(409, 'This form was cancelled.');
    const done = { ...row.done }; if (action === 'pdfform_return') delete done[clean(body.role, 20)];
    const { error } = await db.from('hr_pdf_form_cases').update({ done, status: action === 'pdfform_cancel' ? 'cancelled' : 'open', updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) throw error.code === '23505' ? fail(409, 'Another copy of this form is already open for this person.') : error;
    return res.status(200).json({ success: true });
  }
  throw fail(404, 'Unknown action.');
}

// ---- Staff (Individual Sign In) ----
const partsOf = (row: any, me: string) => (row.parts || []).filter((role: any) => role.id === 'staff' ? (row.signers?.staff || row.employee_id) === me : row.signers?.[role.id] === me);
async function myEmployee(db: any, assessmentStaffId: string) {
  const { data } = await db.from('hr_employees').select('id,full_name').eq('assessment_staff_id', assessmentStaffId).eq('status', 'Active').maybeSingle();
  return data;
}
async function openCasesFor(db: any, me: string) {
  const { data, error } = await db.from('hr_pdf_form_cases').select('id,employee_id,title,due_on,parts,signers,done').eq('status', 'open').limit(500);
  if (notReady(error)) return [];
  if (error) throw error;
  return (data || []).flatMap((row: any) => partsOf(row, me).filter((role: any) => !row.done?.[role.id]).map((role: any) => ({ row, role })));
}
export async function pdfFormWaiting(db: any, assessmentStaffId: string) {
  const me = await myEmployee(db, assessmentStaffId);
  return me ? (await openCasesFor(db, me.id)).length : 0;
}
export async function pdfFormStaffAction(req: any, res: any, db: any, assessmentStaffId: string, action: string, body: any) {
  const me = await myEmployee(db, assessmentStaffId);
  if (!me) return action === 'pdfform_mine' ? res.status(200).json({ tasks: [] }) : res.status(403).json({ error: 'Your sign-in is not linked to your staff record yet. Ask HR.' });
  if (req.method === 'GET' && action === 'pdfform_mine') {
    const tasks = await openCasesFor(db, me.id), names = await namesFor(db, tasks.map((task: any) => task.row));
    return res.status(200).json({ tasks: tasks.map(({ row, role }: any) => ({ id: row.id, title: row.title, role: role.id, roleLabel: role.label, about: row.employee_id === me.id ? '' : names.get(row.employee_id)?.full_name || '', dueOn: row.due_on })) });
  }
  const row = await readCase(db, req.method === 'GET' ? req.query.id : body.id);
  const role = clean(req.method === 'GET' ? req.query.role : body.role, 20);
  if (row.status === 'cancelled' || !partsOf(row, me.id).some((part: any) => part.id === role)) throw fail(403, 'This form is not for you.');
  if (req.method === 'GET' && action === 'pdfform_open') return res.status(200).json({ id: row.id, title: row.title, role, roles: row.roles, fields: row.fields, answers: row.answers, done: Boolean(row.done?.[role]), base64: await fileOf(db, row.file_path) });
  if (req.method === 'POST' && action === 'pdfform_part') { await savePart(db, row, role, body, me.full_name); return res.status(200).json({ success: true }); }
  throw fail(404, 'Unknown action.');
}
