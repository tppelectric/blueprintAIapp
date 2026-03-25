import { createBrowserClient as createSupabaseSSRBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for Client Components. Uses `@supabase/ssr` so the
 * session is stored in cookies — the same source `middleware` and server
 * `createServerClient` read. Plain `@supabase/supabase-js` `createClient` keeps
 * the session only in localStorage, so after sign-in middleware still sees no
 * user and redirects back to `/login`.
 *
 * We return a **new** client each call so PostgREST requests always attach the
 * current cookie session. A long-lived singleton can be created before sign-in
 * and leave queries running as `anon` after login until a full refresh.
 *
 * Never put `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*`.
 */
export function createBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check .env.local.",
    );
  }

  return createSupabaseSSRBrowserClient(url, anonKey);
}
