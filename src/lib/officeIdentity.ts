export type OfficeIdentity = { id: string; email: string; fullName: string; role: string; status: 'active'; department: string; officeAccess: string[]; homeOffice: string };
export class OfficeIdentityError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'OfficeIdentityError'; }
}
export async function fetchOfficeIdentity(token: string, request: typeof fetch = fetch): Promise<OfficeIdentity> {
  if (!token) throw new OfficeIdentityError('Please sign in again.', 401);
  let response: Response;
  try { response = await request('/api/status?resource=account', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }); }
  catch { throw new OfficeIdentityError('Unable to verify your account. Check your connection and try again.', 503); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new OfficeIdentityError(data?.error || 'Unable to verify your account. Please try again.', response.status);
  if (!data?.id || !data?.role || data.status !== 'active' || !Array.isArray(data.officeAccess)) throw new OfficeIdentityError('Unable to verify your account. Please try again.', 503);
  return data;
}
