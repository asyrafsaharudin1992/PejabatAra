import { officeAccess } from './_office-db.js';

// Performance Review, served from /api/status?resource=review (the Vercel Hobby plan allows
// only 12 functions).
//
// Office HR assigns a review: which staff member, which supervisor, which period, with
// remarks. The supervisor signs in with their existing office account (no registered
// device needed), sees what is waiting for them, fills in the form and submits. HR reads
// the result and records receipt. Same scoring as the paper form: each area is rated 1 to 4
// and weighted.
const AREAS: Record<string, number> = { jobKnowledge: 30, qualityOfWork: 25, attendance: 25, behaviour: 20 };
const CRITERIA = 4; // points rated in each area, as on the paper form
// The office accounts that can be given reviews to fill in (System Admin always can).
export const REVIEWER_OFFICES = ['ceo', 'coo', 'finance', 'procurement', 'hr', 'clinical'];
// How each supervisor account is shown to HR: CEO and CFO (separate entries), CHRO, COO, CPO and
// the Clinical Admin of each branch, plus System Admin so reviews can be tested. Note the
// Finance (CFO) account is shared with the finance admin, so they see reviews given to it.
const roleLabel = (department: string, name: string) => {
  if (department === 'Executive Office') return 'CEO';
  if (department === 'Finance') return 'CFO';
  if (department === 'Human Resources') return 'CHRO';
  if (department === 'Operations') return 'COO';
  if (department === 'Procurement') return 'CPO';
  if (department === 'Clinical Administration') return /\bSK\b/i.test(name) ? 'Admin Klinikal SK' : /\bKJ\b/i.test(name) ? 'Admin Klinikal KJ' : 'Admin Klinikal';
  return name;
};
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isId = (value: unknown) => /^[0-9a-f-]{36}$/i.test(String(value || ''));
const overall = (score: number) => score >= 3.5 ? 'Exceeded Expectations' : score >= 3 ? 'Successfully Meet Expectations' : score >= 2 ? 'Partially Meet Expectations' : 'Did Not Meet Expectations';

// The real person behind each supervisor account, by their employee code in HR's staff list: the
// CEO account and the Finance (CFO) account are the same person, then the CHRO, COO and CPO, and
// the Admin Clinical of each branch. A doctor is written "DR ..." as on the paper form. Names come
// from the database, never from this file. An account with no match falls back to its own name.
const SUPERVISOR_CODES: Record<string, string> = { 'Executive Office': 'ARA0001', Finance: 'ARA0001', 'Human Resources': 'ARA0002', Operations: 'ARASK0001', Procurement: 'ARASK0002' };
const CLINICAL_ADMIN_CODES: Record<string, string> = { KJ: 'ARA0041', SK: 'ARASK0060' };
async function personNames(db: any) {
  const codes = [...new Set([...Object.values(SUPERVISOR_CODES), ...Object.values(CLINICAL_ADMIN_CODES)])];
  const { data } = await db.from('hr_employees').select('employee_code,full_name,designation').in('employee_code', codes);
  const byCode = new Map((data || []).map((row: any) => [row.employee_code, row]));
  return (department: string, accountName: string) => {
    const branch = /\bSK\b/i.test(accountName) ? 'SK' : /\bKJ\b/i.test(accountName) ? 'KJ' : '';
    const code = department === 'Clinical Administration' ? CLINICAL_ADMIN_CODES[branch] : SUPERVISOR_CODES[department];
    const person: any = code ? byCode.get(code) : null;
    return person ? `${/DR RESIDENT|DOCTOR/i.test(person.designation || '') ? 'DR ' : ''}${person.full_name}` : '';
  };
}

const SUMMARY = 'id,status,staff_name,employee_code,position,department,assessor_name,period_label,period_start,period_end,assign_remarks,total_score,overall,pip,hr_received_on,created_at,submitted_at';
const row = (r: any) => ({ id: r.id, status: r.status, staffName: r.staff_name, employeeCode: r.employee_code, position: r.position, department: r.department, assessorName: r.assessor_name, periodLabel: r.period_label, periodStart: r.period_start, periodEnd: r.period_end, assignRemarks: r.assign_remarks, totalScore: r.total_score === null ? null : Number(r.total_score), overall: r.overall, pip: r.pip, hrReceivedOn: r.hr_received_on, createdAt: r.created_at, submittedAt: r.submitted_at });
const full = (r: any) => ({ ...row(r), ratings: r.ratings || {}, improvement: r.improvement, training: r.training, employeeComments: r.employee_comments, pipRemarks: r.pip_remarks, pipStart: r.pip_start, hodName: r.hod_name, hrReceivedBy: r.hr_received_by, hrRemarks: r.hr_remarks });

