import { createClient } from '@supabase/supabase-js';
import { GoogleAuth } from 'google-auth-library';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export const folderId = '1nvJW1koDXL0dqfeCkKy1K-K0BFmEaVhr';
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
export function database() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function matches(value: string, digest: string) {
  const actual = Buffer.from(hash(value));
  const expected = Buffer.from(digest);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function googleCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (email && privateKey) return { client_email: email, private_key: privateKey.replace(/\\n/g, '\n') };
  const source = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!source) throw new Error('Missing server configuration: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY');
  const raw = existsSync(source) ? readFileSync(source, 'utf8') : source;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') throw new Error('invalid key fields');
    return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, '\n') };
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be a valid service-account JSON value or file path.');
  }
}
export async function driveRequest(path: string, body?: unknown) {
  const auth = new GoogleAuth({
    credentials: googleCredentials(),
    scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
  });
  const token = await auth.getAccessToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Drive API returned ${response.status}`);
  return response.status === 204 ? {} : response.json();
}

export async function syncPanelFiles() {
  const files: { id: string; name: string; url: string }[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ q: `'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`, fields: 'nextPageToken,incompleteSearch,files(id,name)', pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await driveRequest(`files?${params}`);
    if (result.incompleteSearch) throw new Error('Incomplete Drive listing');
    for (const file of result.files || []) files.push({ id: file.id, name: file.name, url: `https://drive.google.com/file/d/${file.id}/preview` });
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  // Database PK makes duplicate deliveries and overlapping channels idempotent.
  // Existing files and admin metadata are never deleted by a sync.
  if (files.length) {
    const { error } = await database().from('panel_drive_files').upsert(files, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
  }
  return files.length;
}
