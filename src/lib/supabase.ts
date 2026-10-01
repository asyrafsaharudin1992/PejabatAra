import { createClient } from "@supabase/supabase-js";
import type { PortalUser, UserRole } from "../portalData";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

const roleMap: Record<string, UserRole> = {
  super_admin: "Superadmin",
  supervisor: "Supervisor",
  content_editor: "ContentEditor",
  staff: "Staff",
};

export async function signInWithSupabase(email: string, password: string): Promise<PortalUser> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi");

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) throw authError || new Error("Log masuk gagal");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, department, status")
    .eq("id", authData.user.id)
    .maybeSingle();
  // Authentication is still valid when a newly invited user has not received
  // a profile row yet. Keep the user in the portal with safe staff defaults.
  if (profileError) console.warn("Profile lookup skipped:", profileError.message);

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
    fullName: profile?.full_name || authData.user.user_metadata?.full_name || email.split("@")[0],
    role: roleMap[profile?.role || "staff"] || "Staff",
    department: profile?.department || "Department not assigned",
    branch: branchRecord?.name || "Cawangan belum ditetapkan",
    status: profile?.status || "active",
    lastActive: "Sekarang",
  };
}

export async function signOutSupabase() {
  if (supabase) await supabase.auth.signOut();
}
