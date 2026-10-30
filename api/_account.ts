import { activeAccount } from './_office-db.js';

// Return only the authenticated account's identity, verified on the server.
// This avoids relying on a client-side profile query for access decisions.
export async function accountHandler(req: any, res: any, authenticate = activeAccount) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const { user, profile } = await authenticate(req);
    return res.status(200).json({
      id: user.id, email: user.email || '', fullName: profile.full_name || '',
      role: profile.role, status: profile.status, department: profile.department || '',
      officeAccess: Array.isArray(user.app_metadata?.office_access) ? user.app_metadata.office_access.filter((value: unknown) => typeof value === 'string') : [],
      homeOffice: typeof user.app_metadata?.home_office === 'string' ? user.app_metadata.home_office : '',
    });
  } catch (error: any) {
    return res.status(error.status || 503).json({ error: error.status === 401 || error.status === 403 ? error.message : 'Unable to verify account access. Please try again.' });
  }
}
