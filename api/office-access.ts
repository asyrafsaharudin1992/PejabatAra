import type { Request, Response } from 'express';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const offices = ['ceo', 'coo', 'procurement', 'finance', 'hr', 'quality', 'clinical', 'ca'];
const configPath = path.join(process.cwd(), '.araoffice-access.json');
type Config = { secret: string; master: string; offices: Record<string, string> };
const failures = new Map<string, { count: number; until: number }>();
function digest(code: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(code, salt, 32).toString('hex')}`; }
function verify(code: string, encoded: string) {
  const [salt, value] = encoded.split(':');
  if (!salt || !value) return false;
  const actual = scryptSync(code, salt, 32); const expected = Buffer.from(value, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function configuration(): Promise<Config | null> {
  if (process.env.OFFICE_ACCESS_CONFIG) return JSON.parse(process.env.OFFICE_ACCESS_CONFIG);
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') return null;
  try { return JSON.parse(await readFile(configPath, 'utf8')); } catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
}
function localSetup(req: Request) {
  return !process.env.VERCEL && process.env.NODE_ENV !== 'production' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '') && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '');
}
function session(req: Request, config: Config) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('ara_office_access='))?.slice('ara_office_access='.length);
  if (!cookie) return null;
  const [payload, signature] = cookie.split('.');
  const expected = createHmac('sha256', config.secret).update(payload).digest('hex');
  if (signature?.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { const value = JSON.parse(Buffer.from(payload, 'base64url').toString()); return value.expires > Date.now() && (value.scope === 'master' || offices.includes(value.scope)) ? value : null; } catch { return null; }
}
function issue(res: Response, config: Config, scope: string) {
  const payload = Buffer.from(JSON.stringify({ scope, expires: Date.now() + 8 * 3600_000 })).toString('base64url');
  const signature = createHmac('sha256', config.secret).update(payload).digest('hex');
  res.setHeader('Set-Cookie', `ara_office_access=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.VERCEL ? '; Secure' : ''}`);
  return { scope, offices: scope === 'master' ? offices : [scope] };
}
export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const config = await configuration();
    if (req.method === 'GET') {
      const current = config ? session(req, config) : null;
      return res.json({ configured: !!config, setupRequired: !config && localSetup(req), scope: current?.scope || null, offices: current ? current.scope === 'master' ? offices : [current.scope] : [] });
    }
    if (req.method !== 'POST') return res.status(405).end();
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Request origin not allowed.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (body.action === 'logout') {
      res.setHeader('Set-Cookie', 'ara_office_access=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return res.json({ scope: null, offices: [] });
    }
    if (typeof body.code !== 'string' || body.code.length < 8 || body.code.length > 128) return res.status(400).json({ error: 'Use a code of 8–128 characters.' });
    if (body.action === 'setup') {
      if (config || !localSetup(req)) return res.status(403).json({ error: 'Setup is unavailable.' });
      const created: Config = { secret: randomBytes(48).toString('hex'), master: digest(body.code), offices: {} };
      await writeFile(configPath, JSON.stringify(created), { flag: 'wx', mode: 0o600 });
      return res.json(issue(res, created, 'master'));
    }
    if (!config) return res.status(503).json({ error: 'Office codes have not been configured.' });
    if (body.action === 'set-code') {
      if (session(req, config)?.scope !== 'master' || !offices.includes(body.office)) return res.status(403).json({ error: 'Master Admin access required.' });
      if (!localSetup(req) || process.env.OFFICE_ACCESS_CONFIG) return res.status(409).json({ error: 'Manage deployed office codes through the server configuration.' });
      config.offices[body.office] = digest(body.code);
      await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
      return res.json({ saved: true });
    }
    if (!offices.includes(body.office) && body.office !== 'master') return res.status(400).json({ error: 'Select an office.' });
    const ip = req.socket.remoteAddress || 'unknown';
    for (const [key, value] of failures) if (value.until < Date.now()) failures.delete(key);
    const attempts = failures.get(ip) || { count: 0, until: Date.now() + 10 * 60_000 };
    if (attempts.count >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in 10 minutes.' });
    const scope = verify(body.code, config.master) ? 'master' : config.offices[body.office] && verify(body.code, config.offices[body.office]) ? body.office : null;
    if (!scope) { attempts.count++; failures.set(ip, attempts); return res.status(401).json({ error: 'Incorrect access code.' }); }
    failures.delete(ip);
    return res.json(issue(res, config, scope));
  } catch { return res.status(500).json({ error: 'Unable to verify office access. Please try again.' }); }
}
