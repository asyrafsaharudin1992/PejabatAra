import { Buffer } from 'node:buffer';
import { branchId } from './_office-db.js';

// Staff photos. Kept in a PRIVATE bucket; nobody opens the bucket directly. Only the API makes a link, which works for a short time, and only for
// the people who may see the photo: the staff member (their own), HR, and the management who have the Charts tab.
// Checks on every upload (OWASP: validate the file, never trust the name or the type the browser says):
//  - HR only, a real staff member of this company;
//  - the bytes must be a real JPEG (the first bytes say so), at most 400 KB, and a sensible size in pixels;
//  - the file name is made by the server (the staff id), never by the person who uploads, so there is no path to guess or climb.
// The browser shrinks the photo to 256 px and draws it again before it is sent, which also removes hidden data in the file (GPS, phone model).
export const PHOTO_BUCKET = 'staff-photos';
const MAX_PHOTO_BYTES = 400 * 1024;
const LINK_SECONDS = 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

export const isStaffId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

// A real JPEG: starts FF D8 FF, ends FF D9, and the size in pixels (read from the file itself) is between 64 and 1600.
export function checkPhoto(base64: unknown): Buffer {
  const raw = String(base64 ?? '').replace(/^data:image\/jpeg;base64,/, '');
  if (!raw || raw.length > Math.ceil(MAX_PHOTO_BYTES * 1.4)) throw fail(400, 'The photo is too large. Use a photo of at most 400 KB.');
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) throw fail(400, 'That is not a photo.');
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length < 1500 || buffer.length > MAX_PHOTO_BYTES) throw fail(400, 'The photo is too small or too large.');
  if (!(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) || !(buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9)) throw fail(400, 'Only a JPEG photo is accepted.');
  // The size is in the start-of-frame block (SOF0 to SOF3, SOF5 to SOF7, SOF9 to SOF11, SOF13 to SOF15).
  let width = 0, height = 0;
  for (let at = 2; at + 9 < buffer.length;) {
    if (buffer[at] !== 0xff) { at++; continue; }
    const marker = buffer[at + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    const length = buffer.readUInt16BE(at + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) { height = buffer.readUInt16BE(at + 5); width = buffer.readUInt16BE(at + 7); break; }
    at += 2 + length;
  }
  if (width < 64 || height < 64 || width > 1600 || height > 1600) throw fail(400, 'The photo size in pixels is not accepted (64 to 1600).');
  return buffer;
}

async function ensureBucket(db: any) {
  const { error } = await db.storage.createBucket(PHOTO_BUCKET, { public: false, fileSizeLimit: MAX_PHOTO_BYTES, allowedMimeTypes: ['image/jpeg'] });
  if (error && !/already exists|duplicate/i.test(String(error.message || ''))) throw fail(500, 'Photos cannot be saved right now.');
}

