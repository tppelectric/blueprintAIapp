import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * One shared browser client per tab. Creating a new client on every call
 * instantiates multiple GoTrueClient instances and triggers Supabase warnings.
 */
let browserClient: SupabaseClient | null = null;

/**
 * Browser-safe Supabase client. Use this in Client Components.
 * `NEXT_PUBLIC_*` variables are available in the browser.
 *
 * Never put `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*` or import the
 * service role client from client-side code — that would expose full DB access.
 */
export function createBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check .env.local.",
    );
  }

  browserClient = createClient(url, anonKey);
  return browserClient;
}
