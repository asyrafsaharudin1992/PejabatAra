import { createClient } from "@supabase/supabase-js";
import type { PortalUser, UserRole } from "../portalData";
import { withDeviceHeader } from "./device";
import { fetchOfficeIdentity, OfficeIdentityError } from './officeIdentity';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
      // Database policies check the registered-device token on direct reads.
      global: { fetch: (input, init) => fetch(input, withDeviceHeader(init)) },
    })
  : null;

const roleMap: Record<string, UserRole> = {
  super_admin: "Superadmin",
  supervisor: "Supervisor",
  content_editor: "ContentEditor",
  staff: "Staff",
};

export async function getOfficeIdentity() {
  if (!supabase) throw new OfficeIdentityError('Supabase is not configured.', 503);
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new OfficeIdentityError('Please sign in again.', 401);
  return fetchOfficeIdentity(data.session.access_token);
}

export async function signInWithSupabase(email: string, password: string): Promise<PortalUser> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi");

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) throw authError || new Error("Log masuk gagal");

  if (!authData.session) throw new OfficeIdentityError('Please sign in again.', 401);
  const identity = await fetchOfficeIdentity(authData.session.access_token);

  const { data: membership } = await supabase
    .from("staff_branches")
    .select("branches(name)")
    .eq("profile_id", authData.user.id)
    .limit(1)
    .maybeSingle();

  const branchRecord = membership?.branches as unknown as { name?: string } | null;
  return {
    id: authData.user.id,
    email: authData.user.email || email,
    fullName: identity.fullName || authData.user.user_metadata?.full_name || email.split("@")[0],
    role: roleMap[identity.role] || "Staff",
    department: identity.department || "Department not assigned",
    branch: branchRecord?.name || "Cawangan belum ditetapkan",
    status: identity.status,
    lastActive: "Sekarang",
    officeAccess: Array.isArray(authData.user.app_metadata?.office_access) ? authData.user.app_metadata.office_access : [],
  };
}

export async function signOutSupabase() {
  if (supabase) await supabase.auth.signOut();
}
