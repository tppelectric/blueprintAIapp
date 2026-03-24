/**
 * Validates required Supabase public env at runtime.
 * Service role is required for server routes that use admin or bypass RLS.
 */
export function validatePublicSupabaseEnv(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
}

export function validateServiceRoleKey(): void {
  validatePublicSupabaseEnv();
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!k) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for this API route.");
  }
}
