import { officeAccess } from './_office-db.js';

const BRANCH_NAME = 'AraSpace Clinical Assistants';
const WORKSPACE_KEY = 'ca_workspace';
const READS_KEY = 'ca_announcement_reads';

async function stateBranch(db: any) {
  const { data: existing, error: lookupError } = await db.from('branches').select('id').eq('name', BRANCH_NAME).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id;
  const { data, error } = await db.from('branches').insert({ name: BRANCH_NAME, active: true }).select('id').single();
  if (error) throw error;
  return data.id;
}

// Staff who must read announcements: the active Assessment Room staff list, minus preview and test accounts.
async function announcementStaff(db: any) {
  const { data, error } = await db.from('assessment_staff').select('id,name,branch').eq('active', true).eq('can_preview', false).neq('branch', 'Test').order('branch').order('name');
  if (error) throw error;
  return (data || []).map((item: any) => ({ id: item.id, name: item.name, branch: item.branch }));
}

// Any CA account may mark a staff member as having read an announcement; reads live beside the workspace.
async function announcementReads(req: any, res: any, db: any, branchId: string, userId: string, isAdmin: boolean) {
  const load = async (key: string) => { const { data, error } = await db.from('portal_state').select('payload').eq('branch_id', branchId).eq('state_key', key).maybeSingle(); if (error) throw error; return data?.payload || null; };
  const [staff, stored] = await Promise.all([announcementStaff(db), load(READS_KEY)]);
  const reads: Record<string, Record<string, string>> = stored?.reads || {};
  if (req.method === 'GET') return res.status(200).json({ staff, reads });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const announcements: any[] = (await load(WORKSPACE_KEY))?.announcements || [];
  if (!announcements.some((item) => item.id === body.announcementId)) return res.status(404).json({ error: 'That announcement no longer exists.' });
  if (!staff.some((item: any) => item.id === body.staffId)) return res.status(400).json({ error: 'Please choose a staff name.' });
  if (body.unread && !isAdmin) return res.status(403).json({ error: 'Only System Admin can untick a name.' });
  // Drop reads for deleted announcements while saving.
  const next = Object.fromEntries(Object.entries(reads).filter(([id]) => announcements.some((item) => item.id === id)));
  next[body.announcementId] = { ...(next[body.announcementId] || {}), [body.staffId]: new Date().toISOString() };
  if (body.unread) delete next[body.announcementId][body.staffId];
  const { error } = await db.from('portal_state').upsert({ branch_id: branchId, state_key: READS_KEY, payload: { reads: next }, updated_by: userId }, { onConflict: 'branch_id,state_key' });
  if (error) throw error;
  return res.status(200).json({ staff, reads: next });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, user, profile } = await officeAccess(req, false, 'ca');
    const branchId = await stateBranch(db);
    if (req.query.scope === 'reads') return await announcementReads(req, res, db, branchId, user.id, profile.role === 'super_admin');
    const scope = req.query.scope === 'personal' ? 'personal' : 'workspace';
    const stateKey = scope === 'personal' ? `ca_personal_${user.id}` : WORKSPACE_KEY;
    const { data: existing, error: readError } = await db.from('portal_state').select('payload,updated_at').eq('branch_id', branchId).eq('state_key', stateKey).maybeSingle();
    if (readError) throw readError;

    if (req.method === 'GET') return res.status(200).json({ payload: existing?.payload || null, updatedAt: existing?.updated_at || null });
    if (!['POST', 'PATCH', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
    if (scope === 'workspace' && profile.role !== 'super_admin') return res.status(403).json({ error: 'Only System Admin can update shared CA content.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) return res.status(400).json({ error: 'A valid portal payload is required.' });
    const { data, error } = await db.from('portal_state').upsert({ branch_id: branchId, state_key: stateKey, payload: body.payload, updated_by: user.id }, { onConflict: 'branch_id,state_key' }).select('payload,updated_at').single();
    if (error) throw error;
    return res.status(200).json({ payload: data.payload, updatedAt: data.updated_at });
  } catch (error: any) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to save CA portal content.' });
  }
}
