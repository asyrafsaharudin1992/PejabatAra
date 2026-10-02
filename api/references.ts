import { branchId, officeAccess } from './_office-db.js';
import { listDriveFiles } from './_panel-drive';

// Official memos are shared by every office that shows the Reference Hub, so
// they live in one record instead of inside a single office's workspace state.
const SHARED_BRANCH = 'AraOffice Shared';
const STATE_KEY = 'reference_resources';
const CA_BRANCH = 'AraSpace Clinical Assistants';
const READER_OFFICES = ['ca', 'quality'];
const DRIVE_SYNC_INTERVAL = 10 * 60 * 1000;

type Resource = { id: string; sourceUrl?: string; [key: string]: unknown };
type Payload = { resources: Resource[]; driveSyncedAt?: string };

// Before this record existed, memo edits were saved in the CA workspace.
// Copy them across (read-only) so no earlier edit is lost.
async function legacyResources(db: any) {
  const caBranch = await branchId(db, CA_BRANCH, false);
  if (!caBranch) return null;
  const { data, error } = await db.from('portal_state').select('payload').eq('branch_id', caBranch).eq('state_key', 'ca_workspace').maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.payload?.resources) ? data.payload.resources as Resource[] : null;
}

// Adds memos that are new in the Drive folder. Existing entries, including any
// metadata an admin has edited, are never changed or removed.
async function withDriveMemos(payload: Payload, force: boolean) {
  const folderId = process.env.MEMO_DRIVE_FOLDER_ID;
  if (!folderId) return { payload, added: 0, synced: false };
  const last = Date.parse(payload.driveSyncedAt || '') || 0;
  if (!force && Date.now() - last < DRIVE_SYNC_INTERVAL) return { payload, added: 0, synced: false };
  const known = (fileId: string) => payload.resources.some((item) => item.id === `drive-${fileId}` || String(item.sourceUrl || '').includes(`/d/${fileId}/`));
  const added = (await listDriveFiles(folderId)).filter((file) => !known(file.id)).map((file) => {
    const title = file.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').trim();
    return { id: `drive-${file.id}`, title, summary: '', category: 'Operasi', type: 'Memo', readTime: 5, updatedAt: 'Belum diekstrak', owner: 'AraSihat', status: 'AKTIF', keywords: [title.toLowerCase(), 'memo', 'rujukan'], content: ['Dokumen rasmi ini dipaparkan terus daripada sumber Drive AraSihat.'], sourceUrl: `https://drive.google.com/file/d/${file.id}/preview` };
  });
  return { payload: { resources: [...added, ...payload.resources], driveSyncedAt: new Date().toISOString() }, added: added.length, synced: true };
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

    const forceSync = req.method === 'POST' && req.query.action === 'sync';
    if (req.method === 'GET' || forceSync) {
      if (forceSync && profile.role !== 'super_admin') return res.status(403).json({ error: 'Only an administrator can sync with Drive.' });
      if (forceSync && !process.env.MEMO_DRIVE_FOLDER_ID) return res.status(400).json({ error: 'The memo Drive folder has not been set up yet (MEMO_DRIVE_FOLDER_ID).' });
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
        if (forceSync) return res.status(502).json({ error: `Drive sync failed: ${drive.error}` });
      }
      if (!existing || current !== existing.payload) {
        const data = await save(current);
        return res.status(200).json({ payload: data.payload, updatedAt: data.updated_at, drive });
      }
      return res.status(200).json({ payload: existing.payload, updatedAt: existing.updated_at, drive });
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
    const data = await save({ resources: [...kept, ...submitted], driveSyncedAt: existing?.payload?.driveSyncedAt });
    return res.status(200).json({ payload: data.payload, updatedAt: data.updated_at });
  } catch (error: any) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to load shared references.' });
  }
}
