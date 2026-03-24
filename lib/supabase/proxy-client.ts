import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => {
    const n = c.name.toLowerCase();
    return n.includes("sb-") && n.includes("auth");
  });
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    console.error("[proxy] Missing NEXT_PUBLIC Supabase env");
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  let {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  /** Must stay in sync with browser auth: use `createBrowserClient` from `@/lib/supabase/client` (SSR cookie client). */

  const isPublic =
    path === "/" ||
    path === "/login" ||
    path === "/setup" ||
    path.startsWith("/auth/callback") ||
    path === "/api/setup-status" ||
    path === "/api/setup-first-admin";

  /** Brief pause + second getUser when cookies suggest a session but JWT not visible yet (client just set cookie). */
  if (!user && !isPublic && hasSupabaseAuthCookie(request)) {
    await new Promise((r) => setTimeout(r, 50));
    ({
      data: { user },
    } = await supabase.auth.getUser());
  }

  /**
   * Small delay + re-check before sending unauthenticated users to /login so
   * Set-Cookie from the client can be visible on the next tick (race with SSR).
   */
  if (!user && !isPublic) {
    await new Promise((r) => setTimeout(r, 40));
    ({
      data: { user },
    } = await supabase.auth.getUser());
  }

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    const dest = resolvePostLoginRedirect(next);
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (user && path === "/setup") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}