export async function reviewHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const action = text(req.query.action || body.action, 40);

    // ---- Supervisors: what is waiting for them, their submitted reviews, and the form.
    if (['todo', 'mine', 'submit'].includes(action)) {
      const { db, user, profile } = await officeAccess(req, false, REVIEWER_OFFICES, true);
      const isAdmin = profile.role === 'super_admin';
      const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      const myName = me?.full_name || user.user_metadata?.full_name || '';

      // Reviews HR has assigned to this account (System Admin sees every waiting review).
      if (req.method === 'GET' && action === 'todo') {
        let query = db.from('hr_reviews').select(SUMMARY).eq('status', 'pending').order('created_at', { ascending: false }).limit(200);
        if (!isAdmin) query = query.eq('assessor_id', user.id);
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ reviews: (data || []).map(row), assessor: myName });
      }
      if (req.method === 'GET' && action === 'mine') {
        let query = db.from('hr_reviews').select(SUMMARY).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(200);
        if (!isAdmin) query = query.eq('assessor_id', user.id);
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ reviews: (data || []).map(row), assessor: myName });
      }
      if (req.method === 'POST' && action === 'submit') {
        const id = text(body.id, 60);
        const { data: assigned, error: readError } = await db.from('hr_reviews').select('id,status,assessor_id,assessor_name').eq('id', id).maybeSingle();
        if (readError) throw readError;
        if (!assigned) throw fail(404, 'This review was not found. It may have been cancelled by HR.');
        if (assigned.status !== 'pending') throw fail(409, 'This review has already been submitted.');
        if (!isAdmin && assigned.assessor_id !== user.id) throw fail(403, 'This review is not assigned to you.');
        // Submitting is the supervisor's digital signature, so they must confirm it.
        if (body.signed !== true) throw fail(400, 'Confirm the review and sign it before submitting.');
        // Every criterion (four in each area) is rated 1 to 4. An area scores the average of its
        // criteria and the total weighs the areas by the form's percentages.
        const ratings: Record<string, number[]> = {};
        let score = 0;
        for (const [key, weight] of Object.entries(AREAS)) {
          const levels = Array.isArray(body.ratings?.[key]) ? body.ratings[key].map(Number) : [];
          if (levels.length !== CRITERIA || levels.some((level: number) => ![1, 2, 3, 4].includes(level))) throw fail(400, 'Rate every point in all four areas before submitting.');
          ratings[key] = levels;
          score += (weight / 100) * (levels.reduce((sum: number, level: number) => sum + level, 0) / CRITERIA);
        }
        score = Math.round(score * 100) / 100;
        const pip = body.pip === 'required' ? 'required' : 'not_required';
        const now = new Date().toISOString();
        const { data, error } = await db.from('hr_reviews').update({
          status: 'submitted', submitted_at: now, updated_at: now, assessor_name: text(body.assessorName, 160) || assigned.assessor_name || myName,
          ratings, total_score: score, overall: overall(score),
          improvement: text(body.improvement, 3000), training: text(body.training, 3000), employee_comments: text(body.employeeComments, 3000),
          pip, pip_remarks: pip === 'required' ? text(body.pipRemarks, 3000) : '', pip_start: pip === 'required' && isDate(body.pipStart) ? body.pipStart : null, hod_name: text(body.hodName, 160),
        }).eq('id', id).eq('status', 'pending').select('*').single();
        if (error) throw error;
        return res.status(200).json({ review: full(data) });
      }
      throw fail(405, 'Method not allowed.');
    }

    // ---- Office HR: assign reviews, read every review, and the "For HR use" box.
    if (!['hr_list', 'hr_get', 'hr_assign', 'hr_delete', 'hr_supervisors', 'hr_receive'].includes(action)) throw fail(400, 'Unknown action.');
    const { db, user } = await officeAccess(req, false, 'hr');

    if (req.method === 'GET' && action === 'hr_list') {
      const { data, error } = await db.from('hr_reviews').select(SUMMARY).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return res.status(200).json({ reviews: (data || []).map(row) });
    }
    if (req.method === 'GET' && action === 'hr_get') {
      const { data, error } = await db.from('hr_reviews').select('*').eq('id', text(req.query.id, 60)).maybeSingle();
      if (error) throw error;
      if (!data) throw fail(404, 'Review not found.');
      return res.status(200).json({ review: full(data) });
    }
    // The office accounts HR can give a review to.
    if (req.method === 'GET' && action === 'hr_supervisors') {
      const { data: users, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      const eligible = (users?.users || []).filter((account: any) => (account.app_metadata?.office_access || []).some((office: string) => REVIEWER_OFFICES.includes(office)));
      const ids = eligible.map((account: any) => account.id);
      const personFor = await personNames(db);
      const { data: profiles, error: profileError } = ids.length ? await db.from('profiles').select('id,full_name,status,role,department').in('id', ids) : { data: [], error: null };
      if (profileError) throw profileError;
      // Of the System Admin accounts only the one named "System Admin" is listed.
      const people = new Map((profiles || []).filter((p: any) => p.status === 'active' && (p.role !== 'super_admin' || /^system admin$/i.test(String(p.full_name || '').trim()))).map((p: any) => [p.id, p]));
      const order = ['CEO', 'CFO', 'CHRO', 'COO', 'CPO', 'Admin Klinikal KJ', 'Admin Klinikal SK'];
      return res.status(200).json({ supervisors: eligible.filter((account: any) => people.has(account.id)).map((account: any) => { const p: any = people.get(account.id); return { id: account.id, person: personFor(p.department || '', p.full_name || ''), name: p.role === 'super_admin' ? (/admin/i.test(p.full_name || '') ? p.full_name : `${p.full_name || account.email} (System Admin)`) : roleLabel(p.department || '', p.full_name || ''), account: p.full_name || account.email, email: account.email }; }).sort((a: any, b: any) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99)) });
    }
    // Gives one review to a supervisor for one staff member and period. The staff details are
    // copied from HR's record so the review keeps them even if the record changes later.
    if (req.method === 'POST' && action === 'hr_assign') {
      if (!isId(body.employeeId)) throw fail(400, 'Choose the staff member to review.');
      if (!isId(body.assessorId)) throw fail(400, 'Choose the supervisor who will do the review.');
      const [{ data: member, error: memberError }, { data: assessor, error: assessorError }] = await Promise.all([
        db.from('hr_employees').select('id,full_name,employee_code,designation,department,status').eq('id', body.employeeId).maybeSingle(),
        db.from('profiles').select('id,full_name,status,department').eq('id', body.assessorId).maybeSingle(),
      ]);
      if (memberError || assessorError) throw memberError || assessorError;
      if (!member) throw fail(404, 'Staff member not found.');
      if (!assessor || assessor.status !== 'active') throw fail(404, 'That supervisor account is not active.');
      const { data, error } = await db.from('hr_reviews').insert({
        status: 'pending', employee_id: member.id, staff_name: member.full_name, employee_code: member.employee_code, position: member.designation || '', department: member.department || '',
        assessor_id: assessor.id, assessor_name: (await personNames(db))(assessor.department || '', assessor.full_name || '') || assessor.full_name || '', assigned_by: user.id,
        period_label: text(body.periodLabel, 40), period_start: isDate(body.periodStart) ? body.periodStart : null, period_end: isDate(body.periodEnd) ? body.periodEnd : null,
        assign_remarks: text(body.remarks, 2000),
      }).select('*').single();
      if (error) throw error;
      return res.status(200).json({ review: full(data) });
    }
    // Deletes a review. One still waiting for the supervisor can always be cancelled; a submitted
    // one only on the day it was submitted (Malaysian time), so a mistake can be undone but the
    // record cannot be removed later. Each deletion is written to the HR audit trail.
    if (req.method === 'POST' && action === 'hr_delete') {
      const id = text(body.id, 60);
      const { data: target, error: readError } = await db.from('hr_reviews').select('id,status,employee_id,staff_name,period_label,total_score,assessor_name,submitted_at').eq('id', id).maybeSingle();
      if (readError) throw readError;
      if (!target) throw fail(404, 'Review not found.');
      const day = (value: string) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
      if (target.status === 'submitted' && day(target.submitted_at) !== day(new Date().toISOString())) throw fail(409, 'A submitted review can only be deleted on the day it was submitted.');
      const { error } = await db.from('hr_reviews').delete().eq('id', id);
      if (error) throw error;
      if (target.employee_id) await db.from('hr_audit').insert({ employee_id: target.employee_id, action: 'review_deleted', changes: { review: target.period_label || 'Review', status: target.status, score: target.total_score === null ? null : Number(target.total_score), assessor: target.assessor_name }, changed_by: user.id });
      return res.status(200).json({ success: true });
    }
    if (req.method === 'POST' && action === 'hr_receive') {
      const { data, error } = await db.from('hr_reviews').update({ hr_received_on: isDate(body.receivedOn) ? body.receivedOn : null, hr_received_by: text(body.receivedBy, 120), hr_remarks: text(body.remarks, 2000), updated_at: new Date().toISOString() }).eq('id', text(body.id, 60)).eq('status', 'submitted').select('*').single();
      if (error) throw error;
      return res.status(200).json({ review: full(data) });
    }
    throw fail(405, 'Method not allowed.');
  } catch (error: any) {
    // Before the migrations have been run the tables or columns do not exist yet.
    if (['PGRST205', '42P01', '42703', 'PGRST204'].includes(error?.code)) return res.status(503).json({ error: 'Performance Review is not set up yet: run supabase/migrations/202610280001_performance_reviews.sql and 202610280002_review_assignments.sql in Supabase.' });
    return res.status(error.status || 400).json({ error: error.message || 'Unable to complete this request.' });
  }
}