// The full picture (at most 1000 px) is kept next to the 256 px one, so HR can move and zoom the photo later without choosing the file again.
// Only HR can ask for a link to it.
export function checkSource(base64: unknown): Buffer | null {
  if (!base64) return null;
  const raw = String(base64).replace(/^data:image\/jpeg;base64,/, '');
  const buffer = checkPhoto(raw);
  return buffer;
}
export async function saveSource(db: any, employeeId: string, buffer: Buffer) {
  if (!isStaffId(employeeId)) throw fail(400, 'Choose a staff member.');
  await db.storage.from(PHOTO_BUCKET).upload(`${employeeId}.src.jpg`, buffer, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' });
}
export async function sourceLink(db: any, employeeId: string): Promise<string> {
  if (!isStaffId(employeeId)) throw fail(400, 'Choose a staff member.');
  const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(`${employeeId}.src.jpg`, 120);
  return data?.signedUrl || '';
}

export async function savePhoto(db: any, employeeId: string, buffer: Buffer) {
  if (!isStaffId(employeeId)) throw fail(400, 'Choose a staff member.');
  let { error } = await db.storage.from(PHOTO_BUCKET).upload(`${employeeId}.jpg`, buffer, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (error && /bucket not found/i.test(String(error.message || ''))) { await ensureBucket(db); ({ error } = await db.storage.from(PHOTO_BUCKET).upload(`${employeeId}.jpg`, buffer, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' })); }
  if (error) throw fail(500, 'Unable to save the photo. Try again.');
}

export async function removePhoto(db: any, employeeId: string) {
  if (!isStaffId(employeeId)) throw fail(400, 'Choose a staff member.');
  await db.storage.from(PHOTO_BUCKET).remove([`${employeeId}.jpg`, `${employeeId}.src.jpg`]);
}

// Links for the people who have a photo; the others are left out. Only ids that look like a staff id are used.
export async function photoLinks(db: any, ids: unknown[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter(isStaffId))].slice(0, 300);
  if (!wanted.length) return {};
  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(wanted.map((id) => `${id}.jpg`), LINK_SECONDS);
  if (error || !Array.isArray(data)) return {};
  const out: Record<string, string> = {};
  for (const row of data) if (row?.signedUrl && !row.error) out[String(row.path).replace(/\.jpg$/, '')] = row.signedUrl;
  return out;
}

// ---- The organisation chart (Charts > See organization chart) ----
// The company chart (Organizational Structure). The page draws the boxes; this only says who sits in each place (by staff code), how many
// Clinic Assistants each clinic has, and a link for each photo.
const CHART_CODES = ['ARA0001', 'ARA0002', 'ARA0004', 'ARA0035', 'ARA0041', 'ARA0044', 'ARASK0001', 'ARASK0002', 'ARASK0036', 'ARASK0054', 'ARASK0058', 'ARASK0060'];
// The words HR changed in the chart (name or job lines), kept in portal_state like the charts cache. Each is a short list of plain text lines.
const TEXT_KEY = 'org_chart_text', TEXT_BRANCH = 'AraOffice Charts Cache';
export async function orgTexts(db: any): Promise<Record<string, string[]>> {
  try {
    const branch = await branchId(db, TEXT_BRANCH, false);
    if (!branch) return {};
    const { data } = await db.from('portal_state').select('payload').eq('branch_id', branch).eq('state_key', TEXT_KEY).maybeSingle();
    return data?.payload?.texts && typeof data.payload.texts === 'object' ? data.payload.texts : {};
  } catch { return {}; }
}
export async function saveOrgText(db: any, userId: string, key: unknown, lines: unknown) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9]{3,12}@\d{1,4}$/.test(key)) throw fail(400, 'Choose a place on the chart.');
  const clean = Array.isArray(lines) ? lines.slice(0, 4).map((line) => String(line ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60)).filter(Boolean) : [];
  const texts = await orgTexts(db);
  if (clean.length) texts[key] = clean; else delete texts[key];
  const branch = await branchId(db, TEXT_BRANCH, true);
  const row: any = { branch_id: branch, state_key: TEXT_KEY, payload: { texts }, updated_at: new Date().toISOString(), updated_by: userId };
  const { data: existing } = await db.from('portal_state').select('state_key').eq('branch_id', branch).eq('state_key', TEXT_KEY).maybeSingle();
  const { error } = existing ? await db.from('portal_state').update(row).eq('branch_id', branch).eq('state_key', TEXT_KEY) : await db.from('portal_state').insert(row);
  if (error) throw fail(500, 'Unable to save the change. Try again.');
}

export async function orgChart(db: any) {
  const { data: people, error } = await db.from('hr_employees').select('id,company,employee_code,designation').in('employee_code', CHART_CODES);
  if (error) throw error;
  const { data: assistants, error: countError } = await db.from('hr_employees').select('company').eq('status', 'Active').ilike('designation', '%CLINIC ASSISTANT%').limit(500);
  if (countError) throw countError;
  const ids: Record<string, string> = Object.fromEntries((people || []).map((p: any) => [p.employee_code, p.id]));
  const count = (company: string) => (assistants || []).filter((row: any) => row.company === company).length;
  return { ids, assistants: { KJ: count('KJ'), SK: count('SK') }, texts: await orgTexts(db), photos: await photoLinks(db, Object.values(ids)) };
}
