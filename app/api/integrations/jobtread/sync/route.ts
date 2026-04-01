import { NextResponse } from "next/server";
import type { JobtreadCustomer, JobtreadJob } from "@/lib/jobtread-client";
import {
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
  const s = (jobTreadStatus ?? "").trim().toLowerCase();
  switch (s) {
    case "created":
      return "lead";
    case "approved":
      return "active";
    case "closed":
      return "completed";
    default:
      return "lead";
  }
}

/**
 * If upsert on jobtread_id fails, apply `supabase/jobtread_integration_columns.sql` in Supabase.
 */
const JOBTREAD_SCHEMA_HINT =
  "Ensure supabase/jobtread_integration_columns.sql has been applied (jobtread_id + unique index).";

type CustomerRecordDetail = { name: string };
type JobRecordDetail = { name: string; job_number: string };

type SyncLogBreakdown = {
  recordsCreated: number;
  recordsUpdated: number;
  recordDetails: unknown[];
};

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
      records_created: 0,
      records_updated: 0,
      record_details: [],
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
  breakdown?: SyncLogBreakdown,
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
      ...(breakdown
        ? {
            records_created: breakdown.recordsCreated,
            records_updated: breakdown.recordsUpdated,
            record_details: breakdown.recordDetails,
          }
        : {}),
    })
    .eq("id", logId);
  if (error) {
    console.error("[jobtread sync] jobtread_sync_log update failed:", error.message);
  }
}

async function upsertCustomerChunk(
  admin: ServiceAdmin,
  slice: Record<string, unknown>[],
): Promise<{
  ok: boolean;
  error?: string;
  recordsCreated?: number;
  recordsUpdated?: number;
  recordDetails?: CustomerRecordDetail[];
}> {
  if (slice.length === 0) {
    return {
      ok: true,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordDetails: [],
    };
  }

  const jtIds = [
    ...new Set(
      slice
        .map((r) => r.jobtread_id as string | undefined)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const existingJt = new Set<string>();
  if (jtIds.length > 0) {
    const { data: existingRows, error: selectError } = await admin
      .from("customers")
      .select("jobtread_id")
      .in("jobtread_id", jtIds);
    if (selectError) {
      return { ok: false, error: selectError.message };
    }
    for (const er of existingRows ?? []) {
      if (er.jobtread_id) {
        existingJt.add(String(er.jobtread_id));
      }
    }
  }

  let recordsUpdated = 0;
  let recordsCreated = 0;
  const recordDetails: CustomerRecordDetail[] = [];
  for (const row of slice) {
    const jt = row.jobtread_id as string | undefined;
    if (!jt) continue;
    if (existingJt.has(jt)) {
      recordsUpdated += 1;
    } else {
      recordsCreated += 1;
      recordDetails.push({
        name:
          typeof row.company_name === "string"
            ? row.company_name
            : String(row.company_name ?? ""),
      });
    }
  }

  const { error } = await admin.from("customers").upsert(slice, {
    onConflict: "jobtread_id",
  });
  if (!error) {
    return { ok: true, recordsCreated, recordsUpdated, recordDetails };
  }
  return { ok: false, error: error.message };
}

async function fallbackUpsertCustomers(
  admin: ServiceAdmin,
  slice: Record<string, unknown>[],
): Promise<{
  count: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordDetails: CustomerRecordDetail[];
}> {
  let n = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  const recordDetails: CustomerRecordDetail[] = [];
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
      if (!error) {
        n += 1;
        recordsUpdated += 1;
      }
    } else {
      const { error } = await admin.from("customers").insert(payload);
      if (!error) {
        n += 1;
        recordsCreated += 1;
        recordDetails.push({
          name:
            typeof row.company_name === "string"
              ? row.company_name
              : String(row.company_name ?? ""),
        });
      }
    }
  }
  return { count: n, recordsCreated, recordsUpdated, recordDetails };
}

async function syncCustomersImport(
  admin: ServiceAdmin,
  customers: JobtreadCustomer[],
): Promise<{
  count: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordDetails: CustomerRecordDetail[];
  error?: string;
}> {
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
  let recordsCreated = 0;
  let recordsUpdated = 0;
  const recordDetails: CustomerRecordDetail[] = [];
  const chunkSize = 80;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const res = await upsertCustomerChunk(admin, slice);
    if (res.ok) {
      total += slice.length;
      recordsCreated += res.recordsCreated ?? 0;
      recordsUpdated += res.recordsUpdated ?? 0;
      recordDetails.push(...(res.recordDetails ?? []));
      continue;
    }
    const fb = await fallbackUpsertCustomers(admin, slice);
    total += fb.count;
    recordsCreated += fb.recordsCreated;
    recordsUpdated += fb.recordsUpdated;
    recordDetails.push(...fb.recordDetails);
    if (fb.count < slice.length && res.error) {
      return {
        count: total,
        recordsCreated,
        recordsUpdated,
        recordDetails,
        error: `${res.error}. ${JOBTREAD_SCHEMA_HINT}`,
      };
    }
  }
  return { count: total, recordsCreated, recordsUpdated, recordDetails };
}

