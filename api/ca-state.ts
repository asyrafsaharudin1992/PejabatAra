import { officeAccess } from './_office-db.js';

const BRANCH_NAME = 'AraSpace Clinical Assistants';
const WORKSPACE_KEY = 'ca_workspace';

async function stateBranch(db: any) {
  const { data: existing, error: lookupError } = await db.from('branches').select('id').eq('name', BRANCH_NAME).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id;
  const { data, error } = await db.from('branches').insert({ name: BRANCH_NAME, active: true }).select('id').single();
  if (error) throw error;
  return data.id;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db, user, profile } = await officeAccess(req, false, 'ca');
    const branchId = await stateBranch(db);
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
