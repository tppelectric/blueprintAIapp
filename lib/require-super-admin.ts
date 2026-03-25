import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { canManageUsers, parseUserRole } from "@/lib/user-roles";

export type AuthedSuperAdmin = {
  userId: string;
  email: string;
};

/**
 * Returns the signed-in user if their profile role is super_admin; otherwise null.
 */
export async function requireSuperAdmin(): Promise<AuthedSuperAdmin | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return null;

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return null;
  }

  const { data: row } = await admin
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  const role = parseUserRole(row?.role as string | undefined);
  if (!row?.is_active || !canManageUsers(role)) return null;

  return {
    userId: user.id,
    email: (user.email ?? "").trim(),
  };
}
