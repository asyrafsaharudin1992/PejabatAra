import { randomUUID } from 'node:crypto';

// Leave attachments (a medical certificate and the like): checking, storing in the private Storage bucket, attaching to a leave
// request, and making a link that expires after a minute. Used by the staff API and the HR API.
export const LEAVE_BUCKET = 'leave-attachments';
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILES = 3;
export const ATTACHMENT_REQUIRED_FOR = new Set(['ML']);   // only medical leave must have a file attached
const KINDS: { ext: string[]; type: string; magic: number[] }[] = [
  { ext: ['pdf'], type: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  { ext: ['png'], type: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: ['jpg', 'jpeg'], type: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
];
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

export type AttachmentRow = { id: string; employee_id: string | null; request_id: string | null; file_name: string; content_type: string; size_bytes: number; storage_path: string; uploaded_by: string };

// The file must really be a PDF, PNG or JPEG (not just named like one) and at most 2 MB.
export function checkLeaveFile(fileName: unknown, base64: unknown) {
  const name = String(fileName ?? '').replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 100);
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const kind = KINDS.find((item) => item.ext.includes(ext));
  if (!name || !kind) throw fail(400, 'Attach a PDF, PNG or JPG file.');
  const data = String(base64 ?? '').replace(/^data:[^,]*,/, '');
  if (!data || data.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8) throw fail(400, 'The file must be smaller than 2 MB.');
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw fail(400, 'The file must be smaller than 2 MB.');
  if (!kind.magic.every((byte, index) => buffer[index] === byte)) throw fail(400, 'That file is not a real PDF, PNG or JPG.');
  return { name, buffer, contentType: kind.type, ext: kind.ext[0] };
}

// Stores one file. `employeeId` is the staff member who uploaded it, or null when HR did.
export async function storeLeaveFile(db: any, input: { employeeId: string | null; fileName: unknown; base64: unknown; uploadedBy: 'staff' | 'hr' }) {
  const file = checkLeaveFile(input.fileName, input.base64);
  // Tidy up uploads that were never attached to a request (more than a day old).
  const stale = new Date(Date.now() - 86400000).toISOString();
  const { data: old } = await db.from('hr_leave_attachments').select('id,storage_path').is('request_id', null).lt('created_at', stale).limit(50);
  if (old?.length) { await db.storage.from(LEAVE_BUCKET).remove(old.map((row: any) => row.storage_path)); await db.from('hr_leave_attachments').delete().in('id', old.map((row: any) => row.id)); }
  const path = `${input.employeeId || 'hr'}/${randomUUID()}.${file.ext}`;
  const { error: uploadError } = await db.storage.from(LEAVE_BUCKET).upload(path, file.buffer, { contentType: file.contentType, upsert: false });
  if (uploadError) throw fail(500, 'Unable to save the file. Try again.');
  const { data, error } = await db.from('hr_leave_attachments').insert({ employee_id: input.employeeId, file_name: file.name, content_type: file.contentType, size_bytes: file.buffer.length, storage_path: path, uploaded_by: input.uploadedBy }).select('id,file_name,size_bytes').single();
  if (error) { await db.storage.from(LEAVE_BUCKET).remove([path]); throw error; }
  return { id: data.id as string, name: data.file_name as string, size: Number(data.size_bytes) };
}

// Ties uploaded files to a new leave request. Staff may attach only their own unattached uploads; HR's uploads (employee_id null) can go to
// several requests at once (a batch), in which case each request gets its own row pointing at the same stored file.
export async function attachLeaveFiles(db: any, requestId: string, employeeId: string, ids: string[], first: boolean, uploadedBy: 'staff' | 'hr') {
  if (!ids.length) return 0;
  const { data: rows, error } = await db.from('hr_leave_attachments').select('*').in('id', ids);
  if (error) throw error;
  const usable: AttachmentRow[] = (rows || []).filter((row: AttachmentRow) => uploadedBy === 'staff' ? row.employee_id === employeeId && !row.request_id : row.uploaded_by === 'hr');
  if (usable.length !== ids.length) throw fail(400, 'One of the attached files is no longer available. Attach it again.');
  if (first) {
    const { error: updateError } = await db.from('hr_leave_attachments').update({ request_id: requestId, employee_id: employeeId }).in('id', ids).is('request_id', null);
    if (updateError) throw updateError;
  } else {
    const { error: copyError } = await db.from('hr_leave_attachments').insert(usable.map((row) => ({ employee_id: employeeId, request_id: requestId, file_name: row.file_name, content_type: row.content_type, size_bytes: row.size_bytes, storage_path: row.storage_path, uploaded_by: row.uploaded_by })));
    if (copyError) throw copyError;
  }
  return usable.length;
}

// Files of many leave requests at once: request id -> [{ id, name, size }].
export async function attachmentsFor(db: any, requestIds: string[]) {
  const map = new Map<string, { id: string; name: string; size: number }[]>();
  if (!requestIds.length) return map;
  // In small groups: hundreds of ids in one query make the request address too long.
  for (let i = 0; i < requestIds.length; i += 80) {
    const { data, error } = await db.from('hr_leave_attachments').select('id,request_id,file_name,size_bytes').in('request_id', requestIds.slice(i, i + 80)).order('created_at');
    if (error) throw error;
    for (const row of data || []) { if (!map.has(row.request_id)) map.set(row.request_id, []); map.get(row.request_id)!.push({ id: row.id, name: row.file_name, size: Number(row.size_bytes) }); }
  }
  return map;
}

// A link that works for one minute. `download` makes the browser save the file instead of showing it.
export async function leaveFileLink(db: any, row: AttachmentRow, download: boolean) {
  const { data, error } = await db.storage.from(LEAVE_BUCKET).createSignedUrl(row.storage_path, 60, download ? { download: row.file_name } : undefined);
  if (error || !data?.signedUrl) throw fail(500, 'Unable to open the file. Try again.');
  return data.signedUrl as string;
}

// Removes the stored files of leave requests that are being deleted (a file shared with another request stays).
export async function removeLeaveFiles(db: any, requestId: string) {
  const { data: rows } = await db.from('hr_leave_attachments').select('id,storage_path').eq('request_id', requestId);
  for (const row of rows || []) {
    const { count } = await db.from('hr_leave_attachments').select('id', { count: 'exact', head: true }).eq('storage_path', row.storage_path).neq('id', row.id);
    if (!count) await db.storage.from(LEAVE_BUCKET).remove([row.storage_path]);
  }
}
