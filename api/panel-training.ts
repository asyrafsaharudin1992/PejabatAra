import { officeAccess } from './_office-db.js';
import { folderId, listDriveFiles } from './_panel-drive.js';

type Panel = { id: string; name: string; availability: string[]; portal_url: string; active?: boolean };
type Guide = { id: string; drive_file_id: string; file_name: string; drive_url: string; panel_id: string | null; status: 'pending' | 'linked' | 'archived' };

async function payload(db: any, includePending: boolean) {
  const { data: panels, error: panelsError } = await db.from('panels').select('id,name,availability,portal_url,active').eq('active', true).order('name');
  if (panelsError) throw panelsError;
  let guideQuery = db.from('panel_guides').select('id,drive_file_id,file_name,drive_url,panel_id,status').order('detected_at');
  if (!includePending) guideQuery = guideQuery.eq('status', 'linked');
  const { data: guides, error: guidesError } = await guideQuery;
  if (guidesError) throw guidesError;
  return { panels: (panels || []) as Panel[], guides: (guides || []) as Guide[] };
}

async function syncGuides(db: any) {
  const files = await listDriveFiles(folderId, 'application/pdf');
  if (!files.length) return 0;
  const { data: known, error: knownError } = await db.from('panel_guides').select('drive_file_id');
  if (knownError) throw knownError;
  const ids = new Set((known || []).map((guide: { drive_file_id: string }) => guide.drive_file_id));
  const added = files.filter((file) => !ids.has(file.id)).map((file) => ({ drive_file_id: file.id, file_name: file.name, drive_url: `https://drive.google.com/file/d/${file.id}/preview`, status: 'pending' }));
  if (!added.length) return 0;
  const { error } = await db.from('panel_guides').insert(added);
  if (error) throw error;
  return added.length;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, user, profile } = await officeAccess(req, false, 'ca');
    const isAdmin = profile.role === 'super_admin';
    if (req.method === 'GET') {
      // An admin opening the page also checks Drive, so a new PDF becomes a
      // durable pending record without relying on browser-local state.
      if (isAdmin) await syncGuides(db);
      return res.status(200).json(await payload(db, isAdmin));
    }
    if (!['POST', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
    if (!isAdmin) return res.status(403).json({ error: 'Only System Admin can manage Panel Training.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (req.method === 'POST') {
      const added = await syncGuides(db);
      return res.status(200).json({ ...(await payload(db, true)), added });
    }

    if (body.action === 'link_guide') {
      const { error } = await db.from('panel_guides').update({ panel_id: body.panelId, status: 'linked', decided_at: new Date().toISOString(), decided_by: user.id, updated_at: new Date().toISOString() }).eq('id', body.guideId);
      if (error) throw error;
    } else if (body.action === 'create_panel') {
      const panel: Panel = body.panel;
      if (!panel?.id || !panel?.name || !body.guideId) return res.status(400).json({ error: 'Panel details and guide are required.' });
      const { error: panelError } = await db.from('panels').insert({ id: panel.id, name: panel.name, availability: panel.availability || [], portal_url: panel.portal_url || '' });
      if (panelError) throw panelError;
      const { error: guideError } = await db.from('panel_guides').update({ panel_id: panel.id, status: 'linked', decided_at: new Date().toISOString(), decided_by: user.id, updated_at: new Date().toISOString() }).eq('id', body.guideId);
      if (guideError) throw guideError;
    } else if (body.action === 'update_panel') {
      const panel: Panel = body.panel;
      const { error } = await db.from('panels').update({ name: panel.name, availability: panel.availability || [], portal_url: panel.portal_url || '', updated_at: new Date().toISOString() }).eq('id', panel.id);
      if (error) throw error;
    } else return res.status(400).json({ error: 'Unknown panel action.' });

    return res.status(200).json(await payload(db, true));
  } catch (error: any) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to manage Panel Training.' });
  }
}
