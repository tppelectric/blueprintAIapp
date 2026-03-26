import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { parseUserRole } from "@/lib/user-roles";

export type AuthedCompanyAdmin = {
  userId: string;
  email: string;
};

/** Signed-in user with role admin or super_admin (active). */
export async function requireCompanyAdmin(): Promise<AuthedCompanyAdmin | null> {
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
  if (
    !row?.is_active ||
    (role !== "admin" && role !== "super_admin")
  ) {
    return null;
  }

  return {
    userId: user.id,
    email: (user.email ?? "").trim(),
  };
}
