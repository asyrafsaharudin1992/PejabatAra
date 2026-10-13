import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { activeAccount, hashSecret, serviceDb } from './_office-db.js';

// Assessment Room. Served from /api/status?resource=assessment because the
// Vercel Hobby plan allows only 12 functions.
//
// Staff sign in with name + staff code + last 4 IC digits (no shared account, no device lock) and
// send the session token as x-assessment-token. Management actions need a
// System Admin Supabase session instead.
const SESSION_HOURS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// Staff may type the code with spaces, dashes or lower case.
const normaliseCode = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Names match ignoring case, spacing and punctuation ("Nur Aisyah" = "nur  aisyah.").
const nameKey = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I lookalikes
const newStaffCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const normaliseIc4 = (value: unknown) => String(value || '').replace(/\D/g, '');

// Last 4 IC digits: only a salted scrypt hash is stored, never the digits.
function hashIc4(digits: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(digits, salt, 32).toString('hex')}`;
}
function ic4Matches(digits: string, stored: string | null) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  return timingSafeEqual(scryptSync(digits, salt, expected.length), expected);
}
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

async function staffSession(db: any, req: any) {
  const token = String(req.headers['x-assessment-token'] || '');
  if (!token) throw fail(401, 'Please sign in to the Assessment Room.');
  const { data, error } = await db.from('assessment_sessions').select('staff_id,expires_at,assessment_staff(id,name,branch,active,can_preview)')
    .eq('token_hash', hashSecret(token)).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw error;
  if (!data?.assessment_staff?.active) throw fail(401, 'Your session has ended. Please sign in again.');
  return data.assessment_staff as { id: string; name: string; branch: string; can_preview: boolean };
}

// Validates an admin-submitted question list; returns it with ids filled in.
function cleanQuestions(value: unknown) {
  if (!Array.isArray(value) || !value.length) throw fail(400, 'Add at least one question.');
  return value.map((question: any, index: number) => {
    const options = (Array.isArray(question?.options) ? question.options : []).map((option: unknown) => text(option, 300)).filter(Boolean);
    const questionText = text(question?.text, 1000);
    const answer = Number(question?.answer);
    if (!questionText) throw fail(400, `Question ${index + 1} has no text.`);
    if (options.length < 2) throw fail(400, `Question ${index + 1} needs at least two options.`);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw fail(400, `Choose the correct answer for question ${index + 1}.`);
    return { id: text(question?.id, 60) || randomUUID(), text: questionText, options, answer };
  });
}

async function staffAction(req: any, res: any, action: string, body: any) {
  const db = serviceDb();

  if (req.method === 'POST' && action === 'login') {
    const code = normaliseCode(body.code);
    const name = nameKey(body.name);
    const ic4 = normaliseIc4(body.ic4);
    if (!code || !name || ic4.length !== 4) throw fail(400, 'Enter your name, staff code and the last 4 digits of your IC.');
    const { data: staff, error } = await db.from('assessment_staff').select('id,name,branch,active,failed_logins,locked_until,ic4_hash').eq('staff_code', code).maybeSingle();
    if (error) throw error;
    if (staff?.locked_until && Date.parse(staff.locked_until) > Date.now()) throw fail(429, `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`);
    if (!staff || !staff.active || nameKey(staff.name) !== name || !ic4Matches(ic4, staff.ic4_hash)) {
      if (staff) {
        const failed = staff.failed_logins + 1;
        await db.from('assessment_staff').update(failed >= MAX_FAILED_LOGINS
          ? { failed_logins: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() }
          : { failed_logins: failed }).eq('id', staff.id);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      throw fail(400, 'Name, staff code or IC digits are not correct.');
    }
    await db.from('assessment_staff').update({ failed_logins: 0, locked_until: null }).eq('id', staff.id);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
    const { error: sessionError } = await db.from('assessment_sessions').insert({ staff_id: staff.id, token_hash: hashSecret(token), expires_at: expiresAt });
    if (sessionError) throw sessionError;
    // Housekeeping: expired sessions are useless, so drop them while we are here.
    await db.from('assessment_sessions').delete().lt('expires_at', new Date().toISOString());
    return res.status(200).json({ token, staff: { name: staff.name, branch: staff.branch } });
  }

  if (req.method === 'POST' && action === 'logout') {
    const token = String(req.headers['x-assessment-token'] || '');
    if (token) await db.from('assessment_sessions').delete().eq('token_hash', hashSecret(token));
    return res.status(200).json({ success: true });
  }

  const staff = await staffSession(db, req);

  if (req.method === 'GET' && action === 'me') {
    // Preview accounts see every assessment, including closed ones.
    let quizQuery = db.from('assessment_quizzes').select('id,title,description,pass_mark,active,questions').order('created_at', { ascending: false });
    if (!staff.can_preview) quizQuery = quizQuery.eq('active', true);
    const [{ data: quizzes, error: quizError }, { data: attempts, error: attemptError }] = await Promise.all([
      quizQuery,
      db.from('assessment_attempts').select('quiz_id,score,total,submitted_at').eq('staff_id', staff.id),
    ]);
    if (quizError || attemptError) throw quizError || attemptError;
    const byQuiz = new Map((attempts || []).map((row: any) => [row.quiz_id, row]));
    return res.status(200).json({
      staff: { name: staff.name, branch: staff.branch, preview: staff.can_preview },
      quizzes: (quizzes || []).map((quiz: any) => {
        const attempt: any = byQuiz.get(quiz.id);
        return { id: quiz.id, title: quiz.title, description: quiz.description, passMark: quiz.pass_mark, active: quiz.active, questionCount: quiz.questions.length, attempt: attempt ? { score: attempt.score, total: attempt.total, submittedAt: attempt.submitted_at } : null };
      }),
    });
  }

  if (req.method === 'GET' && action === 'quiz') {
    let quizQuery = db.from('assessment_quizzes').select('id,title,description,pass_mark,questions').eq('id', text(req.query.id));
    if (!staff.can_preview) quizQuery = quizQuery.eq('active', true);
    const { data: quiz, error } = await quizQuery.maybeSingle();
    if (error) throw error;
    if (!quiz) throw fail(404, 'This assessment is not open.');
    // Correct answers stay on the server, except for preview accounts.
    return res.status(200).json({ id: quiz.id, title: quiz.title, description: quiz.description, passMark: quiz.pass_mark, preview: staff.can_preview, questions: quiz.questions.map((question: any) => ({ id: question.id, text: question.text, options: question.options, ...(staff.can_preview ? { answer: question.answer } : {}) })) });
  }

  if (req.method === 'POST' && action === 'submit') {
    if (staff.can_preview) throw fail(403, 'Preview accounts cannot submit answers.');
    const { data: quiz, error } = await db.from('assessment_quizzes').select('id,pass_mark,questions').eq('id', text(body.id)).eq('active', true).maybeSingle();
    if (error) throw error;
    if (!quiz) throw fail(404, 'This assessment is not open.');
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const questions = quiz.questions as { id: string; answer: number }[];
    if (questions.some((question) => !Number.isInteger(answers[question.id]))) throw fail(400, 'Answer every question before submitting.');
    const score = questions.filter((question) => answers[question.id] === question.answer).length;
    const { error: insertError } = await db.from('assessment_attempts').insert({ quiz_id: quiz.id, staff_id: staff.id, answers, score, total: questions.length });
    if (insertError?.code === '23505') throw fail(409, 'You have already submitted this assessment.');
    if (insertError) throw insertError;
    return res.status(200).json({ score, total: questions.length, passMark: quiz.pass_mark });
  }

  throw fail(405, 'Method not allowed.');
}

async function adminAction(req: any, res: any, action: string, body: any) {
  const { db, user, profile } = await activeAccount(req);
  if (profile.role !== 'super_admin') throw fail(403, 'Only System Admin can manage the Assessment Room.');
  const now = new Date().toISOString();

  // User Management only needs the staff list, so skip quizzes and results.
  if (req.method === 'GET' && action === 'staff') {
    const { data, error } = await db.from('assessment_staff').select('id,name,staff_code,branch,active,ic4_hash,can_preview').order('name');
    if (error) throw error;
    return res.status(200).json({ staff: (data || []).map((row: any) => ({ id: row.id, name: row.name, code: row.staff_code, branch: row.branch, active: row.active, hasIc4: Boolean(row.ic4_hash), preview: row.can_preview })) });
  }

  if (req.method === 'GET' && action === 'admin') {
    const [staff, quizzes, attempts] = await Promise.all([
      db.from('assessment_staff').select('id,name,staff_code,branch,active,can_preview').order('name'),
      db.from('assessment_quizzes').select('id,title,description,pass_mark,active,questions,updated_at').order('created_at', { ascending: false }),
      db.from('assessment_attempts').select('id,quiz_id,staff_id,score,total,submitted_at').order('submitted_at', { ascending: false }),
    ]);
    if (staff.error || quizzes.error || attempts.error) throw staff.error || quizzes.error || attempts.error;
    return res.status(200).json({
      staff: (staff.data || []).map((row: any) => ({ id: row.id, name: row.name, code: row.staff_code, branch: row.branch, active: row.active, preview: row.can_preview })),
      quizzes: (quizzes.data || []).map((row: any) => ({ id: row.id, title: row.title, description: row.description, passMark: row.pass_mark, active: row.active, questions: row.questions, updatedAt: row.updated_at })),
      attempts: (attempts.data || []).map((row: any) => ({ id: row.id, quizId: row.quiz_id, staffId: row.staff_id, score: row.score, total: row.total, submittedAt: row.submitted_at })),
    });
  }

  if (req.method === 'POST' && action === 'save_staff') {
    const name = text(body.name, 120);
    // A blank code gets a random one so admins don't have to invent codes.
    const code = normaliseCode(body.code) || newStaffCode();
    if (!name) throw fail(400, 'Enter the staff name.');
    if (code.length < 3 || code.length > 20) throw fail(400, 'Staff code must be 3 to 20 letters or digits.');
    const ic4 = normaliseIc4(body.ic4);
    if (!body.id && ic4.length !== 4) throw fail(400, 'Enter the last 4 digits of the IC.');
    if (ic4 && ic4.length !== 4) throw fail(400, 'IC digits must be exactly 4 numbers.');
    const row: Record<string, unknown> = { name, staff_code: code, branch: text(body.branch, 40), active: body.active !== false, can_preview: Boolean(body.preview), failed_logins: 0, locked_until: null, updated_at: now };
    // Leaving the IC digits blank while editing keeps the current ones.
    if (ic4) row.ic4_hash = hashIc4(ic4);
    const { error } = body.id ? await db.from('assessment_staff').update(row).eq('id', text(body.id)) : await db.from('assessment_staff').insert(row);
    if (error?.code === '23505') throw fail(409, `Staff code ${code} is already used by another staff member.`);
    if (error) throw error;
    // Deactivated staff are signed out straight away.
    if (body.id && body.active === false) await db.from('assessment_sessions').delete().eq('staff_id', text(body.id));
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && action === 'delete_staff') {
    const { error } = await db.from('assessment_staff').delete().eq('id', text(body.id));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && action === 'save_quiz') {
    const title = text(body.title, 160);
    if (!title) throw fail(400, 'Give the assessment a title.');
    const passMark = Math.round(Number(body.passMark));
    if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) throw fail(400, 'Pass mark must be between 0 and 100%.');
    const row = { title, description: text(body.description, 2000), pass_mark: passMark, active: Boolean(body.active), questions: cleanQuestions(body.questions), updated_at: now, updated_by: user.id };
    const { error } = body.id ? await db.from('assessment_quizzes').update(row).eq('id', text(body.id)) : await db.from('assessment_quizzes').insert(row);
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && action === 'set_quiz_active') {
    const { error } = await db.from('assessment_quizzes').update({ active: Boolean(body.active), updated_at: now, updated_by: user.id }).eq('id', text(body.id));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && action === 'delete_quiz') {
    const { error } = await db.from('assessment_quizzes').delete().eq('id', text(body.id));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST' && action === 'reset_attempt') {
    const { error } = await db.from('assessment_attempts').delete().eq('id', text(body.id));
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  throw fail(405, 'Method not allowed.');
}

const ADMIN_ACTIONS = new Set(['staff', 'admin', 'save_staff', 'delete_staff', 'save_quiz', 'set_quiz_active', 'delete_quiz', 'reset_attempt']);

export async function assessmentHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const action = text(req.query.action || body.action, 40);
    return ADMIN_ACTIONS.has(action) ? await adminAction(req, res, action, body) : await staffAction(req, res, action, body);
  } catch (error: any) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to complete this request.' });
  }
}
