import type { SupabaseClient } from "@supabase/supabase-js";

export async function appendLicenseHistory(
  sb: SupabaseClient,
  licenseId: string,
  eventType: string,
  summary: string,
  detail: Record<string, unknown> | null,
  userId: string | null,
): Promise<void> {
  await sb.from("license_history").insert({
    license_id: licenseId,
    event_type: eventType,
    summary,
    detail,
    created_by: userId,
  });
}
