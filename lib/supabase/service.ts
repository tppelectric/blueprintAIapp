import { createClient } from "@supabase/supabase-js";
import { validatePublicSupabaseEnv } from "@/lib/env";

/**
 * Server-only client using the service role key. Bypasses RLS — use only in
 * API routes, never expose the key to the browser.
 */
export function createServiceRoleClient() {
  validatePublicSupabaseEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (required for server-side Supabase admin).",
    );
  }

  return createClient(url, serviceKey);
}
