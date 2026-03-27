import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { canManageIntegrations, parseUserRole } from "@/lib/user-roles";

export type AuthedIntegrationAdmin = {
  userId: string;
  email: string;
};

/**
 * Signed-in user with admin or super_admin role (active profile).
 */
export async function requireIntegrationAdmin(): Promise<AuthedIntegrationAdmin | null> {
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
  if (!row?.is_active || !canManageIntegrations(role)) return null;

  return {
    userId: user.id,
    email: (user.email ?? "").trim(),
  };
}
