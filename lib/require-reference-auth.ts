import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  canManageReferenceDocuments,
  parseUserRole,
  type UserRole,
} from "@/lib/user-roles";

export type AuthedTeamMember = {
  userId: string;
  email: string;
  role: UserRole | null;
  isActive: boolean;
};

/**
 * Signed-in user with profile row (service role). Returns null if not logged in or inactive.
 */
export async function requireTeamMember(): Promise<AuthedTeamMember | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return null;

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return null;
  }

  const { data: row } = await admin
    .from("user_profiles")
    .select("role,is_active,email")
    .eq("id", user.id)
    .maybeSingle();

  const isActive = row?.is_active !== false;
  if (!isActive) return null;

  const role = parseUserRole(row?.role as string | undefined);
  const email =
    (typeof row?.email === "string" && row.email) ||
    (user.email ?? "").trim();

  return {
    userId: user.id,
    email,
    role,
    isActive: true,
  };
}

export async function requireReferenceAdmin(): Promise<{
  userId: string;
} | null> {
  const m = await requireTeamMember();
  if (!m || !canManageReferenceDocuments(m.role)) return null;
  return { userId: m.userId };
}
