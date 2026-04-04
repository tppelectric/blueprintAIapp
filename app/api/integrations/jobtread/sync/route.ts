// V2
import { NextResponse } from "next/server";
import type {
  JobtreadCustomer,
  JobtreadDailyLog,
  JobtreadJob,
} from "@/lib/jobtread-client";
import {
  fetchJobtreadCustomers,
  fetchJobtreadDailyLogs,
  fetchJobtreadJobs,
} from "@/lib/jobtread-client";
import { fetchJobtreadRow, getStoredJobtreadApiKey } from "@/lib/jobtread-server-store";
import type { JobtreadIntegrationRow } from "@/lib/jobtread-settings";
import { requireIntegrationAdmin } from "@/lib/require-integration-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";

type ServiceAdmin = ReturnType<typeof createServiceRoleClient>;

export const dynamic = "force-dynamic";

const TARGETS = new Set(["customers", "jobs", "daily_logs"]);

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
    email: c.primaryContact?.email ?? null,
    phone: c.primaryContact?.phone ?? null,
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

async function loadJobtreadJobIdMap(
  admin: ServiceAdmin,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await admin
    .from("jobs")
    .select("id,jobtread_id")
    .not("jobtread_id", "is", null);
  if (error) return map;
  for (const r of data ?? []) {
    const rec = r as { id: string; jobtread_id: string | null };
    if (rec.jobtread_id) map.set(rec.jobtread_id, rec.id);
  }
  return map;
}

async function loadJobtreadCustomerIdMap(
  admin: ServiceAdmin,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await admin
    .from("customers")
    .select("id,jobtread_id")
    .not("jobtread_id", "is", null);
  if (error) return map;
  for (const r of data ?? []) {
    const rec = r as { id: string; jobtread_id: string | null };
    if (rec.jobtread_id) map.set(rec.jobtread_id, rec.id);
  }
  return map;
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

function mapJobtreadStatus(jtStatus: string | null | undefined): string {
  switch (jtStatus?.toLowerCase()) {
    case "created":
      return "Lead";
    case "approved":
      return "Active";
    case "closed":
      return "Complete";
    default:
      return "Lead";
  }
}

async function syncJobsImport(
  admin: ServiceAdmin,
  jobs: JobtreadJob[],
  accountToCustomerId: Map<string, string>,
): Promise<{ count: number; error?: string }> {
  const now = new Date().toISOString();
  const rows = jobs.map((j) => {
    const accountId = j.account?.id;
    const customerId =
      accountId && accountToCustomerId.has(accountId)
        ? accountToCustomerId.get(accountId)!
        : null;
    return {
      job_name: j.name?.trim() || "Job",
      job_number: j.number?.trim() || "",
      jobtread_id: j.id,
      status: mapJobtreadStatus(j.status),
      address: j.location?.address?.trim() || null,
      customer_id: customerId,
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

function jobtreadDailyLogJobLabel(job: JobtreadDailyLog["job"]): string {
  const num = (job.number ?? "").trim();
  const n = (job.name ?? "").trim();
  if (num && n) return `${num} · ${n}`;
  return num || n || "Job";
}

async function upsertDailyLogChunk(
  admin: ServiceAdmin,
  slice: Record<string, unknown>[],
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from("daily_logs").upsert(slice, {
    onConflict: "jobtread_id",
    ignoreDuplicates: false,
  });
  if (!error) return { ok: true };
  return { ok: false, error: error.message };
}

async function syncDailyLogsImport(
  admin: ServiceAdmin,
  logs: JobtreadDailyLog[],
  jobtreadToJobId: Map<string, string>,
): Promise<{ count: number; error?: string }> {
  const rows = logs.map((dl) => {
    const notesParts = [dl.notes, dl.work_completed].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    const notesMerged =
      notesParts.length > 0 ? notesParts.join("\n\n") : null;
    return {
    jobtread_id: dl.id,
    log_date: dl.date,
    job_name: jobtreadDailyLogJobLabel(dl.job),
    job_id: dl.job.id ? jobtreadToJobId.get(dl.job.id) ?? null : null,
    crew_user: null,
    notes: notesMerged,
    employees_onsite: dl.employees_onsite,
    check_in: null,
    check_out: null,
    job_status: dl.job_status,
    trades_onsite: dl.trades_onsite,
    visitors_onsite: dl.visitors_onsite,
    additional_notes: dl.additional_notes,
    materials_used: dl.materials_used,
    materials_needed: null,
    materials_left_onsite: dl.materials_left_onsite,
    equipment_left_onsite: dl.equipment_left_onsite,
    tpp_equipment_left: dl.tpp_equipment_left,
    anticipated_delays: dl.anticipated_delays,
    all_breakers_on: true,
    breakers_off_reason: null,
    supply_receipts: null,
    card_type: null,
    store_receipts: null,
    internal_notes: null,
    };
  });

  let total = 0;
  const chunkSize = 80;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize) as Record<string, unknown>[];
    const res = await upsertDailyLogChunk(admin, slice);
    if (res.ok) {
      total += slice.length;
      continue;
    }
    return {
      count: total,
      error: `${res.error ?? "Daily log upsert failed."} ${JOBTREAD_SCHEMA_HINT}`,
    };
  }
  return { count: total };
}

async function updateIntegrationAfterSuccess(
  admin: ServiceAdmin,
  row: JobtreadIntegrationRow,
  target: "customers" | "jobs" | "daily_logs",
  count: number,
  syncedAt: string,
) {
  const patch: Record<string, unknown> = {
    last_sync_at: syncedAt,
    updated_at: syncedAt,
    connection_message: `Last ${target.replace("_", " ")} sync: ${count} record(s).`,
  };
  if (target === "customers") {
    patch.customers_synced_count = count;
  } else if (target === "jobs") {
    patch.jobs_synced_count = count;
  } else {
    patch.daily_logs_synced_count = count;
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

      const accountToCustomerId = await loadJobtreadCustomerIdMap(admin);
      const { count, error: importErr } = await syncJobsImport(
        admin,
        all,
        accountToCustomerId,
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

    if (target === "daily_logs") {
      const all: JobtreadDailyLog[] = [];
      let page: string | undefined = undefined;
      for (;;) {
        const { nodes, nextPage } = await fetchJobtreadDailyLogs(
          apiKey,
          companyId,
          page,
        );
        all.push(...nodes);
        if (!nextPage) break;
        page = nextPage ?? undefined;
      }

      const jobtreadToJobId = await loadJobtreadJobIdMap(admin);
      const { count, error: importErr } = await syncDailyLogsImport(
        admin,
        all,
        jobtreadToJobId,
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
        await updateIntegrationAfterSuccess(
          admin,
          row,
          "daily_logs",
          count,
          syncedAt,
        );
      }
      return NextResponse.json({
        ok: true,
        target,
        count,
        syncedAt,
        message: `Imported ${count} daily log(s) from JobTread.`,
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
