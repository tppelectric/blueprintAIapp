import { NextResponse } from "next/server";
import type { JobtreadCustomer, JobtreadJob } from "@/lib/jobtread-client";
import {
  debugJobTreadStatus,
  fetchJobtreadCustomers,
  fetchJobtreadJobs,
  fetchJobtreadLocationAccountMap,
} from "@/lib/jobtread-client";
import { fetchJobtreadRow, getStoredJobtreadApiKey } from "@/lib/jobtread-server-store";
import type { JobtreadIntegrationRow } from "@/lib/jobtread-settings";
import { requireIntegrationAdmin } from "@/lib/require-integration-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";

type ServiceAdmin = ReturnType<typeof createServiceRoleClient>;

export const dynamic = "force-dynamic";

const TARGETS = new Set(["customers", "jobs", "daily_logs"]);

function mapJobTreadStatus(jobTreadStatus: string | null | undefined): string {
  const s = (jobTreadStatus ?? "").trim();
  switch (s) {
    case "Lead":
      return "lead";
    case "Quoted":
      return "quoted";
    case "In Progress":
      return "active";
    case "On Hold":
      return "on_hold";
    case "Complete":
      return "completed";
    case "Cancelled":
      return "cancelled";
    default:
      return "active";
  }
}

/**
 * If upsert on jobtread_id fails, apply `supabase/jobtread_integration_columns.sql` in Supabase.
 */
const JOBTREAD_SCHEMA_HINT =
  "Ensure supabase/jobtread_integration_columns.sql has been applied (jobtread_id + unique index).";

