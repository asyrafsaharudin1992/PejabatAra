import { branchId, officeAccess, errorReply } from './_office-db.js';
import { buildReviewReminders, validReminderDate, malaysiaToday } from '../src/lib/reviewReminders.js';
import { ASSISTANT_ITEMS, ASSISTANT_OUTCOMES, assistantTotal, outcomeLabel, type AssistantKind } from '../src/lib/assistantReview.js';
import { defaultReviewSettings, normalizeReviewSettings } from '../src/lib/reviewSettings.js';

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
// The people who do reviews, by job title in HR's record: the CEO / CFO, CHRO, COO, CPO and the Clinical Admin of each branch.
export const REVIEWER_TITLES = /\b(CEO|CFO|CHRO|COO|CPO)\b|ADMIN CLINICAL|CLINIC ASSISTANT OFFICER/i;
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

export const REVIEW_SUMMARY = 'id,status,staff_name,employee_code,position,department,assessor_name,period_label,period_start,period_end,assign_remarks,total_score,overall,pip,hr_received_on,created_at,submitted_at,form_type';
export const reviewRow = (r: any) => ({ formType: r.form_type === 'assistant' ? 'assistant' : 'standard', id: r.id, status: r.status, staffName: r.staff_name, employeeCode: r.employee_code, position: r.position, department: r.department, assessorName: r.assessor_name, periodLabel: r.period_label, periodStart: r.period_start, periodEnd: r.period_end, assignRemarks: r.assign_remarks, totalScore: r.total_score === null ? null : Number(r.total_score), overall: r.overall, pip: r.pip, hrReceivedOn: r.hr_received_on, createdAt: r.created_at, submittedAt: r.submitted_at });
export const reviewFull = (r: any) => ({ ...reviewRow(r), assistant: r.assistant || {}, ratings: r.ratings || {}, improvement: r.improvement, training: r.training, employeeComments: r.employee_comments, pipRemarks: r.pip_remarks, pipStart: r.pip_start, hodName: r.hod_name, hrReceivedBy: r.hr_received_by, hrRemarks: r.hr_remarks });

