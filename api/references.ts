import { branchId, officeAccess } from './_office-db.js';
import { extractText, getDocumentProxy } from 'unpdf';
import { listDriveFiles } from './_panel-drive.js';

// Official memos are shared by every office that shows the Reference Hub, so
// they live in one record instead of inside a single office's workspace state.
const SHARED_BRANCH = 'AraOffice Shared';
const STATE_KEY = 'reference_resources';
const CA_BRANCH = 'AraSpace Clinical Assistants';
const READER_OFFICES = ['ca', 'quality'];
const DRIVE_SYNC_INTERVAL = 10 * 60 * 1000;
// Memo wording for search lives in its own record so normal page loads do not carry it.
const TEXT_KEY = 'reference_text';
const TEXT_BATCH = 8;
const TEXT_MAX = 20000;

type TextPayload = { texts: Record<string, string>; empty: string[]; failed: string[] };

const driveFileId = (resource: { sourceUrl?: string }) => String(resource.sourceUrl || '').match(/\/d\/([\w-]+)\//)?.[1] || '';

// Reads the words out of one shared Drive PDF; scanned pages come back empty.
async function pdfText(fileId: string) {
  const response = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
  if (!response.ok) throw new Error(`Drive returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') throw new Error('not shared as a PDF');
  const { text } = await extractText(await getDocumentProxy(bytes), { mergePages: true });
  return text.replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX);
}


// Accepts either the bare folder ID or a pasted Drive folder link.
function memoFolderId() {
  const value = (process.env.MEMO_DRIVE_FOLDER_ID || '').trim();
  return value.match(/folders\/([\w-]+)/)?.[1] || value.match(/[?&]id=([\w-]+)/)?.[1] || value.split(/[?#/]/)[0];
}

type Resource = { id: string; sourceUrl?: string; [key: string]: unknown };
type Payload = { resources: Resource[]; pendingMemos?: Resource[]; driveSyncedAt?: string };

// Before this record existed, memo edits were saved in the CA workspace.
// Copy them across (read-only) so no earlier edit is lost.
async function legacyResources(db: any) {
  const caBranch = await branchId(db, CA_BRANCH, false);
  if (!caBranch) return null;
  const { data, error } = await db.from('portal_state').select('payload').eq('branch_id', caBranch).eq('state_key', 'ca_workspace').maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.payload?.resources) ? data.payload.resources as Resource[] : null;
}

// New Drive PDFs stay pending until an administrator confirms their metadata.
// This prevents an unreviewed filename or missing date from being published to
// every office immediately.
async function withDriveMemos(payload: Payload, force: boolean) {
  const folderId = memoFolderId();
  if (!folderId) return { payload, added: 0, synced: false };
  const last = Date.parse(payload.driveSyncedAt || '') || 0;
  if (!force && Date.now() - last < DRIVE_SYNC_INTERVAL) return { payload, added: 0, synced: false };
  const known = (fileId: string) => [...payload.resources, ...(payload.pendingMemos || [])].some((item) => item.id === `drive-${fileId}` || String(item.sourceUrl || '').includes(`/d/${fileId}/`));
  const added = (await listDriveFiles(folderId)).filter((file) => !known(file.id)).map((file) => {
    const title = file.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').trim();
    return { id: `drive-${file.id}`, title, summary: '', category: 'Operasi', type: 'Memo', readTime: 5, updatedAt: 'Belum diekstrak', owner: 'AraSihat', status: 'AKTIF', keywords: [title.toLowerCase(), 'memo', 'rujukan'], content: ['Dokumen rasmi ini dipaparkan terus daripada sumber Drive AraSihat.'], sourceUrl: `https://drive.google.com/file/d/${file.id}/preview` };
  });
  return { payload: { ...payload, pendingMemos: [...(payload.pendingMemos || []), ...added], driveSyncedAt: new Date().toISOString() }, added: added.length, synced: true };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, user, profile } = await officeAccess(req, false, READER_OFFICES);
    const sharedBranch = await branchId(db, SHARED_BRANCH, true);
    const { data: existing, error: readError } = await db.from('portal_state').select('payload,updated_at').eq('branch_id', sharedBranch).eq('state_key', STATE_KEY).maybeSingle();
    if (readError) throw readError;
    const save = async (payload: Payload) => {
      const { data, error } = await db.from('portal_state').upsert({ branch_id: sharedBranch, state_key: STATE_KEY, payload, updated_by: user.id }, { onConflict: 'branch_id,state_key' }).select('payload,updated_at').single();
      if (error) throw error;
      return data;
    };

    const loadTexts = async (): Promise<TextPayload> => {
      const { data, error } = await db.from('portal_state').select('payload').eq('branch_id', sharedBranch).eq('state_key', TEXT_KEY).maybeSingle();
      if (error) throw error;
      return { texts: data?.payload?.texts || {}, empty: data?.payload?.empty || [], failed: data?.payload?.failed || [] };
    };

    // Memo wording for Home search; fetched only when someone starts searching.
    if (req.method === 'GET' && req.query.action === 'text') return res.status(200).json({ texts: (await loadTexts()).texts });

    // Reads the next few memos not yet read; the page repeats this until none are left.
    if (req.method === 'POST' && req.query.action === 'extract') {
      if (profile.role !== 'super_admin') return res.status(403).json({ error: 'Only an administrator can read memo text.' });
      const stored = await loadTexts();
      const pending = (existing?.payload?.resources || []).map((item: Resource) => ({ id: item.id, file: driveFileId(item) })).filter((item: { id: string; file: string }) => item.file && !(item.id in stored.texts) && !stored.empty.includes(item.id));
      // Memos that failed before go last, so a few bad files cannot block the rest.
      const fresh = pending.filter((item: { id: string }) => !stored.failed.includes(item.id));
      const todo = [...fresh, ...pending.filter((item: { id: string }) => stored.failed.includes(item.id))];
      const failed: string[] = [];
      await Promise.all(todo.slice(0, TEXT_BATCH).map(async (item: { id: string; file: string }) => {
        try {
          const text = await pdfText(item.file);
          if (text.length > 20) stored.texts[item.id] = text; else stored.empty.push(item.id);
        } catch { failed.push(item.id); }
      }));
      const attempted = todo.slice(0, TEXT_BATCH).map((item: { id: string }) => item.id);
      stored.failed = [...stored.failed.filter((id) => !attempted.includes(id)), ...failed];
      const { error } = await db.from('portal_state').upsert({ branch_id: sharedBranch, state_key: TEXT_KEY, payload: stored, updated_by: user.id }, { onConflict: 'branch_id,state_key' });
      if (error) throw error;
      return res.status(200).json({ remaining: Math.max(0, fresh.length - TEXT_BATCH), read: Object.keys(stored.texts).length, scanned: stored.empty.length, failed: stored.failed.length });
    }

    const forceSync = req.method === 'POST' && req.query.action === 'sync';
    if (req.method === 'GET' || forceSync) {
      if (forceSync && profile.role !== 'super_admin') return res.status(403).json({ error: 'Only an administrator can sync with Drive.' });
      if (forceSync && !memoFolderId()) return res.status(400).json({ error: 'The memo Drive folder has not been set up yet (MEMO_DRIVE_FOLDER_ID).' });
      let current: Payload | null = existing?.payload || null;
      if (!current) {
        const resources = await legacyResources(db);
        if (resources) current = { resources };
      }
      if (!current) return res.status(200).json({ payload: null, updatedAt: null });
      let drive = { added: 0, error: '' };
      try {
        const result = await withDriveMemos(current, forceSync);
        if (result.synced) { current = result.payload; drive.added = result.added; }
      } catch (error: any) {
        // Drive being unavailable must not hide the memos already saved.
        drive.error = error.message || 'Drive sync failed.';
        if (forceSync) return res.status(502).json({ error: `Drive sync failed: ${drive.error} (folder ${memoFolderId()})` });
      }
      if (!existing || current !== existing.payload) {
        const data = await save(current);
        return res.status(200).json({ payload: data.payload, pendingMemos: data.payload.pendingMemos || [], updatedAt: data.updated_at, drive });
      }
      return res.status(200).json({ payload: existing.payload, pendingMemos: existing.payload.pendingMemos || [], updatedAt: existing.updated_at, drive });
    }

    if (!['PATCH', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
    if (profile.role !== 'super_admin') return res.status(403).json({ error: 'Only an administrator can update shared references.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (!Array.isArray(body.payload?.resources)) return res.status(400).json({ error: 'A valid list of references is required.' });
    // Keep memos the editor's page has not loaded yet (e.g. just synced from
    // Drive) instead of dropping them when it saves its own list.
    const submitted: Resource[] = body.payload.resources;
    const ids = new Set(submitted.map((item) => item.id));
    const kept = (existing?.payload?.resources || []).filter((item: Resource) => !ids.has(item.id));
    const pendingMemos = (existing?.payload?.pendingMemos || []).filter((item: Resource) => !ids.has(item.id));
    const data = await save({ resources: [...kept, ...submitted], pendingMemos, driveSyncedAt: existing?.payload?.driveSyncedAt });
    return res.status(200).json({ payload: data.payload, pendingMemos: data.payload.pendingMemos || [], updatedAt: data.updated_at });
  } catch (error: any) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to load shared references.' });
  }
}