async function upsertJobChunk(
  admin: ServiceAdmin,
  slice: Record<string, unknown>[],
): Promise<{
  ok: boolean;
  error?: string;
  recordsCreated?: number;
  recordsUpdated?: number;
  recordDetails?: JobRecordDetail[];
}> {
  if (slice.length === 0) {
    return {
      ok: true,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordDetails: [],
    };
  }

  const jtIds = [
    ...new Set(
      slice
        .map((r) => r.jobtread_id as string | undefined)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const existingByJt = new Map<string, string>();
  if (jtIds.length > 0) {
    const { data: existingRows, error: selectError } = await admin
      .from("jobs")
      .select("id, jobtread_id")
      .in("jobtread_id", jtIds);
    if (selectError) {
      return { ok: false, error: selectError.message };
    }
    for (const er of existingRows ?? []) {
      if (er.jobtread_id && er.id) {
        existingByJt.set(String(er.jobtread_id), String(er.id));
      }
    }
  }

  const toInsert: Record<string, unknown>[] = [];
  let recordsUpdated = 0;

  for (const row of slice) {
    const jt = row.jobtread_id as string | undefined;
    if (!jt) continue;

    const id = existingByJt.get(jt);
    if (id) {
      const { error } = await admin
        .from("jobs")
        .update({
          job_name: row.job_name,
          job_number: row.job_number,
          status: row.status,
          address: row.address,
          customer_id: row.customer_id,
          updated_at: row.updated_at,
        })
        .eq("id", id);
      if (error) {
        return { ok: false, error: error.message };
      }
      recordsUpdated += 1;
    } else {
      toInsert.push(row);
    }
  }

  if (toInsert.length > 0) {
    const { error } = await admin.from("jobs").insert(toInsert);
    if (error) {
      return { ok: false, error: error.message };
    }
  }

  const recordDetails: JobRecordDetail[] = toInsert.map((row) => ({
    name:
      typeof row.job_name === "string"
        ? row.job_name
        : String(row.job_name ?? ""),
    job_number:
      typeof row.job_number === "string"
        ? row.job_number
        : String(row.job_number ?? ""),
  }));

  return {
    ok: true,
    recordsCreated: toInsert.length,
    recordsUpdated,
    recordDetails,
  };
}

async function fallbackUpsertJobs(
  admin: ServiceAdmin,
  slice: Record<string, unknown>[],
): Promise<{
  count: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordDetails: JobRecordDetail[];
}> {
  let n = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  const recordDetails: JobRecordDetail[] = [];
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
      if (!error) {
        n += 1;
        recordsUpdated += 1;
      }
    } else {
      const { error } = await admin.from("jobs").insert(row);
      if (!error) {
        n += 1;
        recordsCreated += 1;
        recordDetails.push({
          name:
            typeof row.job_name === "string"
              ? row.job_name
              : String(row.job_name ?? ""),
          job_number:
            typeof row.job_number === "string"
              ? row.job_number
              : String(row.job_number ?? ""),
        });
      }
    }
  }
  return { count: n, recordsCreated, recordsUpdated, recordDetails };
}

async function syncJobsImport(
  admin: ServiceAdmin,
  jobs: JobtreadJob[],
  locationAccountMap: Map<string, string>,
): Promise<{
  count: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordDetails: JobRecordDetail[];
  error?: string;
}> {
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
  let recordsCreated = 0;
  let recordsUpdated = 0;
  const recordDetails: JobRecordDetail[] = [];
  const chunkSize = 80;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const res = await upsertJobChunk(admin, slice);
    if (res.ok) {
      total += slice.length;
      recordsCreated += res.recordsCreated ?? 0;
      recordsUpdated += res.recordsUpdated ?? 0;
      recordDetails.push(...(res.recordDetails ?? []));
      continue;
    }
    const fb = await fallbackUpsertJobs(admin, slice);
    total += fb.count;
    recordsCreated += fb.recordsCreated;
    recordsUpdated += fb.recordsUpdated;
    recordDetails.push(...fb.recordDetails);
    if (fb.count < slice.length && res.error) {
      return {
        count: total,
        recordsCreated,
        recordsUpdated,
        recordDetails,
        error: `${res.error}. ${JOBTREAD_SCHEMA_HINT}`,
      };
    }
  }
  return { count: total, recordsCreated, recordsUpdated, recordDetails };
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

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
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

      const {
        count,
        recordsCreated,
        recordsUpdated,
        recordDetails,
        error: importErr,
      } = await syncCustomersImport(admin, all);
      const customerBreakdown: SyncLogBreakdown = {
        recordsCreated,
        recordsUpdated,
        recordDetails,
      };
      if (importErr) {
        await finishSyncLog(
          admin,
          logId,
          "failed",
          count,
          importErr,
          customerBreakdown,
        );
        return NextResponse.json({
          ok: false,
          target,
          count,
          syncedAt,
          error: importErr,
        });
      }

      await finishSyncLog(
        admin,
        logId,
        "success",
        count,
        null,
        customerBreakdown,
      );
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

      const {
        count,
        recordsCreated,
        recordsUpdated,
        recordDetails,
        error: importErr,
      } = await syncJobsImport(admin, all, locationAccountMap);
      const jobBreakdown: SyncLogBreakdown = {
        recordsCreated,
        recordsUpdated,
        recordDetails,
      };
      if (importErr) {
        await finishSyncLog(
          admin,
          logId,
          "failed",
          count,
          importErr,
          jobBreakdown,
        );
        return NextResponse.json({
          ok: false,
          target,
          count,
          syncedAt,
          error: importErr,
        });
      }

      await finishSyncLog(
        admin,
        logId,
        "success",
        count,
        null,
        jobBreakdown,
      );
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
