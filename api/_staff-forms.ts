import { branchId } from './_office-db.js';

// HR's staff communication forms (first one: the influenza vaccine consent or refusal). HR opens the form; each staff member answers it from Announcements
// in Individual Sign In. Health details are private, so they are kept in HR's private area, one row for each person (so two answers at the same time never
// overwrite each other), and only HR reads them. Staff see only their own answer.
const BRANCH = 'AraOffice HR Private';
const CONFIG = 'flu_form_config';
const ROW = 'flu_form:';
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);

export type FluAnswer = { choice: 'agree' | 'refuse'; health: string; allergy: boolean; allergyDetail: string; immunDate: string; immunName: string; reason: string; answeredAt: string };

// The form's on or off setting is read at most once every 30 seconds (it is looked at each time someone opens Home), and again at once when HR changes it.
let cached: { at: number; value: any } | null = null;
async function config(db: any, fresh = false) {
  if (!fresh && cached && Date.now() - cached.at < 30000) return cached.value;
  const value = await readConfig(db);
  cached = { at: Date.now(), value };
  return value;
}
async function readConfig(db: any) {
  const branch = await branchId(db, BRANCH, false);
  if (!branch) return { branch: null as string | null, open: false, title: '', openedAt: '', by: '' };
  const { data } = await db.from('portal_state').select('payload,updated_by').eq('branch_id', branch).eq('state_key', CONFIG).maybeSingle();
  return { branch, open: Boolean(data?.payload?.open), title: String(data?.payload?.title || 'Influenza vaccine'), openedAt: String(data?.payload?.openedAt || ''), by: String(data?.updated_by || '') };
}

// What one staff member sees: whether the form is open, their own name and branch, and their answer if they gave one.
export async function fluFormFor(db: any, assessmentStaffId: string) {
  const cfg = await config(db);
  if (!cfg.open || !cfg.branch) return { open: false };
  const { data: person } = await db.from('hr_employees').select('id,full_name,branch,company').eq('assessment_staff_id', assessmentStaffId).eq('status', 'Active').maybeSingle();
  if (!person) return { open: false };
  const { data: row } = await db.from('portal_state').select('payload').eq('branch_id', cfg.branch).eq('state_key', `${ROW}${person.id}`).maybeSingle();
  return { open: true, name: person.full_name, branch: person.branch || person.company, answer: (row?.payload as FluAnswer | undefined) || null };
}

export async function fluFormSave(db: any, assessmentStaffId: string, body: any) {
  const cfg = await config(db);
  if (!cfg.open || !cfg.branch) throw fail(400, 'Borang ini tidak dibuka.');
  const { data: person } = await db.from('hr_employees').select('id').eq('assessment_staff_id', assessmentStaffId).eq('status', 'Active').maybeSingle();
  if (!person) throw fail(403, 'Akaun anda tidak dipautkan kepada rekod HR.');
  const choice = body?.choice === 'agree' ? 'agree' : body?.choice === 'refuse' ? 'refuse' : '';
  if (!choice) throw fail(400, 'Pilih sama ada anda bersetuju atau menolak.');
  if (body?.confirmed !== true) throw fail(400, 'Tanda kotak untuk mengesahkan.');
  const allergy = body?.allergy === true;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.immunDate || '')) ? String(body.immunDate) : '';
  const answer: FluAnswer = {
    choice, health: clean(body?.health, 300), allergy, allergyDetail: allergy ? clean(body?.allergyDetail, 300) : '',
    immunDate: choice === 'agree' ? date : '', immunName: choice === 'agree' ? clean(body?.immunName, 120) : '', reason: choice === 'refuse' ? clean(body?.reason, 500) : '',
    answeredAt: new Date().toISOString(),
  };
  if (choice === 'refuse' && !answer.reason) throw fail(400, 'Tulis sebab anda menolak.');
  // The row keeps the HR profile that opened the form (updated_by is required and staff have no profile).
  const { error } = await db.from('portal_state').upsert({ branch_id: cfg.branch, state_key: `${ROW}${person.id}`, payload: answer, updated_by: cfg.by }, { onConflict: 'branch_id,state_key' });
  if (error) throw error;
  return { ok: true, answer };
}

// Someone who agreed first and was vaccinated later adds the date and the name of the vaccine without answering the whole form again.
export async function fluFormVaccine(db: any, assessmentStaffId: string, body: any) {
  const cfg = await config(db);
  if (!cfg.branch) throw fail(400, 'Borang ini tidak dibuka.');
  const { data: person } = await db.from('hr_employees').select('id').eq('assessment_staff_id', assessmentStaffId).eq('status', 'Active').maybeSingle();
  if (!person) throw fail(403, 'Akaun anda tidak dipautkan kepada rekod HR.');
  const key = `${ROW}${person.id}`;
  const { data: row } = await db.from('portal_state').select('payload').eq('branch_id', cfg.branch).eq('state_key', key).maybeSingle();
  const old = row?.payload as FluAnswer | undefined;
  if (!old || old.choice !== 'agree') throw fail(400, 'Jawapan anda mesti Saya bersetuju dahulu.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.immunDate || '')) ? String(body.immunDate) : '';
  if (!date) throw fail(400, 'Pilih tarikh vaksin.');
  const answer: FluAnswer = { ...old, immunDate: date, immunName: clean(body?.immunName, 120) || old.immunName };
  const { error } = await db.from('portal_state').upsert({ branch_id: cfg.branch, state_key: key, payload: answer, updated_by: cfg.by }, { onConflict: 'branch_id,state_key' });
  if (error) throw error;
  return { ok: true, answer };
}

// HR: every active staff member and their answer.
export async function fluFormHr(db: any) {
  const cfg = await config(db);
  const { data: people, error } = await db.from('hr_employees').select('id,company,employee_code,full_name,branch,designation,ic_no').eq('status', 'Active').order('company').order('employee_code');
  if (error) throw error;
  const rows: Record<string, FluAnswer> = {};
  if (cfg.branch) {
    const { data } = await db.from('portal_state').select('state_key,payload').eq('branch_id', cfg.branch).like('state_key', `${ROW}%`).limit(1000);
    for (const row of data || []) rows[String(row.state_key).slice(ROW.length)] = row.payload;
  }
  return { open: cfg.open, openedAt: cfg.openedAt, staff: (people || []).map((p: any) => ({ id: p.id, company: p.company, code: p.employee_code, name: p.full_name, branch: p.branch || '', designation: p.designation || '', ic: p.ic_no || '', answer: rows[p.id] || null })) };
}

export async function fluFormOpen(db: any, userId: string, open: boolean) {
  const branch = await branchId(db, BRANCH, true);
  const cfg = await config(db);
  const payload = { open, title: 'Influenza vaccine', openedAt: open && !cfg.open ? new Date().toISOString() : cfg.openedAt };
  const { error } = await db.from('portal_state').upsert({ branch_id: branch, state_key: CONFIG, payload, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'branch_id,state_key' });
  if (error) throw error;
  cached = null;
}

// For the red number on Announcements: the form is open and this person has not answered yet.
export async function fluFormWaiting(db: any, assessmentStaffId: string) {
  if (!(await config(db)).open) return false;   // closed: no further look-ups
  const state = await fluFormFor(db, assessmentStaffId);
  return Boolean(state.open && !(state as any).answer);
}
