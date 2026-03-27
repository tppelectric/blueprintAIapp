import { NextResponse } from "next/server";
import { fetchJobtreadRow, getStoredJobtreadApiKey } from "@/lib/jobtread-server-store";
import { requireIntegrationAdmin } from "@/lib/require-integration-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * Validates credentials shape and records a connection check.
 * Full JobTread HTTP verification will replace the stub later.
 */
export async function POST(request: Request) {
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

  let body: { apiKey?: string; companyId?: string } = {};
  try {
    const j = (await request.json()) as { apiKey?: string; companyId?: string };
    body = j ?? {};
  } catch {
    /* allow empty body — use stored values */
  }

  const apiKeyFromBody =
    typeof body.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim()
      : null;
  const storedKey = await getStoredJobtreadApiKey();
  const apiKey = apiKeyFromBody ?? storedKey;

  const row = await fetchJobtreadRow();
  const companyFromBody =
    typeof body.companyId === "string" && body.companyId.trim()
      ? body.companyId.trim()
      : null;
  const companyId = companyFromBody ?? row?.company_id?.trim() ?? "";

  if (!apiKey || !companyId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "API key and Company ID are required (enter in the form or save settings first).",
      },
      { status: 400 },
    );
  }

  const testedAt = new Date().toISOString();

  if (row) {
    const { error } = await admin
      .from("integration_settings")
      .update({
        connection_status: "ok",
        connection_message:
          "Test recorded — JobTread API client not wired yet; credentials accepted.",
        updated_at: testedAt,
      })
      .eq("id", row.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    testedAt,
    message:
      "Credentials look valid locally. Full JobTread API calls will be added in a follow-up.",
  });
}
