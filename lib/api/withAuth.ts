import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type AuthHandlerContext = {
  user: User;
  supabase: ReturnType<typeof createSupabaseRouteClient>;
};

export type WithAuthOptions = {
  /**
   * When true, require `user_profiles.role === "admin"` and `is_active === true`.
   * (Table is `user_profiles` in this project; read via service role for a reliable check.)
   */
  requireAdmin?: boolean;
};

/**
 * Wraps an App Router handler: validates session with `supabase.auth.getUser()`,
 * returns 401 if unauthenticated, optionally 403 if `requireAdmin` and the user is not an active admin.
 */
export function withAuth(
  handler: (
    request: NextRequest,
    ctx: AuthHandlerContext,
  ) => Promise<Response> | Response,
  options?: WithAuthOptions,
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (options?.requireAdmin) {
      let admin: ReturnType<typeof createServiceRoleClient>;
      try {
        admin = createServiceRoleClient();
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : "Server configuration error (service role).",
          },
          { status: 500 },
        );
      }

      const { data: row } = await admin
        .from("user_profiles")
        .select("role,is_active")
        .eq("id", user.id)
        .maybeSingle();

      if (
        !row?.is_active ||
        !["admin", "super_admin"].includes(row.role ?? "")
      ) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    return handler(request, { user, supabase });
  };
}
