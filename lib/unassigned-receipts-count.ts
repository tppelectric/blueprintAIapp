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

/**
 * Receipts assigned to a job but not yet pushed to JobTread — the "waiting for a
 * super_admin / office_manager sync decision" queue. Used to nudge approvers when
 * employees upload receipts. Returns 0 on any error (badge-only, non-blocking).
 */
export async function fetchPendingJobtreadPushCount(
  sb: SupabaseClient,
): Promise<number> {
  try {
    const { data, error, count } = await sb
      .from("receipts")
      .select("id", { count: "exact" })
      .not("job_id", "is", null)
      .is("pushed_to_jobtread_at", null)
      .limit(0);
    if (error) return 0;
    if (typeof count === "number") return count;
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}
