import { createSupabaseRouteClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { canPushReceiptToJobtread, parseUserRole } from "@/lib/user-roles";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type ReceiptJobtreadPushAuth = {
  userId: string;
  admin: ReturnType<typeof createServiceRoleClient>;
};

type Gate =
  | { ok: ReceiptJobtreadPushAuth }
  | { error: NextResponse };

export async function requireReceiptJobtreadPushFromRequest(
  request: NextRequest,
): Promise<Gate> {
  const supabase = createSupabaseRouteClient(request);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return {
      error: NextResponse.json(
        { error: e instanceof Error ? e.message : "Server error." },
        { status: 500 },
      ),
    };
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  const role = parseUserRole(profile?.role as string | undefined);
  if (!profile?.is_active || !canPushReceiptToJobtread(role)) {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: { userId: user.id, admin } };
}

/** Server component / non-route usage (unused today; kept for symmetry). */
export async function requireReceiptJobtreadPushServer(): Promise<ReceiptJobtreadPushAuth | null> {
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

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  const role = parseUserRole(profile?.role as string | undefined);
  if (!profile?.is_active || !canPushReceiptToJobtread(role)) return null;

  return { userId: user.id, admin };
}