async function insertSyncLog(
  admin: ServiceAdmin,
  syncType: string,
  userId: string,
): Promise<string | null> {
  const startedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("jobtread_sync_log")
    .insert({
      sync_type: syncType,
      status: "running",
      triggered_by: userId,
      started_at: startedAt,
      records_synced: 0,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[jobtread sync] jobtread_sync_log insert failed:", error.message);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

async function finishSyncLog(
  admin: ServiceAdmin,
  logId: string | null,
  status: "success" | "failed",
  recordsSynced: number,
  errorMessage: string | null,
) {
  if (!logId) return;
  const completedAt = new Date().toISOString();
  const { error } = await admin
    .from("jobtread_sync_log")
    .update({
      status,
      completed_at: completedAt,
      records_synced: recordsSynced,
      error_message: errorMessage,
    })
    .eq("id", logId);
  if (error) {
    console.error("[jobtread sync] jobtread_sync_log update failed:", error.message);
  }
}

async function upsertCustomerChunk(
  admin: ServiceAdmin,
  slice: Record<string, unknown>[],
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from("customers").upsert(slice, {
    onConflict: "jobtread_id",
  });
  if (!error) return { ok: true };
  return { ok: false, error: error.message };
}

async function fallbackUpsertCustomers(
  admin: ServiceAdmin,
  slice: Record<string, unknown>[],
): Promise<number> {
  let n = 0;
  for (const row of slice) {
    const jt = row.jobtread_id as string;
    if (!jt) continue;
    const { data: existing } = await admin
      .from("customers")
      .select("id")
      .eq("jobtread_id", jt)
      .maybeSingle();
    const payload = { ...row };
    if (existing?.id) {
      const { error } = await admin
        .from("customers")
        .update(payload)
        .eq("id", existing.id as string);
      if (!error) n += 1;
    } else {
      const { error } = await admin.from("customers").insert(payload);
      if (!error) n += 1;
    }
  }
  return n;
}

async function syncCustomersImport(
  admin: ServiceAdmin,
  customers: JobtreadCustomer[],
): Promise<{ count: number; error?: string }> {
  const now = new Date().toISOString();
  const rows = customers.map((c) => ({
    jobtread_id: c.id,
    company_name: c.name,
    contact_name: c.primaryContact?.name ?? null,
    email: null,
    phone: null,
    updated_at: now,
  }));

  let total = 0;
  const chunkSize = 80;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const res = await upsertCustomerChunk(admin, slice);
    if (res.ok) {
      total += slice.length;
      continue;
    }
    const fb = await fallbackUpsertCustomers(admin, slice);
    total += fb;
    if (fb < slice.length && res.error) {
      return {
        count: total,
        error: `${res.error}. ${JOBTREAD_SCHEMA_HINT}`,
      };
    }
  }
  return { count: total };
}

async function upsertJobChunk(
  admin: ServiceAdmin,
  slice: Record<string, unknown>[],
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from("jobs").upsert(slice, {
    onConflict: "jobtread_id",
  });
  if (!error) return { ok: true };
  return { ok: false, error: error.message };
}

async function fallbackUpsertJobs(
  admin: ServiceAdmin,
  slice: Record<string, unknown>[],
): Promise<number> {
  let n = 0;
  for (const row of slice) {
    const jt = row.jobtread_id as string;
    if (!jt) continue;
    const { data: existing } = await admin
      .from("jobs")
      .select("id")
      .eq("jobtread_id", jt)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await admin
        .from("jobs")
        .update(row)
        .eq("id", existing.id as string);
      if (!error) n += 1;
    } else {
      const { error } = await admin.from("jobs").insert(row);
      if (!error) n += 1;
    }
  }
  return n;
}

async function syncJobsImport(
  admin: ServiceAdmin,
  jobs: JobtreadJob[],
  locationAccountMap: Map<string, string>,
): Promise<{ count: number; error?: string }> {
  const now = new Date().toISOString();

  const jtCustomerIds = [
    ...new Set(
      jobs
        .map((j) => {
          const locationId = j.location?.id ?? null;
          return locationId
            ? (locationAccountMap.get(locationId) ?? null)
            : null;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const customerMap = new Map<string, string>();
  if (jtCustomerIds.length > 0) {
    const { data: customerRows } = await admin
      .from("customers")
      .select("id, jobtread_id")
      .in("jobtread_id", jtCustomerIds);
    for (const row of customerRows ?? []) {
      if (row.jobtread_id && row.id) {
        customerMap.set(row.jobtread_id, row.id);
      }
    }
  }

  const rows = jobs.map((j) => {
    const locationId = j.location?.id ?? null;
    const jtCustomerId = locationId
      ? (locationAccountMap.get(locationId) ?? null)
      : null;
    return {
      job_name: j.name?.trim() || "Job",
      job_number: j.number?.trim() || "",
      jobtread_id: j.id,
      status: mapJobTreadStatus(j.status),
      address: j.location?.address?.trim() || null,
      customer_id: jtCustomerId
        ? (customerMap.get(jtCustomerId) ?? null)
        : null,
      updated_at: now,
    };
  });

  let total = 0;
  const chunkSize = 80;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const res = await upsertJobChunk(admin, slice);
    if (res.ok) {
      total += slice.length;
      continue;
    }
    const fb = await fallbackUpsertJobs(admin, slice);
    total += fb;
    if (fb < slice.length && res.error) {
      return {
        count: total,
        error: `${res.error}. ${JOBTREAD_SCHEMA_HINT}`,
      };
    }
  }
  return { count: total };
}

async function updateIntegrationAfterSuccess(
  admin: ServiceAdmin,
  row: JobtreadIntegrationRow,
  target: "customers" | "jobs",
  count: number,
  syncedAt: string,
) {
  const patch: Record<string, unknown> = {
    last_sync_at: syncedAt,
    updated_at: syncedAt,
    connection_message: `Last ${target} sync: ${count} record(s).`,
  };
  if (target === "customers") {
    patch.customers_synced_count = count;
  } else {
    patch.jobs_synced_count = count;
  }
  const { error } = await admin
    .from("integration_settings")
    .update(patch)
    .eq("id", row.id);
  if (error) {
    console.error("[jobtread sync] integration_settings update failed:", error.message);
  }
}

/**
 * Manual JobTread import. Query: ?target=customers|jobs|daily_logs
 */
export async function GET(request: Request) {
  const auth = await requireIntegrationAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("debug") === "status") {
    let apiKey: string | null;
    try {
      apiKey = await getStoredJobtreadApiKey();
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Key error." },
        { status: 500 },
      );
    }
    let row: JobtreadIntegrationRow | null;
    try {
      row = await fetchJobtreadRow();
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Settings error." },
        { status: 500 },
      );
    }
    const companyId = row?.company_id?.trim() ?? "";
    if (!apiKey || !companyId) {
      return NextResponse.json(
        { ok: false, error: "JobTread not configured" },
        { status: 400 },
      );
    }
    try {
      const jobs = await debugJobTreadStatus(apiKey, companyId);
      return NextResponse.json({ ok: true, debug: "status", jobs });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Debug fetch failed.";
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
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

  const target = url.searchParams.get("target") ?? "";
  if (!TARGETS.has(target)) {
    return NextResponse.json(
      {
        error: "Query parameter target must be customers, jobs, or daily_logs.",
      },
      { status: 400 },
    );
  }

  if (target === "daily_logs") {
    const syncedAt = new Date().toISOString();
    return NextResponse.json({
      ok: true,
      target,
      syncedAt,
      message: "Daily log export coming soon",
    });
  }

  let apiKey: string | null;
  try {
    apiKey = await getStoredJobtreadApiKey();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Key error." },
      { status: 500 },
    );
  }

  let row: JobtreadIntegrationRow | null;
  try {
    row = await fetchJobtreadRow();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Settings error." },
      { status: 500 },
    );
  }

  const companyId = row?.company_id?.trim() ?? "";
  if (!apiKey || !companyId) {
    return NextResponse.json(
      { ok: false, error: "JobTread not configured" },
      { status: 400 },
    );
  }

  const logId = await insertSyncLog(admin, target, auth.userId);
  const syncedAt = new Date().toISOString();

  try {
    if (target === "customers") {
      const all: JobtreadCustomer[] = [];
      let page: string | undefined = undefined;
      for (;;) {
        const { nodes, nextPage } = await fetchJobtreadCustomers(
          apiKey,
          companyId,
          page,
        );
        all.push(...nodes);
        if (!nextPage) break;
        page = nextPage ?? undefined;
      }

      const { count, error: importErr } = await syncCustomersImport(admin, all);
      if (importErr) {
        await finishSyncLog(admin, logId, "failed", count, importErr);
        return NextResponse.json({
          ok: false,
          target,
          count,
          syncedAt,
          error: importErr,
        });
      }

      await finishSyncLog(admin, logId, "success", count, null);
      if (row) {
        await updateIntegrationAfterSuccess(admin, row, "customers", count, syncedAt);
      }
      return NextResponse.json({
        ok: true,
        target,
        count,
        syncedAt,
        message: `Imported ${count} customer(s) from JobTread.`,
      });
    }

    if (target === "jobs") {
      const all: JobtreadJob[] = [];
      let page: string | undefined = undefined;
      for (;;) {
        const { nodes, nextPage } = await fetchJobtreadJobs(
          apiKey,
          companyId,
          page,
        );
        all.push(...nodes);
        if (!nextPage) break;
        page = nextPage ?? undefined;
      }

      const locationAccountMap = await fetchJobtreadLocationAccountMap(
        apiKey,
        companyId,
      );

      const { count, error: importErr } = await syncJobsImport(
        admin,
        all,
        locationAccountMap,
      );
      if (importErr) {
        await finishSyncLog(admin, logId, "failed", count, importErr);
        return NextResponse.json({
          ok: false,
          target,
          count,
          syncedAt,
          error: importErr,
        });
      }

      await finishSyncLog(admin, logId, "success", count, null);
      if (row) {
        await updateIntegrationAfterSuccess(admin, row, "jobs", count, syncedAt);
      }
      return NextResponse.json({
        ok: true,
        target,
        count,
        syncedAt,
        message: `Imported ${count} job(s) from JobTread.`,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed.";
    await finishSyncLog(admin, logId, "failed", 0, msg);
    return NextResponse.json({
      ok: false,
      target,
      count: 0,
      syncedAt,
      error: msg,
    });
  }

  return NextResponse.json({ ok: false, error: "Unsupported target." }, { status: 400 });
}
