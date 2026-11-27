import { randomBytes } from 'node:crypto';
import PDFDocument from 'pdfkit';

// Payroll > Payslips > Email payslips. HR's computer draws each payslip as a picture; here it is put in a PDF locked (AES-256) with the staff member's own
// IC number, taken from their HR record, and sent through Brevo to the address on that record, or as a test to the address of the person signed in. Nothing is kept but who was
// sent which month and when. The Brevo key is the BREVO_API_KEY setting of the server; it is never in the code or the app.
export const PAYSLIP_SENDER = { email: 'hr@hsohealthcare.com', name: 'HR - HSO Healthcare' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STATE_KEY = 'payslip_emails';
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const validEmail = (value: unknown) => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(String(value || '').trim());

// The password of the file: the 12 digits of the IC number; the passport number for someone without one.
export function payslipPassword(person: { ic_no?: string | null; passport_no?: string | null }) {
  const ic = String(person.ic_no || '').replace(/\D/g, '');
  if (ic.length === 12) return { password: ic, hint: 'your IC number (12 digits, without dashes)' };
  const passport = String(person.passport_no || '').replace(/\s/g, '').toUpperCase();
  if (passport.length >= 6) return { password: passport, hint: 'your passport number (capital letters, no spaces)' };
  return null;
}

export function lockedPayslipPdf(pages: Buffer[], password: string, title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, pdfVersion: '1.7ext3', userPassword: password, ownerPassword: randomBytes(24).toString('hex'), permissions: { printing: 'highResolution' }, info: { Title: title } });
    const parts: Buffer[] = [];
    doc.on('data', (part: Buffer) => parts.push(part)); doc.on('end', () => resolve(Buffer.concat(parts))); doc.on('error', reject);
    try { pages.forEach((page, at) => { if (at) doc.addPage(); doc.image(page, 0, 0, { fit: [595.28, 841.89], align: 'center' }); }); doc.end(); } catch (error) { reject(error); }
  });
}

export function payslipMessage(name: string, month: number, year: number, hint: string, recalculated = false) {
  const period = `${MONTHS[month - 1]} ${year}`;
  return { subject: `Payslip of the Month - ${period}`, text: `Hi ${name},\n\nThis is your payslip for ${period}. To open the attached file, enter ${hint}.\n\n${recalculated ? 'The file has two pages: page 1 is your payslip as paid; page 2 is the same month worked out again (Pengiraan Semula), for reference, showing the difference in nett pay.\n\n' : ''}Please keep this file private.\n\nRegards,\nHR` };
}

