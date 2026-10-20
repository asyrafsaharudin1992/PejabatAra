import { officeAccess } from './_office-db.js';

const BRANCH_NAME = 'AraSpace Clinical Assistants';
const WORKSPACE_KEY = 'ca_workspace';
const READS_KEY = 'ca_announcement_reads';
const PROCEDURES_KEY = 'ca_procedures';
const FORMS_KEY = 'ca_print_forms';
const CLINICAL_FORMS_KEY = 'clinical_print_forms';
const CV_KEY = 'ca_cash_voucher_numbers';
const VIDEO_KEY = 'ca_video';

// The training video is a Google Drive file. Only its file id is kept (never the share link), and it
// is only sent to signed-in CA accounts, so it never sits in the public repo.
const driveFileId = (value: unknown) => String(value ?? '').match(/^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{20,80})/)?.[1] || '';

async function stateBranch(db: any) {
  const { data: existing, error: lookupError } = await db.from('branches').select('id').eq('name', BRANCH_NAME).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id;
  const { data, error } = await db.from('branches').insert({ name: BRANCH_NAME, active: true }).select('id').single();
  if (error) throw error;
  return data.id;
}

// Staff who must read announcements: the active Assessment Room staff list, minus preview and test accounts.
async function announcementStaff(db: any) {
  const { data, error } = await db.from('assessment_staff').select('id,name,branch').eq('active', true).eq('can_preview', false).neq('branch', 'Test').order('branch').order('name');
  if (error) throw error;
  return (data || []).map((item: any) => ({ id: item.id, name: item.name, branch: item.branch }));
}

// Any CA account may mark a staff member as having read an announcement; reads live beside the workspace.
async function announcementReads(req: any, res: any, db: any, branchId: string, userId: string, isAdmin: boolean) {
  const load = async (key: string) => { const { data, error } = await db.from('portal_state').select('payload').eq('branch_id', branchId).eq('state_key', key).maybeSingle(); if (error) throw error; return data?.payload || null; };
  const [staff, stored] = await Promise.all([announcementStaff(db), load(READS_KEY)]);
  const reads: Record<string, Record<string, string>> = stored?.reads || {};
  if (req.method === 'GET') return res.status(200).json({ staff, reads });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const announcements: any[] = (await load(WORKSPACE_KEY))?.announcements || [];
  if (!announcements.some((item) => item.id === body.announcementId)) return res.status(404).json({ error: 'That announcement no longer exists.' });
  if (!staff.some((item: any) => item.id === body.staffId)) return res.status(400).json({ error: 'Please choose a staff name.' });
  if (body.unread && !isAdmin) return res.status(403).json({ error: 'Only System Admin can untick a name.' });
  // Drop reads for deleted announcements while saving.
  const next = Object.fromEntries(Object.entries(reads).filter(([id]) => announcements.some((item) => item.id === id)));
  next[body.announcementId] = { ...(next[body.announcementId] || {}), [body.staffId]: new Date().toISOString() };
  if (body.unread) delete next[body.announcementId][body.staffId];
  const { error } = await db.from('portal_state').upsert({ branch_id: branchId, state_key: READS_KEY, payload: { reads: next }, updated_by: userId }, { onConflict: 'branch_id,state_key' });
  if (error) throw error;
  return res.status(200).json({ staff, reads: next });
}

const PHOTO_BUCKET = 'procedure-photos';
const photosOf = (payload: any) => new Set<string>((payload?.procedures || []).map((item: any) => item.photo).filter(Boolean));