// Submits a review (the supervisor's digital signature). `allow` says whether the review is this person's to fill in.
export async function submitReview(db: any, body: any, allow: (assigned: any) => boolean, myName: string) {
    const id = text(body.id, 60);
    const { data: assigned, error: readError } = await db.from('hr_reviews').select('id,status,assessor_id,assessor_employee_id,assessor_name,form_type').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!assigned) throw fail(404, 'This review was not found. It may have been cancelled by HR.');
    if (assigned.status !== 'pending') throw fail(409, 'This review has already been submitted.');
    if (!allow(assigned)) throw fail(403, 'This review is not assigned to you.');
    // Submitting is the supervisor's digital signature, so they must confirm it.
    if (body.signed !== true) throw fail(400, 'Confirm the review and sign it before submitting.');
    // The clinic assistant form: 19 items marked out of 100 and a result for a contract locum or a probation.
    if (assigned.form_type === 'assistant') {
      const marks = Array.isArray(body.marks) ? body.marks.map(Number) : [];
      if (marks.length !== ASSISTANT_ITEMS.length || marks.some((mark: number, index: number) => !Number.isFinite(mark) || mark * 2 !== Math.round(mark * 2) || mark < 0 || mark > ASSISTANT_ITEMS[index].max)) throw fail(400, 'Enter the marks for all 19 items (from 0 up to the full mark of each item, in steps of 0.5).');
      const kind: AssistantKind = body.kind === 'probation' ? 'probation' : 'locum';
      const outcome = ASSISTANT_OUTCOMES[kind].find((option) => option.value === body.outcome);
      if (!outcome) throw fail(400, 'Choose the result of this review.');
      const term = outcome.terms ? text(body.term, 40) : '';
      if (outcome.terms && !term) throw fail(400, 'Choose the period for this result.');
      const total = assistantTotal(marks);
      const nowAt = new Date().toISOString();
      const { data: saved, error: saveError } = await db.from('hr_reviews').update({
        status: 'submitted', submitted_at: nowAt, updated_at: nowAt, assessor_name: text(body.assessorName, 160) || assigned.assessor_name || myName,
        // The list pages show the score on a 1 to 4 scale as a percentage (4.00 is 100%), so the 100 marks are kept as total / 25.
        total_score: Math.round(total / 25 * 100) / 100, overall: outcomeLabel(kind, outcome.value, term),
        assistant: { marks, panels: text(body.panels, 300), panelsNot: text(body.panelsNot, 300), kind, outcome: outcome.value, term, position: text(body.position, 120) },
      }).eq('id', id).eq('status', 'pending').select('*').single();
      if (saveError) throw saveError;
      return reviewFull(saved);
    }
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
    return reviewFull(data);
}


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
        let query = db.from('hr_reviews').select(REVIEW_SUMMARY).eq('status', 'pending').order('created_at', { ascending: false }).limit(200);
        if (!isAdmin) query = query.eq('assessor_id', user.id);
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ reviews: (data || []).map(reviewRow), assessor: myName });
      }
      if (req.method === 'GET' && action === 'mine') {
        let query = db.from('hr_reviews').select(REVIEW_SUMMARY).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(200);
        if (!isAdmin) query = query.eq('assessor_id', user.id);
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ reviews: (data || []).map(reviewRow), assessor: myName });
      }
      if (req.method === 'POST' && action === 'submit') {
        const review = await submitReview(db, body, (assigned) => isAdmin || assigned.assessor_id === user.id, myName);
        return res.status(200).json({ review });
      }
      throw fail(405, 'Method not allowed.');
    }

    // ---- Office HR: assign reviews, read every review, and the "For HR use" box.
    if (!['hr_list', 'hr_get', 'hr_skipped', 'hr_assign', 'hr_delete', 'hr_supervisors', 'hr_receive', 'hr_reminders', 'hr_reminder_save', 'hr_reminder_state', 'hr_review_settings_save'].includes(action)) throw fail(400, 'Unknown action.');
    const { db, user } = await officeAccess(req, false, 'hr');

    if (req.method === 'GET' && action === 'hr_reminders') {
      // Read the small settings/staff lists first, then only the reminder dates we need.
      // One extra row detects overflow rather than silently reporting incomplete statuses.
      const readLimit = 500;
      const today = malaysiaToday();
      const [peopleResult, settingsResult, probation] = await Promise.all([
        db.from('hr_employees').select('id,company,employee_code,full_name,join_date,confirm_date,designation,status').eq('status', 'Active').limit(readLimit + 1),
        db.from('hr_review_settings').select('settings,updated_at').eq('id', 1).maybeSingle(),
        (async () => {
          const branch = await branchId(db, 'AraOffice HR Private', false);
          if (!branch) return {};
          const { data, error } = await db.from('portal_state').select('payload').eq('branch_id', branch).eq('state_key', 'hr_calendar_config').maybeSingle();
          if (error) throw error;
          return data?.payload?.probation || {};
        })(),
      ]);
      if (peopleResult.error) throw peopleResult.error;
      if ((peopleResult.data || []).length > readLimit) throw fail(422, 'Too many active staff to load reminders safely. Please contact the system administrator.');
      const settingsNotSetUp = !settingsResult.data && (!settingsResult.error || ['PGRST205', '42P01'].includes(settingsResult.error.code));
      if (settingsResult.error && !settingsNotSetUp) throw settingsResult.error;
      const settings = normalizeReviewSettings(settingsResult.data?.settings || defaultReviewSettings(), settingsResult.data?.settings || defaultReviewSettings());
      const people = (peopleResult.data || []).map((r: any) => ({ id: r.id, company: r.company, employeeCode: r.employee_code, fullName: r.full_name, joinDate: r.join_date, confirmDate: r.confirm_date, designation: r.designation, probationStatus: probation[r.id], status: r.status }));
      const customResult = people.length
        ? await db.from('hr_review_reminders').select('id,employee_id,period_label,due_on,notes,completed_at,cancelled_at').in('employee_id', people.map((person) => person.id)).order('due_on').limit(readLimit + 1)
        : { data: [], error: null };
      const notSetUp = customResult.error && ['PGRST205', '42P01'].includes(customResult.error.code);
      if (customResult.error && !notSetUp) throw customResult.error;
      if ((customResult.data || []).length > readLimit) throw fail(422, 'More than 500 staff reminders match. Please contact the system administrator to paginate reminders.');
      const custom = (customResult.data || []).map((r: any) => ({ id: r.id, employeeId: r.employee_id, periodLabel: r.period_label, dueOn: r.due_on, notes: r.notes, completedAt: r.completed_at, cancelledAt: r.cancelled_at }));
      const candidates = buildReviewReminders(people, [], custom, today, settings);
      const dates = [...new Set(candidates.map((item) => item.dueOn))];
      // Undated legacy reviews still participate in matching, as before.
      const reviewsResult = dates.length
        ? await db.from('hr_reviews').select('id,employee_id,employee_code,staff_name,period_label,period_end,status,submitted_at').or(`period_end.in.(${dates.join(',')}),period_end.is.null`).order('created_at', { ascending: false }).limit(readLimit + 1)
        : { data: [], error: null };
      if (reviewsResult.error) throw reviewsResult.error;
      if ((reviewsResult.data || []).length > readLimit) throw fail(422, 'More than 500 reviews match the reminders. Reduce the review date window or contact the system administrator.');
      const reviews = (reviewsResult.data || []).map((r: any) => ({ id: r.id, employeeId: r.employee_id, employeeCode: r.employee_code, staffName: r.staff_name, periodLabel: r.period_label, periodEnd: r.period_end, status: r.status, submittedAt: r.submitted_at }));
      return res.status(200).json({ reminders: buildReviewReminders(people, reviews, custom, today, settings), settings, settingsVersion: settingsResult.data?.updated_at || null, settingsNotSetUp: Boolean(settingsNotSetUp), notSetUp: Boolean(notSetUp) });
    }
    if (req.method === 'POST' && action === 'hr_review_settings_save') {
      const { data: current, error: readError } = await db.from('hr_review_settings').select('settings,updated_at').eq('id', 1).maybeSingle();
      if (readError) throw readError;
      if (!current) throw fail(409, 'Review settings are not set up yet. Run the review-settings migration first.');
      if (body.version !== current.updated_at) throw fail(409, 'Review settings changed in another session. Refresh and check the latest settings before saving.');
      let settings;
      try { settings = normalizeReviewSettings(body.settings, current.settings); }
      catch (cause: any) { throw fail(400, cause.message); }
      const { data, error } = await db.from('hr_review_settings').update({ settings, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', 1).eq('updated_at', current.updated_at).select('settings,updated_at').maybeSingle();
      if (error) throw error;
      if (!data) throw fail(409, 'Another HR session saved first. Refresh the settings before saving.');
      return res.status(200).json({ settings: data.settings, version: data.updated_at });
    }
    if (req.method === 'POST' && action === 'hr_reminder_save') {
      if (!isId(body.employeeId)) throw fail(400, 'Choose an active staff member.');
      const label = text(body.periodLabel, 40);
      if (!label) throw fail(400, 'Enter the assessment needed.');
      if (!validReminderDate(String(body.dueOn || ''))) throw fail(400, 'Choose a valid due date.');
      const { data: person, error: personError } = await db.from('hr_employees').select('id,status').eq('id', body.employeeId).maybeSingle();
      if (personError) throw personError;
      if (!person || person.status !== 'Active') throw fail(400, 'Choose an active staff member.');
      const now = new Date().toISOString();
      const next = { employee_id: person.id, period_label: label, due_on: body.dueOn, notes: text(body.notes, 2000), updated_by: user.id, updated_at: now };
      if (body.id) {
        if (!isId(body.id)) throw fail(400, 'Invalid reminder.');
        const { data, error } = await db.from('hr_review_reminders').update(next).eq('id', body.id).is('completed_at', null).is('cancelled_at', null).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw fail(409, 'This reminder is no longer open.');
      } else {
        const { error } = await db.from('hr_review_reminders').insert({ ...next, created_by: user.id });
        if (error) throw error;
      }
      return res.status(200).json({ success: true });
    }
    if (req.method === 'POST' && action === 'hr_reminder_state') {
      if (!isId(body.id) || !['complete', 'cancel', 'reopen'].includes(body.state)) throw fail(400, 'Choose a valid reminder action.');
      const now = new Date().toISOString();
      const { data, error } = await db.from('hr_review_reminders').update({ completed_at: body.state === 'complete' ? now : null, cancelled_at: body.state === 'cancel' ? now : null, updated_by: user.id, updated_at: now }).eq('id', body.id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw fail(404, 'Reminder not found.');
      return res.status(200).json({ success: true });
    }
    // Review 2 assessments an Admin Klinikal marked "Not needed".
    if (req.method === 'GET' && action === 'hr_skipped') {
      const { data, error } = await db.from('hr_review_skips').select('stage,reason,skipped_by,skipped_at,staff:hr_employees!hr_review_skips_employee_id_fkey(full_name,employee_code,company)').order('skipped_at', { ascending: false }).limit(200);
      if (error) { if (['42P01', 'PGRST205'].includes(error.code)) return res.status(200).json({ skipped: [] }); throw error; }
      return res.status(200).json({ skipped: (data || []).map((row: any) => ({ name: row.staff?.full_name || '', code: row.staff?.employee_code || '', company: row.staff?.company || '', stage: row.stage, reason: row.reason, by: row.skipped_by, at: row.skipped_at })) });
    }
    if (req.method === 'GET' && action === 'hr_list') {
      const { data, error } = await db.from('hr_reviews').select(REVIEW_SUMMARY).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return res.status(200).json({ reviews: (data || []).map(reviewRow) });
    }
    if (req.method === 'GET' && action === 'hr_get') {
      const { data, error } = await db.from('hr_reviews').select('*').eq('id', text(req.query.id, 60)).maybeSingle();
      if (error) throw error;
      if (!data) throw fail(404, 'Review not found.');
      return res.status(200).json({ review: reviewFull(data) });
    }
    // The people HR can give a review to: the reviewers by job title, each signing in with their own Individual Sign In.
    if (req.method === 'GET' && action === 'hr_supervisors') {
      const { data: people, error } = await db.from('hr_employees').select('id,company,employee_code,full_name,designation').eq('status', 'Active').limit(500);
      if (error) throw error;
      const label = (person: any) => { const title = String(person.designation || ''); if (/ADMIN CLINICAL|CLINIC ASSISTANT OFFICER/i.test(title)) return `Admin Klinikal ${person.company}`; if (/CEO/i.test(title)) return /CFO/i.test(title) ? 'CEO / CFO' : 'CEO'; if (/CFO/i.test(title)) return 'CFO'; return ['CHRO', 'COO', 'CPO'].find((role) => new RegExp(`\\b${role}\\b`, 'i').test(title)) || title; };
      const order = ['CEO / CFO', 'CEO', 'CFO', 'CHRO', 'COO', 'CPO', 'Admin Klinikal KJ', 'Admin Klinikal SK'];
      const named = (person: any) => `${/DR RESIDENT|DOCTOR/i.test(person.designation || '') ? 'DR ' : ''}${person.full_name}`;
      const supervisors = (people || []).filter((person: any) => REVIEWER_TITLES.test(String(person.designation || ''))).map((person: any) => ({ id: person.id, name: label(person), person: named(person) })).sort((a: any, b: any) => (order.indexOf(a.name) < 0 ? 99 : order.indexOf(a.name)) - (order.indexOf(b.name) < 0 ? 99 : order.indexOf(b.name)) || a.name.localeCompare(b.name));
      return res.status(200).json({ supervisors });
    }
    // Gives one review to a supervisor for one staff member and period. The staff details are
    // copied from HR's record so the review keeps them even if the record changes later.
    if (req.method === 'POST' && action === 'hr_assign') {
      if (!isId(body.employeeId)) throw fail(400, 'Choose the staff member to review.');
      if (!isId(body.assessorId)) throw fail(400, 'Choose the supervisor who will do the review.');
      const [{ data: member, error: memberError }, { data: assessor, error: assessorError }] = await Promise.all([
        db.from('hr_employees').select('id,full_name,employee_code,designation,department,status').eq('id', body.employeeId).maybeSingle(),
        db.from('hr_employees').select('id,full_name,designation,status').eq('id', body.assessorId).maybeSingle(),
      ]);
      if (memberError || assessorError) throw memberError || assessorError;
      if (!member) throw fail(404, 'Staff member not found.');
      if (!assessor || assessor.status !== 'Active' || !REVIEWER_TITLES.test(String(assessor.designation || ''))) throw fail(404, 'That supervisor is not active or is not one of the reviewers.');
      const { data, error } = await db.from('hr_reviews').insert({
        status: 'pending', employee_id: member.id, staff_name: member.full_name, employee_code: member.employee_code, position: member.designation || '', department: member.department || '',
        assessor_employee_id: assessor.id, assessor_name: `${/DR RESIDENT|DOCTOR/i.test(assessor.designation || '') ? 'DR ' : ''}${assessor.full_name}`, assigned_by: user.id,
        period_label: text(body.periodLabel, 40), period_start: isDate(body.periodStart) ? body.periodStart : null, period_end: isDate(body.periodEnd) ? body.periodEnd : null,
        assign_remarks: text(body.remarks, 2000), form_type: body.formType === 'assistant' ? 'assistant' : 'standard',
      }).select('*').single();
      if (error) throw error;
      return res.status(200).json({ review: reviewFull(data) });
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
      return res.status(200).json({ review: reviewFull(data) });
    }
    throw fail(405, 'Method not allowed.');
  } catch (error: any) {
    // Before the migrations have been run the tables or columns do not exist yet.
    if (['PGRST205', '42P01', '42703', 'PGRST204'].includes(error?.code)) return res.status(503).json({ error: 'Performance Review is not set up yet: run supabase/migrations/202610280001_performance_reviews.sql and 202610280002_review_assignments.sql in Supabase.' });
    return errorReply(res, error, 'Unable to complete this request.');
  }
}