export async function sendThroughBrevo(key: string, to: { email: string; name: string }, message: { subject: string; text: string }, file: { name: string; content: Buffer }, send: typeof fetch = fetch) {
  const response = await send('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: PAYSLIP_SENDER, to: [to], subject: message.subject, textContent: message.text, attachment: [{ name: file.name, content: file.content.toString('base64') }] }) });
  if (!response.ok) { const reply: any = await response.json().catch(() => ({})); throw fail(502, `Brevo did not accept the email: ${String(reply.message || response.status).slice(0, 200)}`); }
}

async function sentList(db: any, branchId: string) {
  const { data, error } = await db.from('portal_state').select('payload').eq('branch_id', branchId).eq('state_key', STATE_KEY).maybeSingle();
  if (error) throw error;
  return { exists: !!data, sent: (data?.payload?.sent || {}) as Record<string, Record<string, { at: string; by: string }>> };
}

export async function payslipEmailAction(req: any, res: any, db: any, user: any, action: string, body: any, branchId: string, hidden: Set<string>) {
  const year = Math.round(Number(req.query.year ?? body.year)), month = Math.round(Number(req.query.month ?? body.month));
  if (!(year >= 2020 && year <= 2100) || !(month >= 1 && month <= 12)) throw fail(400, 'Choose a month.');
  const period = `${year}-${String(month).padStart(2, '0')}`;
  const key = String(process.env.BREVO_API_KEY || '').trim();
  // A test goes to whoever is signed in (HR's address if that account has none), never to the staff member.
  const tester = validEmail(user?.email) ? { email: String(user.email).trim(), name: 'Payslip test' } : PAYSLIP_SENDER;
  if (req.method === 'GET' && action === 'payslip_email_status') {
    const { data: slips, error } = await db.from('hr_payslips').select('employee_id').eq('year', year).eq('month', month).eq('status', 'locked').limit(1000);
    if (error) throw error;
    const ids = (slips || []).map((row: any) => row.employee_id);
    const { data: people, error: peopleError } = ids.length ? await db.from('hr_employees').select('id,email,ic_no,passport_no').in('id', ids) : { data: [] as any[], error: null };
    if (peopleError) throw peopleError;
    const { sent } = await sentList(db, branchId);
    return res.status(200).json({ configured: !!key, hidden: hidden.has(period), sender: PAYSLIP_SENDER.email, testTo: tester.email, sent: sent[period] || {},
      people: Object.fromEntries((people || []).map((person: any) => [person.id, { email: validEmail(person.email) ? String(person.email).trim() : '', problem: !validEmail(person.email) ? 'No email address in the profile' : !payslipPassword(person) ? 'No IC or passport number in the profile' : '' }])) });
  }
  if (req.method !== 'POST' || action !== 'payslip_email_send') throw fail(405, 'Method not allowed.');
  if (!key) throw fail(400, 'Email is not set up yet: add BREVO_API_KEY to the server settings, then deploy again.');
  if (hidden.has(period)) throw fail(400, 'This month is hidden from staff, so its payslips cannot be emailed.');
  const id = String(body.employeeId || ''), test = body.test === true;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw fail(400, 'Choose a staff member.');
  const images = (Array.isArray(body.images) ? body.images : []).slice(0, 2).map((item: unknown) => typeof item === 'string' && item.length < 2_000_000 ? Buffer.from(item.replace(/^data:image\/jpeg;base64,/, ''), 'base64') : Buffer.alloc(0));
  if (!images.length || images.some((image: Buffer) => image.length < 1000 || image[0] !== 0xff || image[1] !== 0xd8)) throw fail(400, 'The payslip picture did not arrive. Try again.');
  const [{ data: slip, error }, { data: person, error: personError }] = await Promise.all([
    db.from('hr_payslips').select('status,recalculated:result->recalculated->net').eq('employee_id', id).eq('year', year).eq('month', month).maybeSingle(),
    db.from('hr_employees').select('full_name,employee_code,email,ic_no,passport_no').eq('id', id).maybeSingle(),
  ]);
  if (error || personError) throw error || personError;
  if (!person || slip?.status !== 'locked') throw fail(400, 'Only a locked payslip can be emailed.');
  // A month with a payslip 2 must carry both pages (an old page still open in the browser would send only the first).
  const two = slip.recalculated !== null && slip.recalculated !== undefined;
  if (images.length !== (two ? 2 : 1)) throw fail(400, 'Refresh the page, then send again.');
  const lock = payslipPassword(person);
  if (!lock) throw fail(400, 'No IC or passport number in the profile.');
  if (!test && !validEmail(person.email)) throw fail(400, 'No email address in the profile.');
  const before = await sentList(db, branchId);
  if (!test && before.sent[period]?.[id] && body.again !== true) throw fail(409, 'Already emailed for this month.');
  const message = payslipMessage(person.full_name, month, year, lock.hint, two);
  const pdf = await lockedPayslipPdf(images, lock.password, message.subject);
  await sendThroughBrevo(key, test ? tester : { email: String(person.email).trim(), name: person.full_name }, test ? { ...message, subject: `[TEST ${person.employee_code}] ${message.subject}` } : message, { name: `Payslip_${person.employee_code}_${period}.pdf`, content: pdf });
  if (test) return res.status(200).json({ sent: true, test: true, to: tester.email });
  const by = String(user?.email || '').slice(0, 120), at = new Date().toISOString();
  const { exists, sent } = await sentList(db, branchId);
  const row = { payload: { sent: { ...sent, [period]: { ...sent[period], [id]: { at, by } } } }, updated_at: at, updated_by: user.id };
  const { error: saveError } = exists ? await db.from('portal_state').update(row).eq('branch_id', branchId).eq('state_key', STATE_KEY) : await db.from('portal_state').insert({ branch_id: branchId, state_key: STATE_KEY, ...row });
  if (saveError) throw saveError;
  await db.from('hr_audit').insert({ employee_id: id, action: 'update', changes: { payslip_emailed: period, by }, changed_by: user.id }).then(() => null, () => null);
  return res.status(200).json({ sent: true, at });
}
