import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  /** Must stay in sync with browser auth: use `createBrowserClient` from `@/lib/supabase/client` (SSR cookie client). */

  const isPublic =
    path === "/login" ||
    path === "/setup" ||
    path.startsWith("/auth/callback") ||
    path === "/api/setup-status" ||
    path === "/api/setup-first-admin";

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (user && path === "/setup") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}
