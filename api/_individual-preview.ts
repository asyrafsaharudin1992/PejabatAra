// Individual Sign In is a different session from office sign-in. Only the explicitly
// linked System Admin may bridge it to her existing office account for layout previews.
const SYSTEM_ADMIN_OFFICE: Record<string, string> = { ARA0035: 'arasihat@gmail.com' };

export async function individualPreviewAdmin(db: any, staff: { staff_code: string; active?: boolean; password_hash: string | null }, activeEmployee: boolean) {
  const email = SYSTEM_ADMIN_OFFICE[String(staff.staff_code || '').toUpperCase()];
  if (!email || staff.active !== true || !staff.password_hash || !activeEmployee) return null;
  const { data, error } = await db.from('profiles').select('id,email,role,status').eq('email', email).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'active' || data.role !== 'super_admin') return null;
  return { id: data.id, email: data.email };
}
