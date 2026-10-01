import type { Request, Response } from 'express';
import { database, matches, syncPanelFiles } from './_panel-drive';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).end();
  const id = String(req.headers['x-goog-channel-id'] || '') || '';
  const token = String(req.headers['x-goog-channel-token'] || '') || '';
  const resource = String(req.headers['x-goog-resource-id'] || '') || '';
  const state = String(req.headers['x-goog-resource-state'] || '');
  if (!/^[a-f0-9-]{36}$/i.test(id) || !token || !resource) return res.status(403).end();
  try {
    const { data: channel, error } = await database().from('panel_drive_channels').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!channel || Date.parse(channel.expires_at) <= Date.now() || !matches(token, channel.token_hash)) return res.status(403).end();
    if (channel.resource_id && channel.resource_id !== resource) return res.status(403).end();
    // The initial sync callback can arrive before watch registration completes.
    if (state === 'sync') return res.status(204).end();
    if (!channel.resource_id) return res.status(503).end();
    if (state !== 'change') return res.status(204).end();
    await syncPanelFiles();
    return res.status(204).end();
  } catch {
    // Never acknowledge a failed write; Google may retry transient failures.
    return res.status(503).json({ error: 'Panel sync temporarily unavailable' });
  }
}
