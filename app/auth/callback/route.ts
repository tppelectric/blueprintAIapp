import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { validatePublicSupabaseEnv } from "@/lib/env";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";
import { createServiceRoleClient } from "@/lib/supabase/service";

function isSafeRedirectPath(path: string): boolean {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("\\")) return false;
  if (path.includes(":")) return false;
  return true;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextPath = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  try {
    validatePublicSupabaseEnv();
  } catch {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* handled by middleware on subsequent navigation */
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) {
    try {
      const admin = createServiceRoleClient();
      const email = (user.email ?? "").trim();
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const fullName =
        typeof meta?.full_name === "string"
          ? meta.full_name
          : typeof meta?.name === "string"
            ? meta.name
            : "";
      const { data: existing } = await admin
        .from("user_profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (!existing) {
        await admin.from("user_profiles").insert({
          id: user.id,
          email: email || "unknown@user",
          full_name: fullName,
          role: "estimator",
          is_active: true,
        });
      } else if (email) {
        await admin
          .from("user_profiles")
          .update({
            email,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }
    } catch {
      /* table may not exist yet; client GET /api/user-profile will retry */
    }
  }

  const resolved = resolvePostLoginRedirect(nextPath);
  const safeNext = isSafeRedirectPath(resolved) ? resolved : "/dashboard";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
