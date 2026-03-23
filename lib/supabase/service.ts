import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client using the service role key. Bypasses RLS — use only in
 * API routes, never expose the key to the browser.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (required to save analysis results).",
    );
  }

  return createClient(url, serviceKey);
}
