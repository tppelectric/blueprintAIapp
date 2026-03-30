import { NextResponse } from "next/server";
import { requireIntegrationAdmin } from "@/lib/require-integration-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export type JobtreadSyncLogRow = {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_synced: number;
  error_message: string | null;
};

/**
 * Recent JobTread sync runs (admin). Service role read; no client table access.
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
  const limitRaw = Number(url.searchParams.get("limit") ?? "40");
  const limit = Math.min(80, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 40));

  const { data, error } = await admin
    .from("jobtread_sync_log")
    .select(
      "id,sync_type,status,started_at,completed_at,records_synced,error_message",
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    entries: (data ?? []) as JobtreadSyncLogRow[],
  });
}
