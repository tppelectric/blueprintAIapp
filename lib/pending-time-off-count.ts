import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchPendingTimeOffRequestCount(
  sb: SupabaseClient,
): Promise<number> {
  try {
    const { data, error, count } = await sb
      .from("time_off_requests")
      .select("id", { count: "exact" })
      .eq("status", "pending")
      .limit(0);
    if (error) return 0;
    if (typeof count === "number") return count;
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}
