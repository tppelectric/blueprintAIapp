import { NextResponse } from "next/server";
import { fetchJobtreadRow } from "@/lib/jobtread-server-store";
import { requireIntegrationAdmin } from "@/lib/require-integration-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const TARGETS = new Set(["customers", "jobs", "daily_logs"]);

/**
 * Manual sync entrypoint (stub). Query: ?target=customers|jobs|daily_logs
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

  try {
    const row = await fetchJobtreadRow();
    const syncedAt = new Date().toISOString();

    if (row) {
      const { error } = await admin
        .from("integration_settings")
        .update({
          last_sync_at: syncedAt,
          updated_at: syncedAt,
          connection_message:
            `Last manual sync (${target}) — implementation pending; timestamp recorded.`,
        })
        .eq("id", row.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      target,
      syncedAt,
      message:
        "Sync stub completed — JobTread import/export logic will run here later.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
