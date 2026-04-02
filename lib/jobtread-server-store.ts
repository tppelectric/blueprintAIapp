import {
  decryptIntegrationSecret,
  isIntegrationCryptoConfigured,
} from "@/lib/integration-crypto";
import { JOBTREAD_PROVIDER, type JobtreadIntegrationRow } from "@/lib/jobtread-settings";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function fetchJobtreadRow(): Promise<JobtreadIntegrationRow | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("integration_settings")
    .select(
      "id,provider,integration_name,company_id,api_key_ciphertext,auto_sync_enabled,sync_interval,import_customers,import_jobs,export_daily_logs,export_photos,export_time_entries,last_sync_at,customers_synced_count,jobs_synced_count,daily_logs_synced_count,connection_status,connection_message,updated_at",
    )
    .eq("provider", JOBTREAD_PROVIDER)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as JobtreadIntegrationRow | null;
}

export async function getStoredJobtreadApiKey(): Promise<string | null> {
  if (!isIntegrationCryptoConfigured()) return null;
  const row = await fetchJobtreadRow();
  const enc = row?.api_key_ciphertext?.trim();
  if (!enc) return null;
  try {
    return decryptIntegrationSecret(enc);
  } catch {
    return null;
  }
}
