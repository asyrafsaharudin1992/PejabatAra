import { officeAccess } from './_office-db.js';
import { devicesHandler } from './_devices.js';
import { assessmentHandler } from './_assessment.js';
export default async function handler(req: any, res: any) {
  if (req.query?.resource === 'devices') return devicesHandler(req, res);
  if (req.query?.resource === 'assessment') return assessmentHandler(req, res);
  try { await officeAccess(req); return res.status(200).json({ connected: true }); }
  catch (error: any) { return res.status(error.status || 503).json({ error: error.message }); }
}
