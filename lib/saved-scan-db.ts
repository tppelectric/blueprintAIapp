import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAutoScanName } from "@/lib/saved-scan-format";

export { formatAutoScanName };

export async function nextSavedScanIndex(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("saved_scans")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) {
    console.error(
      "[saved_scans] count error:",
      error.message,
      error.details,
      error.hint,
      error.code,
    );
    return 1;
  }
  return (count ?? 0) + 1;
}
