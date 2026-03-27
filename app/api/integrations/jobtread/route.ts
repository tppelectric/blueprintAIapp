import { NextResponse } from "next/server";
import {
  encryptIntegrationSecret,
  isIntegrationCryptoConfigured,
} from "@/lib/integration-crypto";
import { JOBTREAD_PROVIDER, rowToPublic, type SyncInterval } from "@/lib/jobtread-settings";
import { fetchJobtreadRow } from "@/lib/jobtread-server-store";
import { requireIntegrationAdmin } from "@/lib/require-integration-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireIntegrationAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 },
    );
  }

  try {
    const cryptoOk = isIntegrationCryptoConfigured();
    const row = await fetchJobtreadRow();
    return NextResponse.json({
      settings: rowToPublic(row, cryptoOk),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Load failed." },
      { status: 500 },
    );
  }
}

type PatchBody = {
  companyId?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  autoSyncEnabled?: boolean;
  syncInterval?: SyncInterval;
  importCustomers?: boolean;
  importJobs?: boolean;
  exportDailyLogs?: boolean;
  exportPhotos?: boolean;
  exportTimeEntries?: boolean;
};

export async function PATCH(request: Request) {
  const auth = await requireIntegrationAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 },
    );
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    if (!isIntegrationCryptoConfigured()) {
      return NextResponse.json(
        {
          error:
            "Server misconfiguration: set INTEGRATIONS_ENCRYPTION_KEY to save API keys.",
        },
        { status: 503 },
      );
    }

    const existing = await fetchJobtreadRow();

    let api_key_ciphertext: string | null =
      existing?.api_key_ciphertext ?? null;
    if (body.clearApiKey) {
      api_key_ciphertext = null;
    } else if (typeof body.apiKey === "string" && body.apiKey.trim()) {
      api_key_ciphertext = encryptIntegrationSecret(body.apiKey.trim());
    }

    const company_id =
      typeof body.companyId === "string"
        ? body.companyId.trim() || null
        : (existing?.company_id ?? null);

    const auto_sync_enabled =
      typeof body.autoSyncEnabled === "boolean"
        ? body.autoSyncEnabled
        : (existing?.auto_sync_enabled ?? false);

    const sync_interval: SyncInterval =
      body.syncInterval === "hourly" ||
      body.syncInterval === "daily" ||
      body.syncInterval === "manual"
        ? body.syncInterval
        : ((existing?.sync_interval as SyncInterval) ?? "manual");

    const import_customers =
      typeof body.importCustomers === "boolean"
        ? body.importCustomers
        : (existing?.import_customers ?? true);

    const import_jobs =
      typeof body.importJobs === "boolean"
        ? body.importJobs
        : (existing?.import_jobs ?? true);

    const export_daily_logs =
      typeof body.exportDailyLogs === "boolean"
        ? body.exportDailyLogs
        : (existing?.export_daily_logs ?? false);

    const export_photos =
      typeof body.exportPhotos === "boolean"
        ? body.exportPhotos
        : (existing?.export_photos ?? false);

    const export_time_entries =
      typeof body.exportTimeEntries === "boolean"
        ? body.exportTimeEntries
        : (existing?.export_time_entries ?? false);

    const customers_synced_count =
      existing?.customers_synced_count != null
        ? Number(existing.customers_synced_count)
        : 0;
    const jobs_synced_count =
      existing?.jobs_synced_count != null
        ? Number(existing.jobs_synced_count)
        : 0;

    const payload = {
      provider: JOBTREAD_PROVIDER,
      integration_name: JOBTREAD_PROVIDER,
      company_id,
      api_key_ciphertext,
      auto_sync_enabled,
      sync_interval,
      import_customers,
      import_jobs,
      export_daily_logs,
      export_photos,
      export_time_entries,
      customers_synced_count,
      jobs_synced_count,
      connection_status: existing?.connection_status ?? "unknown",
      connection_message: existing?.connection_message ?? null,
      last_sync_at: existing?.last_sync_at ?? null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await admin
        .from("integration_settings")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("integration_settings").insert(payload);
      if (error) throw new Error(error.message);
    }

    const row = await fetchJobtreadRow();
    return NextResponse.json({
      settings: rowToPublic(row, true),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
