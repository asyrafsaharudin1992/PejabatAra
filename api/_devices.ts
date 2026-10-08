import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { activeAccount, currentDevice, deviceLockEnabled, hashSecret } from './_office-db.js';

// Plato-style device registration. Served from /api/status?resource=devices
// because the Vercel Hobby plan allows only 12 functions.
const REGISTRATION_DAYS = 30;
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I lookalikes

// Staff may type the key with spaces, dashes or lower case.
const normaliseKey = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function newSecurityKey() {
  const chars = Array.from({ length: 16 }, () => KEY_ALPHABET[randomInt(KEY_ALPHABET.length)]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

function sameHash(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function devicesHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, user, profile } = await activeAccount(req);
    const isAdmin = profile.role === 'super_admin';
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    if (req.method === 'GET' && req.query.view !== 'admin') {
      const lockEnabled = await deviceLockEnabled(db);
      const device = await currentDevice(db, req);
      return res.status(200).json({ lockEnabled, exempt: isAdmin, device: device ? { name: device.name, expiresAt: device.expires_at } : null });
    }

    if (req.method === 'POST' && body.action === 'register') {
      const name = String(body.name || '').trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: 'Give this device a name, for example "Kajang Front Desk".' });
      const { data: settings, error: settingsError } = await db.from('device_settings').select('key_hash').eq('id', true).maybeSingle();
      if (settingsError) throw settingsError;
      if (!settings?.key_hash) return res.status(400).json({ error: 'Device registration is not switched on yet.' });
      if (!sameHash(hashSecret(normaliseKey(body.key)), settings.key_hash)) {
        // Slow down guessing; the key itself has about 80 bits of randomness.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return res.status(400).json({ error: 'That security key is not correct.' });
      }
      // Re-registering replaces this browser's previous registration.
      const previous = String(req.headers['x-device-token'] || '');
      if (previous) await db.from('registered_devices').update({ revoked_at: new Date().toISOString() }).eq('token_hash', hashSecret(previous)).is('revoked_at', null);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + REGISTRATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await db.from('registered_devices').insert({ name, token_hash: hashSecret(token), registered_by: user.id, expires_at: expiresAt, last_seen_at: new Date().toISOString() });
      if (error) throw error;
      return res.status(200).json({ token, name, expiresAt });
    }

    if (!isAdmin) return res.status(403).json({ error: 'Only System Admin can manage devices.' });

    if (req.method === 'POST' && body.action === 'generate_key') {
      const key = newSecurityKey();
      const { error } = await db.from('device_settings').upsert({ id: true, key_hash: hashSecret(normaliseKey(key)), updated_at: new Date().toISOString(), updated_by: user.id });
      if (error) throw error;
      // The key is only ever shown here; the database keeps its hash.
      return res.status(200).json({ key });
    }
    if (req.method === 'POST' && body.action === 'disable_lock') {
      const { error } = await db.from('device_settings').upsert({ id: true, key_hash: null, updated_at: new Date().toISOString(), updated_by: user.id });
      if (error) throw error;
      return res.status(200).json({ success: true });
    }
    if (req.method === 'POST' && body.action === 'revoke') {
      if (!body.id) return res.status(400).json({ error: 'Choose a device.' });
      const { error } = await db.from('registered_devices').update({ revoked_at: new Date().toISOString() }).eq('id', body.id).is('revoked_at', null);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }
    if (req.method === 'GET') {
      const [{ data: settings, error: settingsError }, { data: devices, error: devicesError }, { data: profiles, error: profilesError }] = await Promise.all([
        db.from('device_settings').select('key_hash,updated_at').eq('id', true).maybeSingle(),
        db.from('registered_devices').select('id,name,registered_by,registered_at,expires_at,last_seen_at,revoked_at').is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('registered_at', { ascending: false }),
        db.from('profiles').select('id,full_name'),
      ]);
      if (settingsError || devicesError || profilesError) throw settingsError || devicesError || profilesError;
      const names = new Map((profiles || []).map((row: any) => [row.id, row.full_name]));
      return res.status(200).json({
        lockEnabled: Boolean(settings?.key_hash),
        keyUpdatedAt: settings?.key_hash ? settings.updated_at : null,
        devices: (devices || []).map((row: any) => ({ id: row.id, name: row.name, registeredBy: names.get(row.registered_by) || 'Unknown', registeredAt: row.registered_at, expiresAt: row.expires_at, lastSeenAt: row.last_seen_at })),
      });
    }
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error: any) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to manage devices.' });
  }
}
