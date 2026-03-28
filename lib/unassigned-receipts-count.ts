import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchUnassignedReceiptsCount(
  sb: SupabaseClient,
): Promise<number> {
  try {
    const { data, error, count } = await sb
      .from("receipts")
      .select("id", { count: "exact" })
      .is("job_id", null)
      .limit(0);
    if (error) return 0;
    if (typeof count === "number") return count;
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}
