import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { canSeeApiCosts, parseUserRole } from "@/lib/user-roles";

/**
 * True when the request is from a signed-in Super Admin or Admin (API cost visibility).
 */
export async function userMayReadApiUsageAggregates(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return false;

  try {
    const admin = createServiceRoleClient();
    const { data: row } = await admin
      .from("user_profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (!row?.is_active) return false;
    return canSeeApiCosts(parseUserRole(row.role as string | undefined));
  } catch {
    return false;
  }
}
