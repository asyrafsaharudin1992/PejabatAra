import type { Request, Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { database, driveRequest, hash, matches, required, syncPanelFiles } from './_panel-drive';

// Call once at deployment, then daily from a secure scheduler to renew the
// expiring Google notification subscription. This does not poll Drive files.
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();
  try {
    if (!matches(String(req.headers['authorization'] || '') || '', hash(`Bearer ${required(req.method === 'GET' ? 'CRON_SECRET' : 'PANEL_WATCH_SECRET')}`))) return res.status(403).end();
    const db = database();
    const { data, error } = await db.from('panel_drive_channels').select('id').not('resource_id', 'is', null).gt('expires_at', new Date(Date.now() + 2 * 86400_000).toISOString()).limit(1);
    if (error) throw error;
    if (data?.length) return res.json({ renewed: false });
    const address = required('PANEL_WEBHOOK_URL');
    const parsed = new URL(address);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Public HTTPS callback required');
    const { startPageToken } = await driveRequest('changes/startPageToken');
    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    const expiration = Date.now() + 6 * 86400_000;
    const { error: insertError } = await db.from('panel_drive_channels').insert({ id, token_hash: hash(token), expires_at: new Date(expiration).toISOString() });
    if (insertError) throw insertError;
    const channel = await driveRequest(`changes/watch?pageToken=${encodeURIComponent(startPageToken)}`, { id, type: 'web_hook', address, token, expiration: String(expiration) });
    // Catch up before declaring the subscription healthy. A failed catch-up
    // leaves it pending so the next scheduler run retries registration.
    const count = await syncPanelFiles();
    const { error: updateError } = await db.from('panel_drive_channels').update({ resource_id: channel.resourceId, expires_at: new Date(Number(channel.expiration)).toISOString() }).eq('id', id);
    if (updateError) throw updateError;
    // Cover changes arriving while the channel record was still pending.
    await syncPanelFiles();
    return res.json({ renewed: true, guides: count, expiresAt: new Date(Number(channel.expiration)).toISOString() });
  } catch {
    return res.status(503).json({ error: 'Watch registration failed. Check server configuration and Drive access.' });
  }
}
