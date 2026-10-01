import { randomUUID } from 'node:crypto';
import { database, driveRequest, hash, required, syncPanelFiles } from './_panel-drive';

function authorised(req: any) {
  const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const expected = process.env.CRON_SECRET || process.env.PANEL_WATCH_SECRET;
  return Boolean(expected && supplied && supplied === expected);
}

export default async function handler(req: any, res: any) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised.' });
  try {
    const db = database();
    const now = Date.now();
    const { data: current, error: currentError } = await db.from('panel_drive_channels').select('*').order('expires_at', { ascending: false }).limit(1).maybeSingle();
    if (currentError) throw currentError;
    if (current && Date.parse(current.expires_at) - now > 48 * 60 * 60 * 1000) {
      return res.status(200).json({ active: true, expiresAt: current.expires_at, renewed: false });
    }

    const channelId = randomUUID();
    const token = randomUUID();
    const callback = required('PANEL_WEBHOOK_URL');
    const page = await driveRequest('changes/startPageToken?supportsAllDrives=true');
    const watch = await driveRequest('changes/watch?supportsAllDrives=true&includeItemsFromAllDrives=true', {
      id: channelId,
      type: 'web_hook',
      address: callback,
      token,
      pageToken: page.startPageToken,
    });
    const expiresAt = new Date(Number(watch.expiration || now + 6 * 24 * 60 * 60 * 1000)).toISOString();
    await syncPanelFiles();
    const { error: saveError } = await db.from('panel_drive_channels').upsert({
      id: channelId,
      token_hash: hash(token),
      resource_id: watch.resourceId,
      expires_at: expiresAt,
    });
    if (saveError) throw saveError;
    return res.status(200).json({ active: true, expiresAt, renewed: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Unable to register Drive watch.' });
  }
}
