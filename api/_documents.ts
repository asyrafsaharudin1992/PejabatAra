import { randomUUID } from 'node:crypto';
import { checkLeaveFile } from './_leave-files.js';

// Documents on a staff profile. Same checks as leave attachments: a real PDF, PNG or JPEG, at most 2 MB, kept in a private bucket and
// opened only through a link that works for a minute.
export const DOCUMENT_BUCKET = 'staff-documents';
export const DOCUMENT_KINDS = ['IC copy', 'Passport', 'Certificate', 'Driving licence', 'Other'];
export const MAX_DOCUMENTS = 12;
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const missingTable = (error: any) => error?.code === '42P01' ? fail(503, 'Documents are not set up yet. Ask HR.') : error;

export const documentRow = (row: any) => ({ id: row.id, kind: row.kind, name: row.file_name, size: Number(row.size_bytes), by: row.uploaded_by, at: row.created_at });

export async function listDocuments(db: any, employeeId: string) {
  const { data, error } = await db.from('hr_documents').select('id,kind,file_name,size_bytes,uploaded_by,created_at').eq('employee_id', employeeId).order('created_at', { ascending: false }).limit(60);
  if (error) throw missingTable(error);
  return (data || []).map(documentRow);
}

export async function addDocument(db: any, input: { employeeId: string; kind: unknown; fileName: unknown; base64: unknown; uploadedBy: 'staff' | 'hr' }) {
  const kind = DOCUMENT_KINDS.includes(String(input.kind)) ? String(input.kind) : 'Other';
  const { count, error: countError } = await db.from('hr_documents').select('id', { count: 'exact', head: true }).eq('employee_id', input.employeeId);
  if (countError) throw missingTable(countError);
  if ((count || 0) >= MAX_DOCUMENTS) throw fail(400, `Up to ${MAX_DOCUMENTS} documents. Remove one first.`);
  const file = checkLeaveFile(input.fileName, input.base64);
  const path = `${input.employeeId}/${randomUUID()}.${file.ext}`;
  const { error: uploadError } = await db.storage.from(DOCUMENT_BUCKET).upload(path, file.buffer, { contentType: file.contentType, upsert: false });
  if (uploadError) throw fail(500, 'Unable to save the file. Try again.');
  const { data, error } = await db.from('hr_documents').insert({ employee_id: input.employeeId, kind, file_name: file.name, content_type: file.contentType, size_bytes: file.buffer.length, storage_path: path, uploaded_by: input.uploadedBy }).select('id,kind,file_name,size_bytes,uploaded_by,created_at').single();
  if (error) { await db.storage.from(DOCUMENT_BUCKET).remove([path]); throw missingTable(error); }
  return documentRow(data);
}

// A document of this person, or an error. Staff can only reach their own.
export async function ownedDocument(db: any, employeeId: string, id: unknown) {
  const { data, error } = await db.from('hr_documents').select('*').eq('id', String(id || '')).eq('employee_id', employeeId).maybeSingle();
  if (error) throw missingTable(error);
  if (!data) throw fail(404, 'That document is no longer there.');
  return data;
}

export async function documentLink(db: any, row: any, download: boolean) {
  const { data, error } = await db.storage.from(DOCUMENT_BUCKET).createSignedUrl(row.storage_path, 60, download ? { download: row.file_name } : undefined);
  if (error || !data?.signedUrl) throw fail(500, 'Unable to open the file. Try again.');
  return data.signedUrl as string;
}

export async function removeDocument(db: any, row: any) {
  await db.storage.from(DOCUMENT_BUCKET).remove([row.storage_path]);
  const { error } = await db.from('hr_documents').delete().eq('id', row.id);
  if (error) throw missingTable(error);
}
