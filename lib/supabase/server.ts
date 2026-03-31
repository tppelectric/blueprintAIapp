import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { validatePublicSupabaseEnv } from "@/lib/env";

/**
 * Use in Route Handlers: reads auth cookies from the incoming request (same
 * source as `proxy.ts`). `cookies()` from `next/headers` can miss the session
 * on some API routes.
 */
export function createSupabaseRouteClient(request: NextRequest) {
  validatePublicSupabaseEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value, options);
        });
      },
    },
  });
}

export async function createSupabaseServerClient() {
  validatePublicSupabaseEnv();
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anon, {
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
          /* ignore when called from a Server Component that cannot set cookies */
        }
      },
    },
  });
}
