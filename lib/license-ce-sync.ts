import type { SupabaseClient } from "@supabase/supabase-js";

/** Recompute `licenses.ce_hours_completed` from `ce_courses` for one license. */
export async function syncCeHoursCompleted(
  sb: SupabaseClient,
  licenseId: string,
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("ce_courses")
    .select("hours_earned")
    .eq("license_id", licenseId);
  if (error) return { ok: false, error: error.message };
  const total = (data ?? []).reduce(
    (acc, r: { hours_earned?: number | string | null }) =>
      acc + Number(r.hours_earned ?? 0),
    0,
  );
  const { error: up } = await sb
    .from("licenses")
    .update({
      ce_hours_completed: total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", licenseId);
  if (up) return { ok: false, error: up.message };
  return { ok: true, total };
}
