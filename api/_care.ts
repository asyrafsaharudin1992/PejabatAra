import { CARE_AMOUNT, CARE_ITEMS, CARE_ROLES, CareClaim } from '../src/lib/careClaim.js';

// AraCare (Care Coordination Allowance): the claim rows, and what a staff member does with their own claim.
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const FIRST_MONTH = '2026-10';
export const CARE_COLUMNS = 'id,staff_id,month,branch,roles,other_role,items,amount,status,kpi,decision_note,decided_by,decided_at,hr_submitted_at,hr_received_at,hr_received_by,submitted_at';
const notSetUp = (error: any) => ['42P01', 'PGRST205', '42703'].includes(error?.code);

export const careClaim = (row: any, person?: { name?: string; code?: string; ic?: string; designation?: string }): CareClaim => ({
  id: row.id, staffId: row.staff_id, month: row.month, branch: row.branch || '', roles: row.roles || [], other: row.other_role || '', items: Array.isArray(row.items) ? row.items : [], amount: Number(row.amount ?? CARE_AMOUNT),
  status: row.status, kpi: row.kpi || null, decisionNote: row.decision_note || '', decidedBy: row.decided_by || '', decidedAt: row.decided_at || null, hrSubmittedAt: row.hr_submitted_at || null,
  hrReceivedAt: row.hr_received_at || null, hrReceivedBy: row.hr_received_by || '', submittedAt: row.submitted_at,
  staffName: person?.name, staffCode: person?.code, ic: person?.ic, designation: person?.designation,
});

// Adds the name, staff code, IC and job title of each claim's owner (from the HR profile).
export async function withPeople(db: any, rows: any[]): Promise<CareClaim[]> {
  const ids = [...new Set(rows.map((row) => row.staff_id))];
  const names = new Map<string, any>();
  if (ids.length) {
    const [{ data: staff }, { data: people }] = await Promise.all([db.from('assessment_staff').select('id,name,staff_code').in('id', ids), db.from('hr_employees').select('assessment_staff_id,full_name,employee_code,ic_no,designation').in('assessment_staff_id', ids)]);
    for (const row of staff || []) names.set(row.id, { name: row.name, code: row.staff_code });
    for (const row of people || []) names.set(row.assessment_staff_id, { name: row.full_name, code: row.employee_code, ic: row.ic_no || '', designation: row.designation || '' });
  }
  return rows.map((row) => careClaim(row, names.get(row.staff_id)));
}

// The COO (job title starting COO) checks the KPIs of every AraCare claim, in the COO office or from their Individual Sign In.
export const isCooTitle = (designation: unknown) => /^\s*COO\b/i.test(String(designation || ''));
export async function isCareApprover(db: any, staffId: string) {
  const { data } = await db.from('hr_employees').select('designation').eq('assessment_staff_id', staffId).maybeSingle();
  return isCooTitle(data?.designation);
}
// The claims the COO looks at: the last few months, the ones waiting for a check first.
export async function careClaimsToReview(db: any) {
  const first = new Date(Date.now() + 8 * 3600 * 1000); first.setUTCDate(1); first.setUTCMonth(first.getUTCMonth() - 3);
  const { data, error } = await db.from('care_claims').select(CARE_COLUMNS).gte('month', first.toISOString().slice(0, 7)).order('month', { ascending: false }).limit(200);
  if (error) { if (notSetUp(error)) return { claims: [] as CareClaim[], notSetUp: true }; throw error; }
  const claims = await withPeople(db, data || []);
  claims.sort((a, b) => Number(a.status !== 'submitted') - Number(b.status !== 'submitted') || b.month.localeCompare(a.month) || (a.staffName || '').localeCompare(b.staffName || ''));
  return { claims, notSetUp: false };
}
export async function careWaitingCount(db: any) {
  const { count, error } = await db.from('care_claims').select('id', { count: 'exact', head: true }).eq('status', 'submitted');
  return error ? 0 : count || 0;
}
// The COO's check: the three KPIs and whether the allowance is payable. Payable: approved and sent straight to HR (no Clinical Admin).
// Not payable: returned to the staff member with the reason.
export async function reviewCare(db: any, body: any) {
  const by = text(body.by, 80);
  if (!by) throw fail(400, 'Enter your name.');
  const { data: claim, error } = await db.from('care_claims').select('id,status,hr_received_at').eq('id', text(body.id, 60)).maybeSingle();
  if (error) throw error;
  if (!claim) throw fail(404, 'Claim not found.');
  if (claim.hr_received_at) throw fail(409, 'HR has already received this claim, so it cannot be changed. Ask HR.');
  const eligible = body.eligible === true, note = text(body.note, 300), now = new Date().toISOString();
  if (!eligible && !note) throw fail(400, 'Say why it is not payable, so the staff member is told.');
  const kpi = { followUp: body.followUp === true, registry: body.registry === true, reminder: body.reminder === true, eligible, by, at: now, ...(note ? { note } : {}) };
  const row = eligible ? { status: 'approved', kpi, decision_note: note, decided_by: by, decided_at: now, hr_submitted_at: now } : { status: 'returned', kpi, decision_note: note, decided_by: by, decided_at: now, hr_submitted_at: null };
  const { error: saveError } = await db.from('care_claims').update(row).eq('id', claim.id);
  if (saveError) throw saveError;
}

