import { branchId, officeAccess } from './_office-db.js';
import { folderId, listDriveFiles } from './_panel-drive.js';

// Panel guide PDFs from the Panel Training Drive folder. The list is cached in
// portal_state and refreshed from Drive at most every few minutes, so staff
// opening the page do not each call Drive. Admins can force a refresh.
const SHARED_BRANCH = 'AraOffice Shared';
const STATE_KEY = 'panel_drive_files';
const SYNC_INTERVAL = 10 * 60 * 1000;

type Cached = { files: { id: string; name: string; url: string }[]; syncedAt: string };

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const { db, user, profile } = await officeAccess(req, false, 'ca');
    const force = req.method === 'POST' && req.query.action === 'sync';
    if (force && profile.role !== 'super_admin') return res.status(403).json({ error: 'Only an administrator can sync with Drive.' });
    const sharedBranch = await branchId(db, SHARED_BRANCH, true);
    const { data: existing, error: readError } = await db.from('portal_state').select('payload').eq('branch_id', sharedBranch).eq('state_key', STATE_KEY).maybeSingle();
    if (readError) throw readError;
    const cached: Cached | null = existing?.payload || null;

    if (!force && cached && Date.now() - (Date.parse(cached.syncedAt) || 0) < SYNC_INTERVAL) {
      return res.status(200).json(cached);
    }
    try {
      const files = (await listDriveFiles(folderId, 'application/pdf')).map((file) => ({ id: file.id, name: file.name, url: `https://drive.google.com/file/d/${file.id}/preview` }));
      const payload: Cached = { files, syncedAt: new Date().toISOString() };
      const { error } = await db.from('portal_state').upsert({ branch_id: sharedBranch, state_key: STATE_KEY, payload, updated_by: user.id }, { onConflict: 'branch_id,state_key' });
      if (error) throw error;
      return res.status(200).json(payload);
    } catch (error: any) {
      // Fall back to the last good list so a Drive outage does not hide guides.
      if (cached && !force) return res.status(200).json({ ...cached, error: 'Drive is unavailable; showing the last synced list.' });
      return res.status(502).json({ error: `Drive sync failed: ${error.message || 'unknown error'}` });
    }
  } catch (error: any) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to load panel guides.' });
  }
}