// A new or replaced procedure photo arrives with the save; store it and point that procedure at it.
async function uploadProcedurePhoto(db: any, body: any) {
  const target = (body.payload.procedures || []).find((item: any) => item.id === body.photoFor);
  if (!target) throw Object.assign(new Error('That procedure no longer exists.'), { status: 400 });
  const ext = String(body.photo.name || '').toLowerCase().match(/\.(png|jpe?g|webp)$/)?.[1];
  if (!ext || !body.photo.base64) throw Object.assign(new Error('Use a PNG, JPG or WebP photo.'), { status: 400 });
  const bytes = Buffer.from(body.photo.base64, 'base64');
  if (bytes.byteLength > 2 * 1024 * 1024) throw Object.assign(new Error('Photo must be 2MB or smaller.'), { status: 400 });
  // A fresh name each time, so the year-long browser cache never shows an old photo.
  const path = `uploads/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: body.photo.type || 'image/webp', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  target.photo = path;
}

// Photos of deleted procedures, and photos that were replaced, are removed from Storage.
async function removeUnusedPhotos(db: any, before: any, after: any) {
  const kept = photosOf(after);
  const unused = [...photosOf(before)].filter((photo) => !kept.has(photo));
  if (unused.length) await db.storage.from(PHOTO_BUCKET).remove(unused);
}

const FORMS_BUCKET = 'print-forms';
const formFilesOf = (payload: any) => new Set<string>((payload?.forms || []).map((item: any) => item.file).filter(Boolean));

// A new or replaced print form PDF arrives with the save; store it and point that form at it.
async function uploadFormFile(db: any, body: any) {
  const target = (body.payload.forms || []).find((item: any) => item.id === body.fileFor);
  if (!target) throw Object.assign(new Error('That form no longer exists.'), { status: 400 });
  const bytes = Buffer.from(String(body.file.base64 || ''), 'base64');
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw Object.assign(new Error('Use a PDF file.'), { status: 400 });
  if (bytes.byteLength > 3 * 1024 * 1024) throw Object.assign(new Error('PDF must be 3MB or smaller.'), { status: 400 });
  // A fresh name each time, so the year-long browser cache never prints an old version.
  const path = `uploads/${crypto.randomUUID()}.pdf`;
  const { error } = await db.storage.from(FORMS_BUCKET).upload(path, bytes, { contentType: 'application/pdf', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  target.file = path;
  target.size = bytes.byteLength;
}

async function removeUnusedFormFiles(db: any, before: any, after: any) {
  const kept = formFilesOf(after);
  const unused = [...formFilesOf(before)].filter((file) => !kept.has(file));
  if (unused.length) await db.storage.from(FORMS_BUCKET).remove(unused);
}

// The last cash voucher number each branch printed. Any CA account records a number once staff
// confirm it printed; a short history is kept so a skipped or repeated number can be traced.
async function cashVoucherNumbers(req: any, res: any, db: any, branchId: string, userId: string) {
  const { data: existing, error: readError } = await db.from('portal_state').select('payload').eq('branch_id', branchId).eq('state_key', CV_KEY).maybeSingle();
  if (readError) throw readError;
  const stored = existing?.payload || { last: {}, history: [] };
  if (req.method === 'GET') return res.status(200).json({ last: stored.last || {} });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const voucherId = String(body.voucherId || '').slice(0, 40);
  const cvNo = String(body.cvNo || '').trim().toUpperCase().slice(0, 20);
  if (!voucherId || !cvNo) return res.status(400).json({ error: 'Voucher and CV number are required.' });
  const entry = { cvNo, date: String(body.date || '').slice(0, 10), at: new Date().toISOString() };
  const payload = { last: { ...(stored.last || {}), [voucherId]: entry }, history: [{ voucherId, ...entry }, ...(stored.history || [])].slice(0, 200) };
  const { error } = await db.from('portal_state').upsert({ branch_id: branchId, state_key: CV_KEY, payload, updated_by: userId }, { onConflict: 'branch_id,state_key' });
  if (error) throw error;
  return res.status(200).json({ last: payload.last });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, user, profile } = await officeAccess(req, false, 'ca');
    const branchId = await stateBranch(db);
    if (req.query.scope === 'reads') return await announcementReads(req, res, db, branchId, user.id, profile.role === 'super_admin');
    if (req.query.scope === 'cv') return await cashVoucherNumbers(req, res, db, branchId, user.id);
    // Clinical procedures and print forms live in their own rows so the workspace payload stays small.
    // clinical_forms is the Clinical Admin office's own Print Forms list (its accounts also have CA access).
    const scope = ['personal', 'procedures', 'forms', 'clinical_forms', 'video'].includes(req.query.scope) ? req.query.scope : 'workspace';
    const stateKey = scope === 'personal' ? `ca_personal_${user.id}` : scope === 'procedures' ? PROCEDURES_KEY : scope === 'forms' ? FORMS_KEY : scope === 'clinical_forms' ? CLINICAL_FORMS_KEY : scope === 'video' ? VIDEO_KEY : WORKSPACE_KEY;
    const formsScope = scope === 'forms' || scope === 'clinical_forms';
    const { data: existing, error: readError } = await db.from('portal_state').select('payload,updated_at').eq('branch_id', branchId).eq('state_key', stateKey).maybeSingle();
    if (readError) throw readError;

    if (req.method === 'GET') return res.status(200).json({ payload: existing?.payload || null, updatedAt: existing?.updated_at || null });
    if (!['POST', 'PATCH', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
    if (scope !== 'personal' && profile.role !== 'super_admin') return res.status(403).json({ error: 'Only System Admin can update shared CA content.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) return res.status(400).json({ error: 'A valid portal payload is required.' });
    if (scope === 'video') {
      const fileId = driveFileId(body.payload.url);
      if (body.payload.url && !fileId) return res.status(400).json({ error: 'Paste a Google Drive file link (drive.google.com/file/d/...).' });
      body.payload = { fileId, title: String(body.payload.title ?? '').trim().slice(0, 120) };
    }
    if (scope === 'procedures' && body.photo) await uploadProcedurePhoto(db, body);
    if (formsScope && body.file) await uploadFormFile(db, body);
    const { data, error } = await db.from('portal_state').upsert({ branch_id: branchId, state_key: stateKey, payload: body.payload, updated_by: user.id }, { onConflict: 'branch_id,state_key' }).select('payload,updated_at').single();
    if (error) throw error;
    if (scope === 'procedures') await removeUnusedPhotos(db, existing?.payload, data.payload);
    if (formsScope) await removeUnusedFormFiles(db, existing?.payload, data.payload);
    return res.status(200).json({ payload: data.payload, updatedAt: data.updated_at });
  } catch (error: any) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to save CA portal content.' });
  }
}