export async function isCareStaff(db: any, staffId: string) {
  const { data, error } = await db.from('care_staff').select('staff_id').eq('staff_id', staffId).maybeSingle();
  return !error && Boolean(data);
}

// The staff member's own AraCare claim (Incentive page). Only staff HR has set as AraCare coordinators see it.
export async function careAction(req: any, res: any, db: any, staff: { id: string; branch: string; can_preview: boolean }, action: string, body: any) {
  const eligible = await isCareStaff(db, staff.id);
  if (req.method === 'GET' && action === 'care') {
    if (!eligible) return res.status(200).json({ eligible: false });
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : today().slice(0, 7);
    const { data: own, error } = await db.from('hr_employees').select('full_name,employee_code,ic_no,designation,branch').eq('assessment_staff_id', staff.id).maybeSingle();
    if (error) throw error;
    const { data, error: claimError } = await db.from('care_claims').select(CARE_COLUMNS).eq('staff_id', staff.id).order('month', { ascending: false }).limit(12);
    if (claimError) { if (notSetUp(claimError)) return res.status(200).json({ eligible: false }); throw claimError; }
    const person = { name: own?.full_name, code: own?.employee_code, ic: own?.ic_no || '', designation: own?.designation || '' };
    const claims = (data || []).map((row: any) => careClaim(row, person));
    return res.status(200).json({ eligible: true, month, amount: CARE_AMOUNT, person: { ...person, branch: own?.branch || '' }, claim: claims.find((claim: CareClaim) => claim.month === month) || null, history: claims.map((claim: CareClaim) => ({ month: claim.month, status: claim.status, hrReceivedAt: claim.hrReceivedAt })) });
  }
  // The COO's own list and check, from the Individual Sign In.
  if (action === 'care_review_list' || action === 'care_review') {
    if (!await isCareApprover(db, staff.id)) throw fail(403, 'AraCare claims are checked by the COO.');
    if (req.method === 'GET' && action === 'care_review_list') return res.status(200).json(await careClaimsToReview(db));
    if (req.method === 'POST' && action === 'care_review') { if (staff.can_preview) throw fail(403, 'Preview accounts cannot do this.'); await reviewCare(db, body); return res.status(200).json({ success: true }); }
    throw fail(405, 'Method not allowed.');
  }
  if (req.method === 'POST' && action === 'care_submit') {
    if (staff.can_preview) throw fail(403, 'Preview accounts cannot make claims.');
    if (!eligible) throw fail(403, 'The AraCare allowance is not set up for your account. Ask HR.');
    const month = text(body.month, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || month < FIRST_MONTH || month > today().slice(0, 7)) throw fail(400, 'Choose a month from October 2026 up to this month.');
    const roles = [...new Set<string>((Array.isArray(body.roles) ? body.roles : []).filter((role: unknown): role is string => typeof role === 'string' && CARE_ROLES.includes(role)))];
    if (!roles.length) throw fail(400, 'Tick at least one role (AraChronic, AraMommy, AraWellness, AraSihat or Lain-lain).');
    const items = CARE_ITEMS.map((_item, index) => text(Array.isArray(body.items) ? body.items[index] : '', 200));
    if (items.some((item) => !item)) throw fail(400, 'Fill in all five lines of the monthly summary.');
    if (body.confirmed !== true) throw fail(400, 'Tick the confirmation that the registry and follow-up are done and the data is correct.');
    const { data: existing, error } = await db.from('care_claims').select('id,status').eq('staff_id', staff.id).eq('month', month).maybeSingle();
    if (error) { if (notSetUp(error)) throw fail(503, 'AraCare is not set up yet. System Admin needs to run the latest database migration first.'); throw error; }
    if (existing && existing.status === 'submitted') throw fail(409, 'This claim is already with the COO.');
    if (existing && existing.status === 'approved') throw fail(409, 'This claim is already approved.');
    const { data: own } = await db.from('hr_employees').select('branch').eq('assessment_staff_id', staff.id).maybeSingle();
    const row = { branch: own?.branch || '', roles, other_role: roles.includes('Lain-lain') ? text(body.other, 60) : '', items, amount: CARE_AMOUNT, status: 'submitted', kpi: null, decision_note: '', decided_by: '', decided_at: null, hr_submitted_at: null, submitted_at: new Date().toISOString() };
    const { error: saveError } = existing ? await db.from('care_claims').update(row).eq('id', existing.id) : await db.from('care_claims').insert({ staff_id: staff.id, month, ...row });
    if (saveError) throw saveError;
    return res.status(200).json({ success: true });
  }
  throw fail(404, 'Unknown request.');
}
